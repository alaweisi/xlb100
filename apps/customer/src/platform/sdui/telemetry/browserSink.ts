import type {
  CustomerSduiTelemetryEvent,
  CustomerSduiTelemetrySink,
} from "./types";

export interface BrowserCustomerSduiTelemetrySinkOptions {
  endpoint: string;
  fetcher?: typeof fetch;
  sendBeacon?: (url: string, data?: BodyInit | null) => boolean;
  baseUrl?: string;
}

function sameOriginEndpoint(endpoint: string, baseUrl: string): string {
  const url = new URL(endpoint, baseUrl);
  const base = new URL(baseUrl);
  if (url.origin !== base.origin || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("Customer SDUI telemetry endpoint must be same-origin HTTP(S)");
  }
  return url.toString();
}

/**
 * Production-capable browser transport. It is created only when an explicit
 * same-origin endpoint is configured; the repository does not invent one.
 */
export class BrowserCustomerSduiTelemetrySink implements CustomerSduiTelemetrySink {
  readonly #endpoint: string;
  readonly #fetcher: typeof fetch;
  readonly #sendBeacon?: (url: string, data?: BodyInit | null) => boolean;

  constructor(options: BrowserCustomerSduiTelemetrySinkOptions) {
    const baseUrl = options.baseUrl ??
      (typeof window === "undefined" ? "http://localhost/" : window.location.href);
    this.#endpoint = sameOriginEndpoint(options.endpoint, baseUrl);
    this.#fetcher = options.fetcher ?? fetch;
    this.#sendBeacon = options.sendBeacon ??
      (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function"
        ? undefined
        : navigator.sendBeacon.bind(navigator));
  }

  async send(events: readonly CustomerSduiTelemetryEvent[]): Promise<void> {
    const body = JSON.stringify({
      schemaVersion: "1.0",
      events,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (this.#sendBeacon?.(this.#endpoint, blob)) return;

    const response = await this.#fetcher(this.#endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      throw new Error(`Customer SDUI telemetry transport failed with ${response.status}`);
    }
  }
}
