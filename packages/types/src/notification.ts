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
