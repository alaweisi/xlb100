import { describe, expect, it } from "vitest";
import type {
  CustomerSduiTelemetryContext,
  CustomerSduiTelemetryEvent,
  CustomerSduiTelemetrySink,
} from "../../apps/customer/src/platform/sdui/telemetry/types";
import {
  CustomerSduiTelemetryClient,
} from "../../apps/customer/src/platform/sdui/telemetry/client";
import { CustomerSduiPerformanceTracker } from "../../apps/customer/src/platform/sdui/telemetry/performance";
import { reportCustomerSduiError } from "../../apps/customer/src/platform/sdui/telemetry/errors";
import {
  CustomerSduiExposureMonitor,
  observeCustomerSduiComponent,
} from "../../apps/customer/src/platform/sdui/telemetry/exposure";

const context: CustomerSduiTelemetryContext = {
  pageId: "customer.home",
  pageViewId: "page-view-1",
  appVersion: "1.0.0",
  manifestId: "customer.home.default",
  manifestRevision: "revision-7",
  schemaVersion: "1.0",
};

class RecordingSink implements CustomerSduiTelemetrySink {
  readonly events: CustomerSduiTelemetryEvent[] = [];
  failuresRemaining = 0;

  async send(events: readonly CustomerSduiTelemetryEvent[]): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("telemetry unavailable");
    }
    this.events.push(...events);
  }
}

function clientFor(sink: CustomerSduiTelemetrySink, options: { maxBufferSize?: number } = {}) {
  let id = 0;
  return new CustomerSduiTelemetryClient({
    sink,
    ...options,
    now: () => new Date("2026-07-23T00:00:00.000Z"),
    createEventId: () => `event-${++id}`,
  });
}

describe("Customer SDUI P9 telemetry foundation", () => {
  it("records structural correlation and drops non-allowlisted or free-form attributes", async () => {
    const sink = new RecordingSink();
    const client = clientFor(sink);

    client.track({
      name: "component.render",
      outcome: "succeeded",
      context,
      componentType: "service_grid",
      componentInstanceId: "home-services",
      attributes: {
        phase: "render",
        reasonCode: "ready",
        fallbackReason: "13800000000",
        customerPhone: "13800000000",
        errorName: "contains free form text",
      },
    });
    await client.flush();

    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      eventId: "event-1",
      sequence: 1,
      manifestRevision: "revision-7",
      componentType: "service_grid",
      componentInstanceId: "home-services",
      attributes: { phase: "render", reasonCode: "ready" },
    });
    expect(JSON.stringify(sink.events[0])).not.toContain("13800000000");
    expect(JSON.stringify(sink.events[0])).not.toContain("contains free form text");
  });

  it("normalizes invalid exposure options before constructing a DOM observer", () => {
    const originalObserver = globalThis.IntersectionObserver;
    let observerThreshold: number | number[] | undefined;

    class FakeIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds: readonly number[] = [];

      constructor(
        _callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        observerThreshold = options?.threshold;
      }

      disconnect() {}
      observe() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
      unobserve() {}
    }

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: FakeIntersectionObserver,
    });

    try {
      const handle = observeCustomerSduiComponent({} as Element, {
        client: clientFor(new RecordingSink()),
        context,
        componentType: "service_grid",
        componentInstanceId: "home-services",
        threshold: 4,
        minimumVisibleMs: -10,
      });

      expect(handle.supported).toBe(true);
      expect(observerThreshold).toEqual([1]);
      handle.disconnect();
    } finally {
      Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        value: originalObserver,
      });
    }
  });

  it("never throws into the customer path and retains a failed batch for retry", async () => {
    const sink = new RecordingSink();
    sink.failuresRemaining = 1;
    const client = clientFor(sink);
    client.track({ name: "manifest.load", outcome: "failed", context });

    await expect(client.flush()).resolves.toMatchObject({ delivered: false, bufferedEvents: 1 });
    await expect(client.flush()).resolves.toMatchObject({ delivered: true, bufferedEvents: 0 });
    expect(sink.events).toHaveLength(1);
  });

  it("bounds memory and counts dropped events", () => {
    const client = clientFor(new RecordingSink(), { maxBufferSize: 2 });
    client.track({ name: "manifest.load", outcome: "started", context });
    client.track({ name: "manifest.load", outcome: "succeeded", context });
    client.track({ name: "composition.render", outcome: "succeeded", context });

    expect(client.snapshot()).toMatchObject({ bufferedEvents: 2, droppedEvents: 1 });
  });

  it("measures a span once and correlates it with the component", async () => {
    const sink = new RecordingSink();
    const client = clientFor(sink);
    let time = 10;
    const performance = new CustomerSduiPerformanceTracker(client, () => time);
    const span = performance.start("component_render_ms", context, {
      componentType: "service_grid",
      componentInstanceId: "home-services",
    });
    time = 42;

    expect(span.finish()).toBe(32);
    expect(span.finish()).toBeNull();
    await client.flush();
    expect(sink.events[0]).toMatchObject({
      name: "performance.measure",
      durationMs: 32,
      attributes: { metricName: "component_render_ms" },
    });
  });

  it("reports error classification without message or stack", async () => {
    const sink = new RecordingSink();
    const client = clientFor(sink);
    const error = Object.assign(new Error("customer phone 13800000000"), { code: "NETWORK_TIMEOUT" });

    reportCustomerSduiError(client, context, error, {
      phase: "data_load",
      recoverable: true,
      componentType: "recommend_list",
      componentInstanceId: "home-recommendations",
    });
    await client.flush();

    expect(sink.events[0].attributes).toEqual({
      errorName: "Error",
      errorCode: "NETWORK_TIMEOUT",
      phase: "data_load",
      recoverable: true,
    });
    expect(JSON.stringify(sink.events[0])).not.toContain("13800000000");
    expect(JSON.stringify(sink.events[0])).not.toContain("stack");
  });

  it("emits one exposure only after threshold and minimum visible duration", async () => {
    const sink = new RecordingSink();
    const client = clientFor(sink);
    let time = 0;
    const monitor = new CustomerSduiExposureMonitor({
      client,
      context,
      componentType: "service_grid",
      componentInstanceId: "home-services",
      threshold: 0.5,
      minimumVisibleMs: 1_000,
      clock: () => time,
    });

    expect(monitor.updateVisibility(0.7)).toBe(false);
    time = 600;
    expect(monitor.tick()).toBe(false);
    monitor.updateVisibility(0.2);
    time = 700;
    monitor.updateVisibility(0.8);
    time = 1_800;
    expect(monitor.tick()).toBe(true);
    expect(monitor.tick()).toBe(false);
    await client.flush();

    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      name: "component.exposure",
      componentType: "service_grid",
      componentInstanceId: "home-services",
      durationMs: 1_100,
      attributes: { visibleRatio: 0.8, threshold: 0.5 },
    });
  });
});
