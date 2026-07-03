import { describe, it, expect } from "vitest";
import { isPaymentAlreadyPaid, canProcessMockWebhook } from "../../backend/src/payment/paymentIdempotency.js";

describe("paymentIdempotency", () => {
  it("detects already paid status", () => {
    expect(isPaymentAlreadyPaid("paid")).toBe(true);
    expect(isPaymentAlreadyPaid("pending")).toBe(false);
  });

  it("allows mock webhook for pending or paid", () => {
    expect(canProcessMockWebhook("pending")).toBe(true);
    expect(canProcessMockWebhook("paid")).toBe(true);
    expect(canProcessMockWebhook("failed")).toBe(false);
  });
});
