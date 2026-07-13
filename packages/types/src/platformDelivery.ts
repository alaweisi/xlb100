import type { CityCode } from "./city.js";
import type { OutboxEventType } from "./eventOutbox.js";

export type PlatformSubscriberStatus = "proposed" | "active" | "paused" | "revoked";
export type PlatformSubscriptionStatus = "proposed" | "active" | "paused" | "revoked";
export type PlatformDeliveryStatus =
  | "pending"
  | "processing"
  | "retry_wait"
  | "delivered"
  | "dead_letter";
export type PlatformDeliveryAttemptOutcome =
  | "processing"
  | "delivered"
  | "retry_wait"
  | "dead_letter"
  | "lease_expired";
export type PlatformDeliveryActionKind =
  | "materialized"
  | "reconciliation_repair"
  | "materialization_rejected"
  | "lease_reaped"
  | "manual_retry_requested"
  | "replay_requested"
  | "replay_cancelled";

/**
 * Internal non-human identity boundary. It deliberately cannot represent an
 * Admin, Customer, Worker, Operator, or Auditor bearer-token identity.
 * Production credential verification is a later Gate.
 */
export interface PlatformServiceIdentity {
  identityKind: "platform_service";
  credentialKind: "internal_domain_contract";
  serviceId: string;
  subscriberId: string;
  cityCode: CityCode;
}

export interface PlatformEventSubscriber {
  subscriberId: string;
  stableName: string;
  ownerDomain: string;
  handlerRevision: string;
  purpose: string;
  maxPiiLevel: "P0" | "P1" | "P2";
  status: PlatformSubscriberStatus;
  rowVersion: number;
}

export interface PlatformEventSubscription {
  subscriptionId: string;
  cityCode: CityCode;
  subscriberId: string;
  eventType: OutboxEventType;
  eventMajorVersion: number;
  compatibilityHandlerRevision: string;
  retentionClass: "R1" | "R2" | "R3" | "R4";
  status: PlatformSubscriptionStatus;
  leaseSeconds: number;
  maxAttempts: number;
  rowVersion: number;
}

export interface PlatformEventDelivery {
  deliveryId: string;
  cityCode: CityCode;
  subscriberId: string;
  subscriptionId: string;
  eventId: string;
  eventType: OutboxEventType;
  eventMajorVersion: number;
  payloadHash: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number | null;
  aggregateSequence: number | null;
  status: PlatformDeliveryStatus;
  availableAt: string;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  deliveredAt: string | null;
  deadLetteredAt: string | null;
  rowVersion: number;
}

export interface PlatformDeliveryClaim extends PlatformEventDelivery {
  status: "processing";
  leaseOwner: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface PlatformDeliveryClaimRequest {
  subscriptionId: string;
  owner: string;
  limit?: number;
  leaseSeconds?: number;
}

export interface PlatformDeliveryMutationRequest {
  subscriptionId: string;
  deliveryId: string;
  owner: string;
  leaseToken: string;
  expectedRowVersion: number;
}

export type PlatformDeliveryMutationResult =
  | { outcome: "applied"; status: PlatformDeliveryStatus; rowVersion: number }
  | { outcome: "already_applied"; status: PlatformDeliveryStatus; rowVersion: number }
  | { outcome: "conflict"; status?: PlatformDeliveryStatus; rowVersion?: number };

export interface PlatformMaterializationResult {
  scanned: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  checkpointAdvanced: boolean;
}

export interface PlatformReconciliationResult {
  scannedGaps: number;
  repaired: number;
  duplicates: number;
  rejected: number;
  remainingGaps: boolean;
  commitSkewRisk: boolean;
  completeness: "partial";
}

export interface PlatformOrderCreatedCompatibilityPayload {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  skuId: string;
  totalAmount: number;
  createdAt: string;
}

export interface PlatformSupportTicketResolvedCompatibilityPayload {
  ticketId: string;
  cityCode: CityCode;
  source: "customer" | "worker" | "enterprise" | "admin" | "system";
  type:
    | "order_question"
    | "order_dispute"
    | "service_complaint"
    | "withdrawal_issue"
    | "account_issue"
    | "safety"
    | "other";
  priority: "low" | "normal" | "high" | "urgent" | "critical";
  status: "open" | "processing" | "waiting_requester" | "escalated" | "resolved" | "closed";
  requesterId: string;
  actorId: string | null;
  version: number;
  occurredAt: string;
}

export interface PlatformReviewCreatedV1CompatibilityPayload {
  reviewId: string;
  orderId: string;
  workerId: string;
  rating: number;
  visibility: "pending_moderation";
  occurredAt: string;
}

export interface PlatformReviewCreatedV1CompatibilityProjection
  extends PlatformReviewCreatedV1CompatibilityPayload {
  deliveryId: string;
  cityCode: CityCode;
  subscriberId: string;
  subscriptionId: string;
  eventId: string;
  eventType: "review.created";
  eventMajorVersion: 1;
  payloadHash: string;
  compatibilityHandlerRevision: string;
  aggregateVersion: 1;
  aggregateSequence: 1;
}

export interface PlatformReviewVisibilityChangedV1CompatibilityPayload {
  reviewId: string;
  workerId: string;
  rating: number;
  fromVisibility: "pending_moderation" | "visible" | "hidden";
  toVisibility: "visible" | "hidden";
  moderationVersion: number;
  occurredAt: string;
}

export interface PlatformReviewVisibilityChangedV1CompatibilityProjection
  extends PlatformReviewVisibilityChangedV1CompatibilityPayload {
  deliveryId: string;
  cityCode: CityCode;
  subscriberId: string;
  subscriptionId: string;
  eventId: string;
  eventType: "review.visibility.changed";
  eventMajorVersion: 1;
  payloadHash: string;
  compatibilityHandlerRevision: string;
  aggregateVersion: number;
  aggregateSequence: number;
}

export type PlatformCompatibilityPayload =
  | PlatformOrderCreatedCompatibilityPayload
  | PlatformSupportTicketResolvedCompatibilityPayload
  | PlatformReviewCreatedV1CompatibilityPayload
  | PlatformReviewVisibilityChangedV1CompatibilityPayload;
