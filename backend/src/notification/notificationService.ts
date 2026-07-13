import type {
  NotificationMaterializationResult,
  NotificationMaterializeClaimRequest,
  PlatformServiceIdentity,
} from "@xlb/types";
import {
  notificationMaterializeClaimRequestSchema,
  notificationMaterializeCommandSchema,
  platformDeliveryMutationRequestSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";
import {
  platformDeliveryService,
  PlatformDeliveryService,
} from "../events/platformDeliveryService.js";
import {
  NotificationProjectionError,
} from "./notificationProjectionPolicy.js";
import {
  notificationRepository,
  NotificationRepository,
} from "./notificationRepository.js";

/**
 * Dormant internal service. Nothing registers or schedules it in B1; a later
 * activation gate must supply an exact subscriber/template/live-start policy.
 */
export class NotificationService {
  constructor(
    private readonly platformService: PlatformDeliveryService = platformDeliveryService,
    private readonly repository: NotificationRepository = notificationRepository,
  ) {}

  async materializeClaim(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<NotificationMaterializationResult> {
    const identity = platformServiceIdentitySchema.parse(identityInput);
    const request = notificationMaterializeClaimRequestSchema.parse(
      requestInput,
    ) as NotificationMaterializeClaimRequest;
    const projection = await this.platformService.projectClaimForNotification(
      identity,
      request.claim,
    );
    if (!projection) throw new NotificationProjectionError("CLAIM_NOT_AVAILABLE");
    return this.materializeProjection(identity, request.claim, projection, request.templateRevisionId);
  }

  async materializeClaimWithCurrentTemplate(
    identityInput: unknown,
    claimInput: unknown,
  ): Promise<NotificationMaterializationResult> {
    const identity = platformServiceIdentitySchema.parse(identityInput);
    const claim = platformDeliveryMutationRequestSchema.parse(claimInput);
    const projection = await this.platformService.projectClaimForNotification(identity, claim);
    if (!projection) throw new NotificationProjectionError("CLAIM_NOT_AVAILABLE");
    return this.repository.materializeWithCurrentTemplate(
      projection,
      identity.serviceId,
      (connection) => this.platformService.revalidateNotificationProjectionClaim(
        identity,
        claim,
        projection,
        connection,
      ),
    );
  }

  private async materializeProjection(
    identity: PlatformServiceIdentity,
    claim: NotificationMaterializeClaimRequest["claim"],
    projection: NonNullable<Awaited<ReturnType<PlatformDeliveryService["projectClaimForNotification"]>>>,
    templateRevisionId: string,
  ): Promise<NotificationMaterializationResult> {
    const command = notificationMaterializeCommandSchema.parse({
      projection,
      templateRevisionId,
      actorServiceId: identity.serviceId,
    });
    return this.repository.materialize(
      command,
      (connection) => this.platformService.revalidateNotificationProjectionClaim(
        identity,
        claim,
        projection,
        connection,
      ),
    );
  }
}

export const notificationService = new NotificationService();
