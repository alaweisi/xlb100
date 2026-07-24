import type { CustomerSduiComponentType } from "@xlb/types";
import { CustomerSduiTelemetryClient } from "./client";
import type { CustomerSduiTelemetryContext } from "./types";

export interface CustomerSduiExposureOptions {
  client: CustomerSduiTelemetryClient;
  context: CustomerSduiTelemetryContext;
  componentType: CustomerSduiComponentType;
  componentInstanceId: string;
  threshold?: number;
  minimumVisibleMs?: number;
  clock?: () => number;
  attributes?: unknown;
  onExposure?: () => void;
}

export class CustomerSduiExposureMonitor {
  readonly #options: Required<Pick<CustomerSduiExposureOptions, "threshold" | "minimumVisibleMs" | "clock">> &
    Omit<CustomerSduiExposureOptions, "threshold" | "minimumVisibleMs" | "clock">;
  #visibleSince: number | null = null;
  #lastRatio = 0;
  #exposed = false;

  constructor(options: CustomerSduiExposureOptions) {
    this.#options = {
      ...options,
      threshold: Math.min(1, Math.max(0, options.threshold ?? 0.5)),
      minimumVisibleMs: Math.max(0, options.minimumVisibleMs ?? 1_000),
      clock: options.clock ?? (() => Date.now()),
    };
  }

  updateVisibility(visibleRatio: number, at = this.#options.clock()): boolean {
    if (this.#exposed) return false;
    this.#lastRatio = Math.min(1, Math.max(0, visibleRatio));
    if (this.#lastRatio < this.#options.threshold) {
      this.#visibleSince = null;
      return false;
    }
    if (this.#visibleSince === null) this.#visibleSince = at;
    return this.tick(at);
  }

  tick(at = this.#options.clock()): boolean {
    if (this.#exposed || this.#visibleSince === null) return false;
    const visibleDuration = Math.max(0, at - this.#visibleSince);
    if (visibleDuration < this.#options.minimumVisibleMs) return false;

    this.#exposed = true;
    this.#options.client.track({
      name: "component.exposure",
      outcome: "succeeded",
      context: this.#options.context,
      componentType: this.#options.componentType,
      componentInstanceId: this.#options.componentInstanceId,
      durationMs: visibleDuration,
      attributes: {
        visibleRatio: this.#lastRatio,
        threshold: this.#options.threshold,
        ...(typeof this.#options.attributes === "object" && this.#options.attributes !== null
          ? this.#options.attributes
          : {}),
      },
    });
    try {
      this.#options.onExposure?.();
    } catch {
      // Exposure observers never affect rendering.
    }
    return true;
  }

  isExposed(): boolean {
    return this.#exposed;
  }
}

export interface CustomerSduiExposureObserverHandle {
  supported: boolean;
  monitor: CustomerSduiExposureMonitor;
  disconnect(): void;
}

/** DOM adapter only. React hook integration is intentionally deferred until P8. */
export function observeCustomerSduiComponent(
  target: Element,
  options: CustomerSduiExposureOptions,
): CustomerSduiExposureObserverHandle {
  const threshold = Math.min(1, Math.max(0, options.threshold ?? 0.5));
  const minimumVisibleMs = Math.max(0, options.minimumVisibleMs ?? 1_000);
  const monitor = new CustomerSduiExposureMonitor({
    ...options,
    threshold,
    minimumVisibleMs,
  });
  if (typeof globalThis.IntersectionObserver !== "function") {
    return { supported: false, monitor, disconnect() {} };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRatio = 0;
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const update = (visibleRatio: number) => {
    clearTimer();
    const documentVisible = typeof document === "undefined" ||
      document.visibilityState !== "hidden";
    monitor.updateVisibility(documentVisible ? visibleRatio : 0);
    if (documentVisible && visibleRatio >= threshold && !monitor.isExposed()) {
      timer = setTimeout(() => monitor.tick(), minimumVisibleMs);
    }
  };
  const observer = new IntersectionObserver((entries) => {
    const entry = entries.find((candidate) => candidate.target === target);
    if (!entry) return;
    lastRatio = entry.intersectionRatio;
    update(lastRatio);
  }, { threshold: [threshold] });
  const onVisibilityChange = () => update(lastRatio);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  observer.observe(target);

  return {
    supported: true,
    monitor,
    disconnect() {
      clearTimer();
      observer.disconnect();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    },
  };
}
