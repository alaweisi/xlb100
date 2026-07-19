import type { PoolConnection } from "mysql2/promise";
import type {
  PlatformDeliveryClaim,
  PlatformDeliveryMutationRequest,
  PlatformServiceIdentity,
  RequestContext,
  WorkerReputation,
} from "@xlb/types";
import {
  platformDeliveryMutationRequestSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { canAccessAdminOperation } from "../auth/operationsAuthorization.js";
import {
  platformDeliveryService,
  PlatformDeliveryService,
} from "../events/platformDeliveryService.js";
import {
  reputationRepository,
  ReputationRepository,
} from "./reputationRepository.js";
import { ReviewForbiddenError } from "./reviewModerationService.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class ReputationService {
  constructor(
    private readonly repository: ReputationRepository = reputationRepository,
    private readonly platformService: PlatformDeliveryService = platformDeliveryService,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async getWorkerSelf(context: RequestContext): Promise<WorkerReputation | null> {
    const cityCode = assertCityScopedContext(context);
    if (context.appType !== "worker" || context.role !== "worker" || !context.userId) {
      throw new ReviewForbiddenError("worker reputation requires Worker self identity");
    }
    return this.repository.findWorkerReputation(cityCode, context.userId);
  }

  async materializeClaim(
    identityInput: unknown,
    claim: PlatformDeliveryClaim,
  ): Promise<{ outcome: "applied" | "reused" }> {
    const identity = platformServiceIdentitySchema.parse(identityInput) as PlatformServiceIdentity;
    const mutation = platformDeliveryMutationRequestSchema.parse({
      subscriptionId: claim.subscriptionId,
      deliveryId: claim.deliveryId,
      owner: claim.leaseOwner,
      leaseToken: claim.leaseToken,
      expectedRowVersion: claim.rowVersion,
    }) as PlatformDeliveryMutationRequest;
    if (claim.eventType === "review.created") {
      const projection = await this.platformService.projectClaimForReviewCreated(identity, mutation);
      if (!projection) throw new Error("exact active review.created claim is unavailable");
      const outcome = await this.transactionRunner(async (connection) => {
        await this.platformService.revalidateReviewCreatedProjectionClaim(
          identity, mutation, projection, connection,
        );
        return this.repository.materializeCreated(connection, projection, identity.serviceId);
      });
      return { outcome };
    }
    if (claim.eventType === "review.visibility.changed") {
      const projection = await this.platformService.projectClaimForReviewVisibilityChanged(
        identity, mutation,
      );
      if (!projection) throw new Error("exact active review.visibility.changed claim is unavailable");
      const outcome = await this.transactionRunner(async (connection) => {
        await this.platformService.revalidateReviewVisibilityChangedProjectionClaim(
          identity, mutation, projection, connection,
        );
        return this.repository.materializeVisibilityChanged(
          connection, projection, identity.serviceId,
        );
      });
      return { outcome };
    }
    throw new Error("Reputation accepts only approved Review exact-v1 deliveries");
  }

  async dryRunRebuild(context: RequestContext): Promise<{
    sourceRowCount: number; visibleRowCount: number; dryRunHash: string;
  }> {
    const cityCode = assertCityScopedContext(context);
    if (!canAccessAdminOperation(context, ["admin", "operator"])
      || !context.userId) {
      throw new ReviewForbiddenError("reputation rebuild dry-run requires scoped Admin or Operator");
    }
    return this.repository.dryRunRebuild(cityCode);
  }
}

export const reputationService = new ReputationService();
