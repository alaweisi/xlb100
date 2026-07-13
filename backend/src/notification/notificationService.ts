import type {
  NotificationMaterializationResult,
  NotificationMaterializeClaimRequest,
} from "@xlb/types";
import {
  notificationMaterializeClaimRequestSchema,
  notificationMaterializeCommandSchema,
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
    const command = notificationMaterializeCommandSchema.parse({
      projection,
      templateRevisionId: request.templateRevisionId,
      actorServiceId: identity.serviceId,
    });
    return this.repository.materialize(
      command,
      (connection) => this.platformService.revalidateNotificationProjectionClaim(
        identity,
        request.claim,
        projection,
        connection,
      ),
    );
  }
}

export const notificationService = new NotificationService();
