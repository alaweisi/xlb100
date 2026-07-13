import type { PlatformDeliveryClaim, PlatformServiceIdentity } from "@xlb/types";
import {
  platformDeliveryClaimRequestSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";
import {
  platformDeliveryService,
  PlatformDeliveryService,
} from "../events/platformDeliveryService.js";
import {
  reputationService,
  ReputationService,
} from "./reputationService.js";

export interface ReputationProjectionRunResult {
  claimed: number;
  projected: number;
  reused: number;
  acknowledged: number;
  failed: number;
  conflicts: number;
}

function mutationFromClaim(claim: PlatformDeliveryClaim) {
  return {
    subscriptionId: claim.subscriptionId,
    deliveryId: claim.deliveryId,
    owner: claim.leaseOwner,
    leaseToken: claim.leaseToken,
    expectedRowVersion: claim.rowVersion,
  };
}

/**
 * Dormant internal runner. It has no scheduler, route, seed, backfill, or
 * production activation. Platform exact-v1 subscriptions remain the sole
 * source of work and retain retry/lease/DLQ ownership.
 */
export class ReputationProjectionWorker {
  constructor(
    private readonly platformService: PlatformDeliveryService = platformDeliveryService,
    private readonly targetService: ReputationService = reputationService,
  ) {}

  async runOnce(identityInput: unknown, requestInput: unknown): Promise<ReputationProjectionRunResult> {
    const identity = platformServiceIdentitySchema.parse(identityInput) as PlatformServiceIdentity;
    const request = platformDeliveryClaimRequestSchema.parse(requestInput);
    const claims = await this.platformService.claim(identity, request);
    const result: ReputationProjectionRunResult = {
      claimed: claims.length, projected: 0, reused: 0,
      acknowledged: 0, failed: 0, conflicts: 0,
    };
    for (const claim of claims) {
      const mutation = mutationFromClaim(claim);
      try {
        const projected = await this.targetService.materializeClaim(identity, claim);
        if (projected.outcome === "applied") result.projected += 1;
        else result.reused += 1;
        const acknowledged = await this.platformService.acknowledge(identity, mutation);
        if (acknowledged.outcome === "conflict") result.conflicts += 1;
        else result.acknowledged += 1;
      } catch (error) {
        const failed = await this.platformService.fail(identity, mutation, error);
        if (failed.outcome === "conflict") result.conflicts += 1;
        else result.failed += 1;
      }
    }
    return result;
  }
}

export const reputationProjectionWorker = new ReputationProjectionWorker();
