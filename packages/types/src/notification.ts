import type { CityCode } from "./city.js";
import type { PlatformDeliveryMutationRequest } from "./platformDelivery.js";

export type NotificationRecipientType = "customer" | "worker";
export type NotificationEventType = "order.created" | "support.ticket.resolved";

export interface NotificationOrderCreatedRenderParameters {
  kind: "order_created";
  orderId: string;
}

export interface NotificationSupportTicketResolvedRenderParameters {
  kind: "support_ticket_resolved";
  ticketId: string;
}

/**
 * The only source-derived values that Phase27B may persist for rendering.
 * Recipient-resolution inputs and category-C source fields are intentionally
 * absent from this union.
 */
export type NotificationRenderParameters =
  | NotificationOrderCreatedRenderParameters
  | NotificationSupportTicketResolvedRenderParameters;

/** Public, recipient-scoped inbox navigation reference. */
export type NotificationInboxReference = NotificationRenderParameters;

export type NotificationInboxView = "inbox" | "archive";

export interface NotificationInboxListQuery {
  cursor?: string;
  limit?: number;
  view?: NotificationInboxView;
}

/**
 * Public Customer/Worker inbox DTO. Scope, source-delivery identity, payload
 * hashes and lease metadata are deliberately not part of this contract.
 */
export interface NotificationInboxItem {
  notificationId: string;
  eventType: NotificationEventType;
  templateRevisionId: string;
  title: string;
  body: string;
  reference: NotificationInboxReference;
  occurredAt: string;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  rowVersion: number;
}

export interface NotificationInboxListResponse {
  ok: true;
  items: NotificationInboxItem[];
  nextCursor: string | null;
}

export interface NotificationUnreadCountResponse {
  ok: true;
  unreadCount: number;
}

export interface NotificationMarkReadRequest {
  expectedRowVersion: number;
  idempotencyKey: string;
}

export interface NotificationArchiveRequest extends NotificationMarkReadRequest {
  archived: boolean;
}

export type NotificationStateMutationOutcome = "applied" | "already_applied";

export interface NotificationStateMutationResult {
  outcome: NotificationStateMutationOutcome;
  rowVersion: number;
}

export interface NotificationStateMutationResponse {
  ok: true;
  result: NotificationStateMutationResult;
}

/**
 * Claim-scoped handoff from Platform Delivery to the dormant Notification
 * projection. This is an internal domain contract, never an API DTO.
 */
export interface PlatformNotificationCompatibilityProjection {
  deliveryId: string;
  cityCode: CityCode;
  subscriberId: string;
  subscriptionId: string;
  eventId: string;
  eventType: NotificationEventType;
  eventMajorVersion: 0;
  payloadHash: string;
  compatibilityHandlerRevision: string;
  recipientType: NotificationRecipientType;
  recipientId: string;
  renderParameters: NotificationRenderParameters;
  occurredAt: string;
}

export interface NotificationTemplateRevision {
  templateRevisionId: string;
  templateId: string;
  templateKey: string;
  revisionLabel: string;
  locale: "zh-CN";
  eventType: NotificationEventType;
  parameterKind: NotificationEventType;
  piiCeiling: "P1";
  titleTemplate: string;
  bodyTemplate: string;
  contentHash: string;
  createdAt: string;
}

export interface NotificationRecord {
  notificationId: string;
  cityCode: CityCode;
  recipientType: NotificationRecipientType;
  recipientId: string;
  sourceEventId: string;
  eventType: NotificationEventType;
  templateRevisionId: string;
  renderParameters: NotificationRenderParameters;
  renderParametersHash: string;
  sourcePayloadHash: string;
  targetFingerprint: string;
  occurredAt: string;
  createdAt: string;
  rowVersion: number;
}

export type NotificationReceiptResult = "applied" | "already_applied";

export interface NotificationDeliveryReceipt {
  receiptId: string;
  cityCode: CityCode;
  subscriberId: string;
  eventId: string;
  notificationId: string;
  templateRevisionId: string;
  sourcePayloadHash: string;
  targetFingerprint: string;
  result: NotificationReceiptResult;
  appliedAt: string;
}

export interface NotificationRecipientState {
  stateId: string;
  cityCode: CityCode;
  notificationId: string;
  recipientType: NotificationRecipientType;
  recipientId: string;
  readAt: string | null;
  archivedAt: string | null;
  hiddenAt: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationAction {
  actionId: string;
  cityCode: CityCode;
  notificationId: string;
  recipientType: NotificationRecipientType;
  recipientId: string;
  actionKind: "projection_committed";
  expectedRowVersion: number | null;
  actualRowVersion: number;
  actorServiceId: string;
  traceId: string;
  createdAt: string;
}

/** Minimal non-content deletion evidence; retention execution is not enabled. */
export interface NotificationTombstone {
  tombstoneId: string;
  cityCode: CityCode;
  notificationId: string;
  recipientType: NotificationRecipientType;
  recipientIdHash: string;
  sourceEventId: string;
  templateRevisionId: string;
  payloadHash: string;
  targetFingerprint: string;
  rowVersionCopy: number;
  reasonCode: string;
  createdAt: string;
}

/** Internal repository command; the service entry uses identity + claim request. */
export interface NotificationMaterializeCommand {
  projection: PlatformNotificationCompatibilityProjection;
  templateRevisionId: string;
  actorServiceId: string;
}

/** Lease credentials remain input-only and are verified by Platform Delivery. */
export interface NotificationMaterializeClaimRequest {
  claim: PlatformDeliveryMutationRequest;
  templateRevisionId: string;
}

export interface NotificationMaterializationResult {
  outcome: NotificationReceiptResult;
  notificationId: string;
  receiptId: string;
  stateId: string;
  targetFingerprint: string;
  rowVersion: number;
}
