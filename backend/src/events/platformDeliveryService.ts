import type {
  PlatformDeliveryClaim,
  PlatformDeliveryClaimRequest,
  PlatformDeliveryMutationRequest,
  PlatformDeliveryMutationResult,
  PlatformEventSubscription,
  PlatformMaterializationResult,
  PlatformReconciliationResult,
  PlatformServiceIdentity,
} from "@xlb/types";
import {
  platformDeliveryClaimRequestSchema,
  platformDeliveryMutationRequestSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";
import {
  canonicalPayloadHash,
  PlatformCompatibilityError,
  validateImplicitV0Compatibility,
} from "./platformEventCompatibility.js";
import { projectPlatformDeliveryError } from "./platformDeliveryPolicy.js";
import {
  platformDeliveryRepository,
  PlatformDeliveryRepository,
  type PlatformSourceEventRow,
} from "./platformDeliveryRepository.js";

export class PlatformDeliveryAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformDeliveryAuthorizationError";
  }
}

function assertServiceIdentity(identity: unknown): PlatformServiceIdentity {
  const result = platformServiceIdentitySchema.safeParse(identity);
  if (!result.success) {
    throw new PlatformDeliveryAuthorizationError(
      "registered internal platform service identity is required",
    );
  }
  return result.data;
}

export class PlatformDeliveryService {
  constructor(private readonly repository: PlatformDeliveryRepository = platformDeliveryRepository) {}

  private async requireActiveSubscription(
    identityInput: unknown,
    subscriptionId: string,
  ): Promise<{
    identity: PlatformServiceIdentity;
    subscription: PlatformEventSubscription & { liveStartCreatedAt: Date; liveStartEventId: string };
  }> {
    const identity = assertServiceIdentity(identityInput);
    const subscription = await this.repository.findActiveSubscription(identity, subscriptionId);
    if (!subscription) {
      throw new PlatformDeliveryAuthorizationError(
        "active exact-version subscription for service identity and city is required",
      );
    }
    if (subscription.eventMajorVersion !== 0) {
      throw new PlatformDeliveryAuthorizationError(
        "this Phase27A adapter supports only an approved synthetic compatibility major 0",
      );
    }
    return { identity, subscription };
  }

  private async materializeRows(
    identity: PlatformServiceIdentity,
    subscription: PlatformEventSubscription,
    rows: PlatformSourceEventRow[],
    reason: "materialized" | "reconciliation_repair",
  ): Promise<{ inserted: number; duplicates: number; rejected: number }> {
    let inserted = 0;
    let duplicates = 0;
    let rejected = 0;
    for (const source of rows) {
      const fallbackHash = canonicalPayloadHash(source.payload_json);
      let payloadHash: string;
      try {
        const compatibility = validateImplicitV0Compatibility(
          source.event_type,
          source.city_code,
          subscription.cityCode,
          source.payload_json,
        );
        if (compatibility.eventMajorVersion !== subscription.eventMajorVersion) {
          throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
        }
        payloadHash = compatibility.payloadHash;
      } catch (error) {
        rejected += 1;
        const failure = projectPlatformDeliveryError(error);
        await this.repository.recordMaterializationRejection(
          subscription,
          source,
          fallbackHash,
          identity.serviceId,
          failure,
        );
        continue;
      }
      const created = await this.repository.insertDelivery(
        subscription,
        source,
        payloadHash,
        identity.serviceId,
        reason,
      );
      if (created) inserted += 1;
      else duplicates += 1;
    }
    return { inserted, duplicates, rejected };
  }

  async materializeCandidateBatch(
    identityInput: unknown,
    subscriptionId: string,
    limit = 100,
  ): Promise<PlatformMaterializationResult> {
    const { identity, subscription } = await this.requireActiveSubscription(identityInput, subscriptionId);
    const rows = await this.repository.listCandidateSourceEvents(
      subscription,
      Math.max(1, Math.min(1000, Math.trunc(limit))),
    );
    const counts = await this.materializeRows(identity, subscription, rows, "materialized");
    if (rows.length > 0) {
      await this.repository.advanceCandidateCheckpoint(subscription, rows[rows.length - 1]!, rows.length);
    }
    return {
      scanned: rows.length,
      ...counts,
      checkpointAdvanced: rows.length > 0,
    };
  }

  async reconcileRetainedSource(
    identityInput: unknown,
    subscriptionId: string,
    limit = 1000,
  ): Promise<PlatformReconciliationResult> {
    const { identity, subscription } = await this.requireActiveSubscription(identityInput, subscriptionId);
    const rows = await this.repository.listReconciliationGaps(
      subscription,
      Math.max(1, Math.min(5000, Math.trunc(limit))),
    );
    const counts = await this.materializeRows(identity, subscription, rows, "reconciliation_repair");
    const remainingGaps = await this.repository.hasReconciliationGap(subscription);
    const commitSkewRisk = rows.some((row) => Number(row.commit_skew_risk ?? 0) === 1);
    await this.repository.recordPartialReconciliation(
      subscription,
      rows.map((row) => row.event_id),
    );
    return {
      scannedGaps: rows.length,
      repaired: counts.inserted,
      duplicates: counts.duplicates,
      rejected: counts.rejected,
      remainingGaps,
      commitSkewRisk,
      completeness: "partial",
    };
  }

  async claim(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<PlatformDeliveryClaim[]> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryClaimRequestSchema.parse(requestInput) as PlatformDeliveryClaimRequest;
    const { subscription } = await this.requireActiveSubscription(identity, request.subscriptionId);
    return this.repository.claim(identity, subscription, request);
  }

  async acknowledge(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<PlatformDeliveryMutationResult> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    await this.requireActiveSubscription(identity, request.subscriptionId);
    return this.repository.acknowledge(identity, request);
  }

  async fail(
    identityInput: unknown,
    requestInput: unknown,
    error: unknown,
  ): Promise<PlatformDeliveryMutationResult> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    await this.requireActiveSubscription(identity, request.subscriptionId);
    return this.repository.fail(identity, request, error);
  }

  async reapExpiredLeases(
    identityInput: unknown,
    subscriptionId: string,
    limit = 100,
  ): Promise<number> {
    const { identity } = await this.requireActiveSubscription(identityInput, subscriptionId);
    return this.repository.reapExpired(identity, subscriptionId, limit);
  }
}

export const platformDeliveryService = new PlatformDeliveryService();
