import { describe, expect, it } from "vitest";
import {
  outboxErrorCode,
  retryDelaySeconds,
  sanitizeOutboxError,
} from "../../backend/src/events/outboxDeliveryPolicy.js";

describe("outbox delivery policy", () => {
  it("uses bounded exponential retry delays", () => {
    expect([1, 2, 3, 4, 5, 20].map(retryDelaySeconds)).toEqual([1, 2, 4, 8, 16, 256]);
    expect(retryDelaySeconds(99)).toBe(256);
  });

  it("cleans errors and redacts common credentials", () => {
    const error = Object.assign(new Error("failed\n token=abc password:xyz"), { code: "E_CONN!" });
    expect(sanitizeOutboxError(error)).toBe("failed token=[redacted] password=[redacted]");
    expect(outboxErrorCode(error)).toBe("E_CONN_");
    expect(sanitizeOutboxError(new Error("x".repeat(900)))).toHaveLength(512);
  });
});
