import { isIP } from "node:net";
import { loadProviderReadinessConfig } from "@xlb/config";
import type { WebhookProviderEnvelope } from "@xlb/types";
import type { ProviderFaultPlan } from "../providers/providerSimulation.js";
import { applyProviderFault } from "../providers/providerSimulation.js";

export interface WebhookDeliveryInput {
  callbackUrl: string;
  deliveryId: string;
  eventType: string;
  payload: string;
  signature: string;
  timestamp: string;
}

export interface WebhookProvider {
  readonly kind: "mock" | "https";
  deliver(input: WebhookDeliveryInput): Promise<WebhookProviderEnvelope>;
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

export async function assertSafeHttpsWebhookUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("webhook URL must be credential-free HTTPS on port 443");
  if (url.hostname === "localhost" || isPrivateAddress(url.hostname)) throw new Error("webhook URL cannot target a private host");
  if (isIP(url.hostname) && isPrivateAddress(url.hostname)) throw new Error("webhook URL cannot target a private address");
  return url;
}

export class MockWebhookProvider implements WebhookProvider {
  readonly kind = "mock" as const;

  constructor(private readonly faultPlan: ProviderFaultPlan = {}) {}

  async deliver(input: WebhookDeliveryInput): Promise<WebhookProviderEnvelope> {
    await applyProviderFault("enterprise_webhook", this.faultPlan);
    const success = input.callbackUrl.startsWith("mock://success");
    return { provider: "mock", providerStatus: success ? "delivered_mock" : "failed_mock",
      externalProviderExecuted: false, httpStatus: success ? 200 : 503,
      responseBody: success ? "mock delivery accepted" : "mock retry requested", attemptedAt: new Date().toISOString() };
  }
}

export class BlockedHttpsWebhookProvider implements WebhookProvider {
  readonly kind = "https" as const;
  async deliver(input: WebhookDeliveryInput): Promise<WebhookProviderEnvelope> {
    await assertSafeHttpsWebhookUrl(input.callbackUrl);
    return { provider: "https", providerStatus: "failed_https", externalProviderExecuted: false,
      httpStatus: null, responseBody: "external provider execution is disabled", attemptedAt: new Date().toISOString() };
  }
}

export function createWebhookProvider(callbackUrl: string): WebhookProvider {
  const config = loadProviderReadinessConfig();
  if (callbackUrl.startsWith("mock://")) return new MockWebhookProvider();
  if (callbackUrl.startsWith("https://") && config.enterpriseWebhookProvider === "mock_only") {
    return new BlockedHttpsWebhookProvider();
  }
  throw new Error("unsupported webhook provider scheme");
}
