import { describe, expect, it } from "vitest";
import { MockSmsProvider } from "../../backend/src/providers/sms/mockSmsProvider.js";

const input = {
  recipient: "13800138000",
  code: "123456",
  purpose: "customer_login" as const,
  expiresAt: "2026-07-16T10:05:00.000Z",
};

describe("mock SMS provider", () => {
  it("accepts an OTP locally without exposing its value or claiming delivery", async () => {
    const envelope = await new MockSmsProvider().sendLoginOtp(input);
    expect(envelope).toMatchObject({
      provider: "mock",
      providerStatus: "accepted_mock",
      externalProviderExecuted: false,
      recipientMasked: "138****8000",
    });
    expect(JSON.stringify(envelope)).not.toContain(input.code);
    expect(envelope.messageId).toMatch(/^sms_mock_[a-f0-9]{24}$/u);
  });

  it("models rate limiting with retry metadata", async () => {
    const provider = new MockSmsProvider({ transport: "rate_limited", retryAfterMs: 5_000 });
    await expect(provider.sendLoginOtp(input)).rejects.toMatchObject({
      code: "SIMULATED_RATE_LIMIT",
      retryable: true,
      retryAfterMs: 5_000,
      externalProviderExecuted: false,
    });
  });
});
