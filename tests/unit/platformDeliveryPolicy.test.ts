import { describe, expect, it } from "vitest";
import {
  PLATFORM_DELIVERY_DEVELOPMENT_DEFAULTS,
  PLATFORM_DELIVERY_CANONICAL_ERRORS,
  PlatformDeliveryCanonicalError,
  platformRetryDelaySeconds,
  projectPlatformDeliveryError,
} from "../../backend/src/events/platformDeliveryPolicy.js";
import {
  canonicalPayloadHash,
  validateImplicitV0Compatibility,
} from "../../backend/src/events/platformEventCompatibility.js";

describe("Platform Delivery policy", () => {
  it("marks bounded defaults as development-only and uses bounded exponential retry", () => {
    expect(PLATFORM_DELIVERY_DEVELOPMENT_DEFAULTS).toMatchObject({
      leaseSeconds: 30,
      maxAttempts: 5,
      maxClaimBatch: 25,
    });
    expect([1, 2, 3, 4, 5, 99].map(platformRetryDelaySeconds)).toEqual([1, 2, 4, 8, 16, 256]);
  });

  it("maps every untrusted failure shape to the fixed generic projection", () => {
    const rawValues = [
      '{"phone":"13800138000","name":"张三"}',
      "手机号 13800138000，地址 杭州市西湖区测试路 1 号",
      "token=secret-token credential=secret-credential",
      "Authorization: Bearer raw-access-token",
      "Provider body: payment declined for customer 张三",
      "<html><body>provider error</body></html>",
      "<error><credential>xml-secret</credential></error>",
      "first line\nsecond line\r\nthird line",
    ];
    const untrusted: unknown[] = [
      ...rawValues.map((value) => new Error(value)),
      ...rawValues,
      { code: "CUSTOM_PROVIDER_CODE", message: rawValues.join("|") },
      { code: "INVALID_EVENT_PAYLOAD", message: "spoofed approved code" },
      Object.assign(new Error("spoofed approved code"), { code: "LEASE_EXPIRED" }),
      { providerBody: { html: rawValues[5], token: "raw-access-token" } },
    ];

    for (const failure of untrusted) {
      const projected = projectPlatformDeliveryError(failure);
      expect(projected).toEqual({
        code: "PLATFORM_DELIVERY_ERROR",
        message: "platform delivery failed",
      });
      for (const raw of rawValues) {
        expect(JSON.stringify(projected)).not.toContain(raw);
      }
    }
  });

  it("retains only a controlled internal canonical code with its fixed message", () => {
    const approved = new PlatformDeliveryCanonicalError("INVALID_EVENT_PAYLOAD");
    Object.defineProperty(approved, "message", {
      value: "Authorization: Bearer must-never-persist",
      configurable: true,
    });
    expect(projectPlatformDeliveryError(approved)).toEqual({
      code: "INVALID_EVENT_PAYLOAD",
      message: PLATFORM_DELIVERY_CANONICAL_ERRORS.INVALID_EVENT_PAYLOAD,
    });
  });

  it("hashes canonical objects deterministically and enforces city equality", () => {
    expect(canonicalPayloadHash({ b: 2, a: 1 })).toBe(canonicalPayloadHash({ a: 1, b: 2 }));
    const payload = {
      orderId: "ord-1",
      cityCode: "hangzhou",
      customerId: "customer-1",
      skuId: "sku-1",
      totalAmount: 88,
      createdAt: "2026-07-13T08:00:00.000Z",
    };
    expect(validateImplicitV0Compatibility("order.created", "hangzhou", "hangzhou", payload))
      .toMatchObject({ eventMajorVersion: 0 });
    expect(() => validateImplicitV0Compatibility("order.created", "shanghai", "hangzhou", payload))
      .toThrow(PLATFORM_DELIVERY_CANONICAL_ERRORS.CITY_SCOPE_MISMATCH);
  });
});
