import { describe, expect, it } from "vitest";
import {
  notificationActionSchema,
  notificationDeliveryReceiptSchema,
  notificationMaterializationResultSchema,
  notificationMaterializeClaimRequestSchema,
  notificationMaterializeCommandSchema,
  notificationRecipientStateSchema,
  notificationRecordSchema,
  notificationRenderParametersSchema,
  notificationTemplateRevisionSchema,
  notificationTombstoneSchema,
  platformNotificationCompatibilityProjectionSchema,
} from "@xlb/validators";

const hash = "a".repeat(64);
const timestamp = "2026-07-13T08:00:00.000Z";

const orderProjection = {
  deliveryId: "delivery-1",
  cityCode: "hangzhou",
  subscriberId: "notification-projection",
  subscriptionId: "subscription-1",
  eventId: "event-1",
  eventType: "order.created",
  eventMajorVersion: 0,
  payloadHash: hash,
  compatibilityHandlerRevision: "implicit-v0-order-created-r1",
  recipientType: "customer",
  recipientId: "customer-1",
  renderParameters: { kind: "order_created", orderId: "order-1" },
  occurredAt: timestamp,
} as const;

describe("Phase27B Notification foundation contract", () => {
  it("accepts only the claim-scoped minimal compatibility projection", () => {
    expect(platformNotificationCompatibilityProjectionSchema.parse(orderProjection)).toEqual(orderProjection);

    for (const invalid of [
      { ...orderProjection, cityCode: "__global__" },
      { ...orderProjection, eventMajorVersion: 1 },
      { ...orderProjection, payloadHash: "not-sha256" },
      { ...orderProjection, recipientType: "worker" },
      { ...orderProjection, renderParameters: { kind: "support_ticket_resolved", ticketId: "ticket-1" } },
    ]) {
      expect(platformNotificationCompatibilityProjectionSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("does not expose lease credentials, raw payload, or category-C/PII fields", () => {
    for (const forbidden of [
      { leaseOwner: "worker-a" },
      { leaseToken: "96bc3e0f-88fa-4f6a-94dd-cbfbda6220df" },
      { deliveryRowVersion: 2 },
      { payload: { customerId: "customer-1" } },
      { skuId: "sku-1" },
      { totalAmount: 88 },
      { phone: "13800000000" },
      { address: "private" },
      { resolutionNote: "private" },
    ]) {
      expect(platformNotificationCompatibilityProjectionSchema.safeParse({ ...orderProjection, ...forbidden }).success)
        .toBe(false);
    }
  });

  it("uses a strict discriminated render-parameter union without enrichment", () => {
    expect(notificationRenderParametersSchema.parse({ kind: "order_created", orderId: "order-1" }))
      .toEqual({ kind: "order_created", orderId: "order-1" });
    expect(notificationRenderParametersSchema.parse({ kind: "support_ticket_resolved", ticketId: "ticket-1" }))
      .toEqual({ kind: "support_ticket_resolved", ticketId: "ticket-1" });
    expect(notificationRenderParametersSchema.safeParse({
      kind: "order_created",
      orderId: "order-1",
      occurredAt: timestamp,
    }).success).toBe(false);
    expect(notificationRenderParametersSchema.safeParse({
      kind: "support_ticket_resolved",
      ticketId: "ticket-1",
      subject: "private",
    }).success).toBe(false);
  });

  it("separates input-only claim credentials from the sanitized repository command", () => {
    const claimRequest = {
      claim: {
        subscriptionId: "subscription-1",
        deliveryId: "delivery-1",
        owner: "notification-worker-a",
        leaseToken: "96bc3e0f-88fa-4f6a-94dd-cbfbda6220df",
        expectedRowVersion: 2,
      },
      templateRevisionId: "template-revision-1",
    };
    expect(notificationMaterializeClaimRequestSchema.parse(claimRequest)).toEqual(claimRequest);
    expect(notificationMaterializeCommandSchema.parse({
      projection: orderProjection,
      templateRevisionId: "template-revision-1",
      actorServiceId: "notification-projection",
    })).not.toHaveProperty("projection.leaseToken");
    expect(notificationMaterializeClaimRequestSchema.safeParse({
      ...claimRequest,
      recipientId: "customer-1",
    }).success).toBe(false);
  });

  it("validates strict dormant template, record, receipt, state, action, tombstone and result shapes", () => {
    const revision = {
      templateRevisionId: "template-revision-1",
      templateId: "template-1",
      templateKey: "order.created.in_app",
      revisionLabel: "r1",
      locale: "zh-CN",
      eventType: "order.created",
      parameterKind: "order.created",
      piiCeiling: "P1",
      titleTemplate: "订单已创建",
      bodyTemplate: "订单 {{orderId}} 已创建",
      contentHash: hash,
      createdAt: timestamp,
    } as const;
    const record = {
      notificationId: "notification-1",
      cityCode: "hangzhou",
      recipientType: "customer",
      recipientId: "customer-1",
      sourceEventId: "event-1",
      eventType: "order.created",
      templateRevisionId: "template-revision-1",
      renderParameters: { kind: "order_created", orderId: "order-1" },
      renderParametersHash: hash,
      sourcePayloadHash: hash,
      targetFingerprint: hash,
      occurredAt: timestamp,
      createdAt: timestamp,
      rowVersion: 1,
    } as const;

    expect(notificationTemplateRevisionSchema.parse(revision)).toEqual(revision);
    expect(notificationRecordSchema.parse(record)).toEqual(record);
    expect(notificationDeliveryReceiptSchema.safeParse({
      receiptId: "receipt-1", cityCode: "hangzhou", subscriberId: "notification-projection",
      eventId: "event-1", notificationId: "notification-1",
      templateRevisionId: "template-revision-1", sourcePayloadHash: hash, targetFingerprint: hash,
      result: "applied", appliedAt: timestamp,
    }).success).toBe(true);
    expect(notificationRecipientStateSchema.safeParse({
      stateId: "state-1", cityCode: "hangzhou", notificationId: "notification-1",
      recipientType: "customer", recipientId: "customer-1", readAt: null,
      archivedAt: null, hiddenAt: null, rowVersion: 1,
      createdAt: timestamp, updatedAt: timestamp,
    }).success).toBe(true);
    expect(notificationActionSchema.safeParse({
      actionId: "action-1", cityCode: "hangzhou", notificationId: "notification-1",
      recipientType: "customer", recipientId: "customer-1", actionKind: "projection_committed",
      expectedRowVersion: null, actualRowVersion: 1, actorServiceId: "notification-projection",
      traceId: "trace-1", createdAt: timestamp,
    }).success).toBe(true);
    expect(notificationTombstoneSchema.safeParse({
      tombstoneId: "tombstone-1", cityCode: "hangzhou", notificationId: "notification-1",
      recipientType: "customer", recipientIdHash: hash, sourceEventId: "event-1",
      templateRevisionId: "template-revision-1", payloadHash: hash, targetFingerprint: hash,
      rowVersionCopy: 1, reasonCode: "RETENTION_POLICY", createdAt: timestamp,
    }).success).toBe(true);
    expect(notificationMaterializationResultSchema.safeParse({
      outcome: "already_applied", notificationId: "notification-1", receiptId: "receipt-1",
      stateId: "state-1", targetFingerprint: hash, rowVersion: 1,
    }).success).toBe(true);

    expect(notificationTemplateRevisionSchema.safeParse({ ...revision, active: true }).success).toBe(false);
    expect(notificationRecordSchema.safeParse({ ...record, archivedAt: timestamp }).success).toBe(false);
    expect(notificationTombstoneSchema.safeParse({
      tombstoneId: "tombstone-1", cityCode: "hangzhou", notificationId: "notification-1",
      recipientType: "customer", recipientId: "customer-1", sourceEventId: "event-1",
      templateRevisionId: "template-revision-1", payloadHash: hash, targetFingerprint: hash,
      rowVersionCopy: 1, reasonCode: "RETENTION_POLICY", createdAt: timestamp,
    }).success).toBe(false);
  });
});
