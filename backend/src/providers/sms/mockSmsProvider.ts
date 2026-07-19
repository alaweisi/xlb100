import { createHash } from "node:crypto";
import { loadProviderReadinessConfig } from "@xlb/config";
import type { ProviderFaultPlan } from "../providerSimulation.js";
import { applyProviderFault, SimulatedProviderError } from "../providerSimulation.js";

export type SmsPurpose = "customer_login" | "worker_login" | "admin_login" | "oa_login" | "dashboard_login";

export interface SendLoginOtpInput {
  recipient: string;
  code: string;
  purpose: SmsPurpose;
  expiresAt: string;
}

export interface SmsProviderEnvelope {
  provider: "mock";
  providerStatus: "accepted_mock";
  externalProviderExecuted: false;
  messageId: string;
  recipientMasked: string;
  acceptedAt: string;
}

export interface SmsProvider {
  readonly kind: "mock";
  sendLoginOtp(input: SendLoginOtpInput): Promise<SmsProviderEnvelope>;
}

function maskRecipient(recipient: string): string {
  if (/^1[3-9]\d{9}$/u.test(recipient)) {
    return `${recipient.slice(0, 3)}****${recipient.slice(-4)}`;
  }
  if (recipient.length <= 2) return "**";
  return `${recipient.slice(0, 1)}***${recipient.slice(-1)}`;
}

export class MockSmsProvider implements SmsProvider {
  readonly kind = "mock" as const;

  constructor(private readonly faultPlan: ProviderFaultPlan = {}) {}

  async sendLoginOtp(input: SendLoginOtpInput): Promise<SmsProviderEnvelope> {
    await applyProviderFault("sms", this.faultPlan);
    const messageId = `sms_mock_${createHash("sha256")
      .update(`${input.purpose}:${input.recipient}:${input.expiresAt}`)
      .digest("hex")
      .slice(0, 24)}`;
    return {
      provider: "mock",
      providerStatus: "accepted_mock",
      externalProviderExecuted: false,
      messageId,
      recipientMasked: maskRecipient(input.recipient),
      acceptedAt: new Date().toISOString(),
    };
  }
}

export function createSmsProvider(): SmsProvider {
  const config = loadProviderReadinessConfig();
  if (config.smsProvider === "mock") return new MockSmsProvider();
  throw new SimulatedProviderError("sms", "SIMULATED_PERMANENT_FAILURE", false);
}

export const smsProvider = createSmsProvider();
