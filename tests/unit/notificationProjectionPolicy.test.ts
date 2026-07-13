import { describe, expect, it } from "vitest";
import type { PlatformNotificationCompatibilityProjection } from "@xlb/types";
import {
  notificationTargetFingerprint,
  NotificationProjectionError,
  renderNotificationTemplate,
} from "../../backend/src/notification/notificationProjectionPolicy.js";
import {
  projectImplicitV0NotificationCompatibility,
} from "../../backend/src/events/platformEventCompatibility.js";

const projection: PlatformNotificationCompatibilityProjection = {
  deliveryId: "delivery-1",
  cityCode: "hangzhou",
  subscriberId: "notification-subscriber",
  subscriptionId: "notification-order-created",
  eventId: "event-1",
  eventType: "order.created",
  eventMajorVersion: 0,
  payloadHash: "a".repeat(64),
  compatibilityHandlerRevision: "implicit-v0-order-created-r1",
  recipientType: "customer",
  recipientId: "customer-1",
  renderParameters: { kind: "order_created", orderId: "order-1" },
  occurredAt: "2026-07-13T08:00:00.000Z",
};

describe("Phase27B Notification projection policy", () => {
  it("freezes a deterministic target fingerprint across key ordering", () => {
    expect(notificationTargetFingerprint(projection, "revision-1")).toMatch(/^[a-f0-9]{64}$/);
    expect(notificationTargetFingerprint(projection, "revision-1")).toBe(
      notificationTargetFingerprint({ ...projection }, "revision-1"),
    );
    expect(notificationTargetFingerprint(projection, "revision-2")).not.toBe(
      notificationTargetFingerprint(projection, "revision-1"),
    );
  });

  it("renders only the event-specific minimal allowlist", () => {
    expect(renderNotificationTemplate(projection, {
      eventType: "order.created",
      recipientType: "customer",
      parameterNames: ["orderId"],
      titleTemplate: "订单已创建",
      bodyTemplate: "订单 {{orderId}} 已创建",
    })).toEqual({ title: "订单已创建", body: "订单 order-1 已创建" });

    expect(() => renderNotificationTemplate(projection, {
      eventType: "order.created",
      recipientType: "customer",
      parameterNames: ["orderId"],
      titleTemplate: "订单已创建",
      bodyTemplate: "电话 {{phone}}",
    })).toThrow(NotificationProjectionError);
    expect(() => renderNotificationTemplate(projection, {
      eventType: "order.created",
      recipientType: "customer",
      parameterNames: ["orderId"],
      titleTemplate: "订单已创建",
      bodyTemplate: "<script>alert(1)</script>",
    })).toThrow(NotificationProjectionError);
  });

  it("validates the full source shape but drops recipient-only and discard fields", () => {
    const projected = projectImplicitV0NotificationCompatibility(
      "order.created",
      "hangzhou",
      "hangzhou",
      {
        orderId: "order-1",
        cityCode: "hangzhou",
        customerId: "customer-1",
        skuId: "private-sku",
        totalAmount: 88,
        createdAt: "2026-07-13T08:00:00.000Z",
      },
    );
    expect(projected).toMatchObject({
      eventMajorVersion: 0,
      recipientType: "customer",
      recipientId: "customer-1",
      renderParameters: { kind: "order_created", orderId: "order-1" },
    });
    expect(JSON.stringify(projected)).not.toContain("private-sku");
    expect(JSON.stringify(projected)).not.toContain("totalAmount");
    expect(JSON.stringify(projected)).not.toContain("cityCode");
  });
});
