import { describe, expect, it } from "vitest";
import { assertWebhookSignature, canonicalWebhookPayload, signWebhook, verifyWebhookSignature } from "../../backend/src/enterprise/enterpriseCrypto.js";

const secret = "phase19-receiver-secret";
const timestamp = "2026-07-10T00:00:00.000Z";
const payload = JSON.stringify({ id: "evt_1", type: "order.created" });
const signature = signWebhook(secret, timestamp, payload);

describe("enterprise webhook signature verification", () => {
  it("accepts an authentic HMAC over the exact timestamp and raw payload", () => {
    expect(verifyWebhookSignature(secret, timestamp, payload, signature)).toBe(true);
    expect(() => assertWebhookSignature(secret, timestamp, payload, signature)).not.toThrow();
    expect(canonicalWebhookPayload({ type: "order.created", id: "evt_1" })).toBe(canonicalWebhookPayload({ id: "evt_1", type: "order.created" }));
  });

  it("rejects a payload or timestamp changed after signing", () => {
    expect(() => assertWebhookSignature(secret, timestamp, `${payload} `, signature)).toThrow("invalid webhook signature");
    expect(() => assertWebhookSignature(secret, `${timestamp}-tampered`, payload, signature)).toThrow("invalid webhook signature");
  });

  it("rejects forged and malformed signatures", () => {
    expect(() => assertWebhookSignature(secret, timestamp, payload, `v1=${"0".repeat(64)}`)).toThrow("invalid webhook signature");
    expect(() => assertWebhookSignature(secret, timestamp, payload, "v1=malformed")).toThrow("invalid webhook signature");
  });
});
