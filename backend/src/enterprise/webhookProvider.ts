import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { WebhookProviderEnvelope } from "@xlb/types";

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
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("webhook URL resolved to a private address");
  return url;
}

export class MockWebhookProvider implements WebhookProvider {
  readonly kind = "mock" as const;
  async deliver(input: WebhookDeliveryInput): Promise<WebhookProviderEnvelope> {
    const success = input.callbackUrl.startsWith("mock://success");
    return { provider: "mock", providerStatus: success ? "delivered_mock" : "failed_mock",
      externalProviderExecuted: false, httpStatus: success ? 200 : 503,
      responseBody: success ? "mock delivery accepted" : "mock retry requested", attemptedAt: new Date().toISOString() };
  }
}

export class HttpsWebhookProvider implements WebhookProvider {
  readonly kind = "https" as const;
  async deliver(input: WebhookDeliveryInput): Promise<WebhookProviderEnvelope> {
    const url = await assertSafeHttpsWebhookUrl(input.callbackUrl);
    try {
      const response = await fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", "X-XLB-Delivery-Id": input.deliveryId,
          "X-XLB-Event": input.eventType, "X-XLB-Timestamp": input.timestamp, "X-XLB-Signature": input.signature },
        body: input.payload });
      const body = (await response.text()).slice(0, 1000);
      return { provider: "https", providerStatus: response.ok ? "delivered_https" : "failed_https",
        externalProviderExecuted: true, httpStatus: response.status, responseBody: body, attemptedAt: new Date().toISOString() };
    } catch (error) {
      return { provider: "https", providerStatus: "failed_https", externalProviderExecuted: true,
        httpStatus: null, responseBody: error instanceof Error ? error.message.slice(0, 1000) : "HTTPS delivery failed",
        attemptedAt: new Date().toISOString() };
    }
  }
}

export function createWebhookProvider(callbackUrl: string): WebhookProvider {
  if (callbackUrl.startsWith("mock://")) return new MockWebhookProvider();
  if (callbackUrl.startsWith("https://")) return new HttpsWebhookProvider();
  throw new Error("unsupported webhook provider scheme");
}
