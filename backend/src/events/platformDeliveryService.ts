import type {
  PlatformDeliveryClaim,
  PlatformDeliveryClaimRequest,
  PlatformDeliveryMutationRequest,
  PlatformDeliveryMutationResult,
  PlatformNotificationCompatibilityProjection,
  PlatformEventSubscription,
  PlatformMaterializationResult,
  PlatformReconciliationResult,
  PlatformServiceIdentity,
  PlatformReviewCreatedV1CompatibilityProjection,
  PlatformReviewVisibilityChangedV1CompatibilityProjection,
  PlatformMarketingCompensationV0CompatibilityProjection,
} from "@xlb/types";
import {
  platformDeliveryClaimRequestSchema,
  platformDeliveryMutationRequestSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";
import type { PoolConnection } from "mysql2/promise";
import {
  canonicalPayloadHash,
  isApprovedPlatformEventVersion,
  PlatformCompatibilityError,
  projectImplicitV0NotificationCompatibility,
  projectReviewCreatedV1Compatibility,
  projectReviewVisibilityChangedV1Compatibility,
  projectMarketingCompensationV0Compatibility,
  validateVersionedPlatformCompatibility,
} from "./platformEventCompatibility.js";
import { projectPlatformDeliveryError } from "./platformDeliveryPolicy.js";
import {
  platformDeliveryRepository,
  PlatformDeliveryRepository,
  type PlatformSourceEventRow,
  type PlatformClaimCompatibilitySourceRow,
} from "./platformDeliveryRepository.js";

function projectNotificationCompatibilitySource(
  source: PlatformClaimCompatibilitySourceRow,
): PlatformNotificationCompatibilityProjection {
  if (
    (source.event_type !== "order.created" && source.event_type !== "support.ticket.resolved") ||
    Number(source.event_major_version) !== 0
  ) {
    throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
  }
  const projected = projectImplicitV0NotificationCompatibility(
    source.event_type,
    source.city_code,
    source.city_code,
    source.payload_json,
  );
  if (projected.payloadHash !== source.payload_hash) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  return {
    deliveryId: source.delivery_id,
    cityCode: source.city_code,
    subscriberId: source.subscriber_id,
    subscriptionId: source.subscription_id,
    eventId: source.event_id,
    eventType: source.event_type,
    eventMajorVersion: 0,
    payloadHash: source.payload_hash,
    compatibilityHandlerRevision: source.compatibility_handler_revision,
    recipientType: projected.recipientType,
    recipientId: projected.recipientId,
    renderParameters: projected.renderParameters,
    occurredAt: projected.occurredAt,
  };
}

function sameNotificationProjection(
  left: PlatformNotificationCompatibilityProjection,
  right: PlatformNotificationCompatibilityProjection,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function projectReviewCreatedCompatibilitySource(
  source: PlatformClaimCompatibilitySourceRow,
): PlatformReviewCreatedV1CompatibilityProjection {
  if (source.event_type !== "review.created" || Number(source.event_major_version) !== 1) {
    throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
  }
  const projected = projectReviewCreatedV1Compatibility(
    source.city_code,
    source.city_code,
    source.payload_json,
  );
  if (projected.payloadHash !== source.payload_hash) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  if (
    source.aggregate_type !== "order_review" ||
    source.aggregate_id !== projected.reviewId ||
    Number(source.aggregate_version) !== 1 ||
    Number(source.aggregate_sequence) !== 1
  ) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  return {
    deliveryId: source.delivery_id,
    cityCode: source.city_code,
    subscriberId: source.subscriber_id,
    subscriptionId: source.subscription_id,
    eventId: source.event_id,
    eventType: "review.created",
    eventMajorVersion: 1,
    payloadHash: source.payload_hash,
    compatibilityHandlerRevision: source.compatibility_handler_revision,
    aggregateVersion: 1,
    aggregateSequence: 1,
    reviewId: projected.reviewId,
    orderId: projected.orderId,
    workerId: projected.workerId,
    rating: projected.rating,
    visibility: projected.visibility,
    occurredAt: projected.occurredAt,
  };
}

function sameReviewCreatedProjection(
  left: PlatformReviewCreatedV1CompatibilityProjection,
  right: PlatformReviewCreatedV1CompatibilityProjection,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function projectReviewVisibilityChangedCompatibilitySource(
  source: PlatformClaimCompatibilitySourceRow,
): PlatformReviewVisibilityChangedV1CompatibilityProjection {
  if (
    source.event_type !== "review.visibility.changed" ||
    Number(source.event_major_version) !== 1
  ) {
    throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
  }
  const projected = projectReviewVisibilityChangedV1Compatibility(
    source.city_code,
    source.city_code,
    source.payload_json,
  );
  if (projected.payloadHash !== source.payload_hash) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  if (
    source.aggregate_type !== "order_review" ||
    source.aggregate_id !== projected.reviewId ||
    Number(source.aggregate_version) !== projected.moderationVersion ||
    Number(source.aggregate_sequence) !== projected.moderationVersion
  ) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  return {
    deliveryId: source.delivery_id,
    cityCode: source.city_code,
    subscriberId: source.subscriber_id,
    subscriptionId: source.subscription_id,
    eventId: source.event_id,
    eventType: "review.visibility.changed",
    eventMajorVersion: 1,
    payloadHash: source.payload_hash,
    compatibilityHandlerRevision: source.compatibility_handler_revision,
    aggregateVersion: projected.moderationVersion,
    aggregateSequence: projected.moderationVersion,
    reviewId: projected.reviewId,
    workerId: projected.workerId,
    rating: projected.rating,
    fromVisibility: projected.fromVisibility,
    toVisibility: projected.toVisibility,
    moderationVersion: projected.moderationVersion,
    occurredAt: projected.occurredAt,
  };
}

function sameReviewVisibilityChangedProjection(
  left: PlatformReviewVisibilityChangedV1CompatibilityProjection,
  right: PlatformReviewVisibilityChangedV1CompatibilityProjection,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function projectMarketingCompensationCompatibilitySource(
  source: PlatformClaimCompatibilitySourceRow,
): PlatformMarketingCompensationV0CompatibilityProjection {
  if (
    (source.event_type !== "order.reverse.applied" && source.event_type !== "refund.approved") ||
    Number(source.event_major_version) !== 0
  ) {
    throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
  }
  const projected = projectMarketingCompensationV0Compatibility(
    source.event_type,
    source.city_code,
    source.city_code,
    source.payload_json,
  );
  if (projected.payloadHash !== source.payload_hash) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  const isCancellation = source.event_type === "order.reverse.applied";
  const triggerId = isCancellation
    ? (projected as { reverseRequestId: string }).reverseRequestId
    : (projected as { refundId: string }).refundId;
  if (
    source.aggregate_type !== (isCancellation ? "order_reverse" : "refund") ||
    source.aggregate_id !== triggerId
  ) {
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  return {
    deliveryId: source.delivery_id,
    cityCode: source.city_code,
    subscriberId: source.subscriber_id,
    subscriptionId: source.subscription_id,
    eventId: source.event_id,
    eventType: source.event_type,
    eventMajorVersion: 0,
    payloadHash: source.payload_hash,
    compatibilityHandlerRevision: source.compatibility_handler_revision,
    triggerType: isCancellation ? "order_cancellation" : "full_refund",
    triggerId,
    orderId: projected.orderId,
    customerId: isCancellation ? null : (projected as { customerId: string }).customerId,
    refundAmount: isCancellation ? null : (projected as { amount: number }).amount,
    refundCurrency: isCancellation ? null : (projected as { currency: "CNY" }).currency,
    occurredAt: isCancellation ? null : (projected as { approvedAt: string }).approvedAt,
  };
}

function sameMarketingCompensationProjection(
  left: PlatformMarketingCompensationV0CompatibilityProjection,
  right: PlatformMarketingCompensationV0CompatibilityProjection,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

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
    if (!isApprovedPlatformEventVersion(subscription.eventType, subscription.eventMajorVersion)) {
      throw new PlatformDeliveryAuthorizationError(
        "subscription event type and exact major version have no approved compatibility handler",
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
      let aggregateVersion: number | null = null;
      let aggregateSequence: number | null = null;
      try {
        if (Number(source.event_major_version) !== subscription.eventMajorVersion) {
          throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
        }
        const compatibility = validateVersionedPlatformCompatibility(
          source.event_type,
          Number(source.event_major_version),
          source.city_code,
          subscription.cityCode,
          source.payload_json,
        );
        if (compatibility.eventMajorVersion !== subscription.eventMajorVersion) {
          throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
        }
        payloadHash = compatibility.payloadHash;
        if (source.event_type === "review.created" && Number(source.event_major_version) === 1) {
          const review = projectReviewCreatedV1Compatibility(
            source.city_code, subscription.cityCode, source.payload_json,
          );
          if (source.aggregate_type !== "order_review" || source.aggregate_id !== review.reviewId) {
            throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
          }
          aggregateVersion = 1;
          aggregateSequence = 1;
        } else if (
          source.event_type === "review.visibility.changed" &&
          Number(source.event_major_version) === 1
        ) {
          const review = projectReviewVisibilityChangedV1Compatibility(
            source.city_code, subscription.cityCode, source.payload_json,
          );
          if (source.aggregate_type !== "order_review" || source.aggregate_id !== review.reviewId) {
            throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
          }
          aggregateVersion = review.moderationVersion;
          aggregateSequence = review.moderationVersion;
        }
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
        aggregateVersion,
        aggregateSequence,
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

  async projectClaimForNotification(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<PlatformNotificationCompatibilityProjection | null> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const { subscription } = await this.requireActiveSubscription(identity, request.subscriptionId);
    const source = await this.repository.readClaimCompatibilitySource(identity, request);
    if (!source) return null;
    if (
      (source.event_type !== "order.created" && source.event_type !== "support.ticket.resolved") ||
      source.event_type !== subscription.eventType ||
      Number(source.event_major_version) !== subscription.eventMajorVersion ||
      source.compatibility_handler_revision !== subscription.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
    }
    return projectNotificationCompatibilitySource(source);
  }

  async projectClaimForReviewCreated(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<PlatformReviewCreatedV1CompatibilityProjection | null> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const { subscription } = await this.requireActiveSubscription(identity, request.subscriptionId);
    const source = await this.repository.readClaimCompatibilitySource(identity, request);
    if (!source) return null;
    if (
      source.event_type !== "review.created" ||
      source.event_type !== subscription.eventType ||
      Number(source.event_major_version) !== 1 ||
      subscription.eventMajorVersion !== 1 ||
      source.compatibility_handler_revision !== subscription.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
    }
    return projectReviewCreatedCompatibilitySource(source);
  }

  async projectClaimForReviewVisibilityChanged(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<PlatformReviewVisibilityChangedV1CompatibilityProjection | null> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const { subscription } = await this.requireActiveSubscription(identity, request.subscriptionId);
    const source = await this.repository.readClaimCompatibilitySource(identity, request);
    if (!source) return null;
    if (
      source.event_type !== "review.visibility.changed" ||
      source.event_type !== subscription.eventType ||
      Number(source.event_major_version) !== 1 ||
      subscription.eventMajorVersion !== 1 ||
      source.compatibility_handler_revision !== subscription.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
    }
    return projectReviewVisibilityChangedCompatibilitySource(source);
  }

  async projectClaimForMarketingCompensation(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<PlatformMarketingCompensationV0CompatibilityProjection | null> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const { subscription } = await this.requireActiveSubscription(identity, request.subscriptionId);
    const source = await this.repository.readClaimCompatibilitySource(identity, request);
    if (!source) return null;
    if (
      (source.event_type !== "order.reverse.applied" && source.event_type !== "refund.approved") ||
      source.event_type !== subscription.eventType ||
      Number(source.event_major_version) !== 0 ||
      subscription.eventMajorVersion !== 0 ||
      source.compatibility_handler_revision !== subscription.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
    }
    return projectMarketingCompensationCompatibilitySource(source);
  }

  /**
   * Revalidates the complete claim/source/subscription projection while the
   * Notification target transaction holds row locks. Raw payload remains
   * inside the Events boundary and never crosses this method.
   */
  async revalidateNotificationProjectionClaim(
    identityInput: unknown,
    requestInput: unknown,
    expectedProjection: PlatformNotificationCompatibilityProjection,
    connection: PoolConnection,
  ): Promise<void> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const source = await this.repository.readClaimCompatibilitySource(
      identity,
      request,
      connection,
      true,
    );
    if (!source) {
      throw new PlatformDeliveryAuthorizationError("exact active notification claim is required");
    }
    const currentPayloadHash = canonicalPayloadHash(source.payload_json);
    if (
      source.source_snapshot_consistent === false ||
      currentPayloadHash !== source.payload_hash ||
      currentPayloadHash !== expectedProjection.payloadHash ||
      source.compatibility_handler_revision !== expectedProjection.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
    const currentProjection = projectNotificationCompatibilitySource(source);
    if (!sameNotificationProjection(currentProjection, expectedProjection)) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
  }

  async revalidateReviewCreatedProjectionClaim(
    identityInput: unknown,
    requestInput: unknown,
    expectedProjection: PlatformReviewCreatedV1CompatibilityProjection,
    connection: PoolConnection,
  ): Promise<void> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const source = await this.repository.readClaimCompatibilitySource(
      identity,
      request,
      connection,
      true,
    );
    if (!source) {
      throw new PlatformDeliveryAuthorizationError("exact active review.created claim is required");
    }
    const currentPayloadHash = canonicalPayloadHash(source.payload_json);
    if (
      source.source_snapshot_consistent === false ||
      source.event_type !== "review.created" ||
      Number(source.event_major_version) !== 1 ||
      currentPayloadHash !== source.payload_hash ||
      currentPayloadHash !== expectedProjection.payloadHash ||
      source.compatibility_handler_revision !== expectedProjection.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
    const currentProjection = projectReviewCreatedCompatibilitySource(source);
    if (!sameReviewCreatedProjection(currentProjection, expectedProjection)) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
  }

  async revalidateReviewVisibilityChangedProjectionClaim(
    identityInput: unknown,
    requestInput: unknown,
    expectedProjection: PlatformReviewVisibilityChangedV1CompatibilityProjection,
    connection: PoolConnection,
  ): Promise<void> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const source = await this.repository.readClaimCompatibilitySource(
      identity,
      request,
      connection,
      true,
    );
    if (!source) {
      throw new PlatformDeliveryAuthorizationError(
        "exact active review.visibility.changed claim is required",
      );
    }
    const currentPayloadHash = canonicalPayloadHash(source.payload_json);
    if (
      source.source_snapshot_consistent === false ||
      source.event_type !== "review.visibility.changed" ||
      Number(source.event_major_version) !== 1 ||
      currentPayloadHash !== source.payload_hash ||
      currentPayloadHash !== expectedProjection.payloadHash ||
      source.compatibility_handler_revision !== expectedProjection.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
    const currentProjection = projectReviewVisibilityChangedCompatibilitySource(source);
    if (!sameReviewVisibilityChangedProjection(currentProjection, expectedProjection)) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
  }

  async revalidateMarketingCompensationProjectionClaim(
    identityInput: unknown,
    requestInput: unknown,
    expectedProjection: PlatformMarketingCompensationV0CompatibilityProjection,
    connection: PoolConnection,
  ): Promise<void> {
    const identity = assertServiceIdentity(identityInput);
    const request = platformDeliveryMutationRequestSchema.parse(requestInput) as PlatformDeliveryMutationRequest;
    const source = await this.repository.readClaimCompatibilitySource(
      identity,
      request,
      connection,
      true,
    );
    if (!source) {
      throw new PlatformDeliveryAuthorizationError("exact active Marketing compensation claim is required");
    }
    const currentPayloadHash = canonicalPayloadHash(source.payload_json);
    if (
      source.source_snapshot_consistent === false ||
      (source.event_type !== "order.reverse.applied" && source.event_type !== "refund.approved") ||
      Number(source.event_major_version) !== 0 ||
      currentPayloadHash !== source.payload_hash ||
      currentPayloadHash !== expectedProjection.payloadHash ||
      source.compatibility_handler_revision !== expectedProjection.compatibilityHandlerRevision
    ) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
    const currentProjection = projectMarketingCompensationCompatibilitySource(source);
    if (!sameMarketingCompensationProjection(currentProjection, expectedProjection)) {
      throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
    }
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
