// @vitest-environment jsdom
import type {
  CustomerSduiTelemetryEvent,
  CustomerSduiTelemetrySink,
} from "../../apps/customer/src/platform/sdui/telemetry/types";
import { describe, expect, it, vi } from "vitest";
import { createHomeActionRegistry } from "../../apps/customer/src/features/home/createHomeActionRegistry";
import { createHomeComponentRegistry } from "../../apps/customer/src/features/home/createHomeComponentRegistry";
import {
  CustomerHomeTelemetry,
} from "../../apps/customer/src/features/home/homeTelemetry";
import { HomeCompositionEngine } from "../../apps/customer/src/platform/sdui/composition/HomeCompositionEngine";
import { getBuiltinHomeManifest } from "../../apps/customer/src/platform/sdui/delivery/builtinHomeManifest";
import type { HomeDataBatchResult } from "../../apps/customer/src/platform/sdui/data/types";

class RecordingSink implements CustomerSduiTelemetrySink {
  readonly events: CustomerSduiTelemetryEvent[] = [];

  async send(events: readonly CustomerSduiTelemetryEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

function telemetryFor(sink: CustomerSduiTelemetrySink): CustomerHomeTelemetry {
  let event = 0;
  return new CustomerHomeTelemetry(
    { appVersion: "2.0.0" },
    {
      sink,
      sampleRate: 1,
      pageViewId: "page-integration",
      createEventId: () => `event-${++event}`,
      flushIntervalMs: 0,
      batchSize: 100,
    },
  );
}

function failedBatch(): HomeDataBatchResult {
  const startedAt = "2026-07-23T00:00:00.000Z";
  return {
    requestId: "request-secret-13800000000",
    state: "failed",
    startedAt,
    completedAt: "2026-07-23T00:00:00.125Z",
    issues: [{ sourceId: "source-secret-13800000000", code: "duplicate_source_id" }],
    results: {
      "source-secret-13800000000": {
        sourceId: "source-secret-13800000000",
        dataKey: "provider.nearby",
        state: "error",
        error: { code: "timeout", retryable: true },
        resolvedAt: "2026-07-23T00:00:00.125Z",
      },
    },
  };
}

describe("P9 real Customer Home telemetry wiring", () => {
  it("preserves the closed cache, offline, kill-switch and circuit delivery reasons", async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryFor(sink);
    const manifest = getBuiltinHomeManifest();
    const cases = [
      { source: "fresh-cache", reason: "fresh-cache" },
      { source: "last-known-good", reason: "offline-lkg" },
      { source: "builtin", reason: "kill-switch" },
      { source: "builtin", reason: "circuit-open-builtin" },
    ] as const;

    for (const value of cases) {
      telemetry.recordDelivery({
        status: "ready",
        source: value.source,
        reason: value.reason,
        manifest,
        requestId: null,
        resolutionReason: value.reason === "kill-switch" ? "kill_switch" : null,
        previousRevision: null,
        circuitState: value.reason === "circuit-open-builtin" ? "open" : "closed",
      });
    }
    await telemetry.flush();

    const deliveryReasons = sink.events
      .filter((event) => event.name === "manifest.load")
      .map((event) => event.attributes.deliveryReason);
    expect(deliveryReasons).toEqual([
      "fresh-cache",
      "offline-lkg",
      "kill-switch",
      "circuit-open-builtin",
    ]);
  });

  it("records real runtime outcomes without action payloads or data identifiers", async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryFor(sink);
    const manifest = getBuiltinHomeManifest();
    const actions = createHomeActionRegistry({ onEvent: telemetry.onActionEvent });
    const composition = new HomeCompositionEngine(
      createHomeComponentRegistry(),
      actions,
    ).compose(manifest);

    telemetry.startPageView();
    telemetry.recordManifestLoadStarted(false);
    telemetry.recordDelivery({
      status: "ready",
      source: "builtin",
      reason: "server-fallback-builtin",
      manifest,
      requestId: "server-request-secret",
      resolutionReason: "no_eligible_manifest",
      previousRevision: null,
      circuitState: "closed",
    });
    telemetry.onDeliveryEvent({ type: "transport_timeout" });
    telemetry.recordComposition(composition);
    telemetry.onDataEvent({
      type: "source_cache_hit",
      sourceId: "source-secret-13800000000",
      dataKey: "catalog.service_categories",
    });
    telemetry.onDataEvent({
      type: "source_stale_fallback",
      sourceId: "source-secret-13800000000",
      dataKey: "catalog.recommended_services",
    });
    telemetry.onDataEvent({
      type: "source_failed",
      sourceId: "source-secret-13800000000",
      dataKey: "provider.nearby",
      code: "missing_adapter",
    });
    telemetry.recordDataBatch(failedBatch());
    actions.invoke("search.submit", {
      definition: { id: "action.search", actionKey: "search.submit" },
      sourceComponentId: "home.search",
      sourceComponentType: "search_bar",
      sourceComponentRegion: "header",
      sourceComponentOrder: 1,
      payload: { query: "cleaning 13800000000" },
    });
    telemetry.recordBrandAssetState("loading");
    telemetry.recordBrandAssetState("ready");
    telemetry.recordSlotError({
      node: composition.nodes[0]!,
      error: new Error("address and phone 13800000000"),
    });
    await telemetry.flush();

    expect(sink.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "manifest.fallback",
        outcome: "fallback",
        attributes: expect.objectContaining({
          deliverySource: "builtin",
          deliveryReason: "server-fallback-builtin",
        }),
      }),
      expect.objectContaining({
        name: "manifest.load",
        outcome: "failed",
        attributes: expect.objectContaining({ reasonCode: "timeout" }),
      }),
      expect.objectContaining({
        name: "composition.render",
        attributes: expect.objectContaining({ compositionStatus: "ready" }),
      }),
      expect.objectContaining({
        name: "data.load",
        attributes: expect.objectContaining({
          dataState: "failed",
          timeoutCount: 1,
          issueCount: 1,
        }),
      }),
      expect.objectContaining({
        name: "component.click",
        actionKey: "search.submit",
      }),
      expect.objectContaining({
        name: "action.execute",
        outcome: "succeeded",
        actionKey: "search.submit",
      }),
      expect.objectContaining({
        name: "brand.asset",
        attributes: { brandState: "ready" },
      }),
      expect.objectContaining({
        name: "runtime.error",
        componentType: "location_header",
        attributes: expect.objectContaining({
          phase: "slot_render",
          reasonCode: "slot_isolation",
        }),
      }),
    ]));

    const serialized = JSON.stringify(sink.events);
    expect(serialized).not.toContain("cleaning");
    expect(serialized).not.toContain("13800000000");
    expect(serialized).not.toContain("server-request-secret");
    expect(serialized).not.toContain("source-secret");
    expect(serialized).not.toContain("address and phone");
  });

  it("flushes a bounded runtime queue when the page is hidden", async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryFor(sink);
    const detach = telemetry.attachBrowserLifecycle();

    telemetry.startPageView();
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(sink.events).toHaveLength(1));

    detach();
    expect(sink.events[0]).toMatchObject({
      name: "page.view",
      outcome: "started",
    });
  });

  it("deduplicates a visible manifest slot after minimum visible duration", async () => {
    vi.useFakeTimers();
    const originalObserver = globalThis.IntersectionObserver;
    let observerCallback: IntersectionObserverCallback | null = null;
    let observerCount = 0;

    class FakeIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds: readonly number[] = [0.5];

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
        observerCount += 1;
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
      const sink = new RecordingSink();
      const telemetry = telemetryFor(sink);
      const manifest = getBuiltinHomeManifest();
      const actions = createHomeActionRegistry();
      const node = new HomeCompositionEngine(
        createHomeComponentRegistry(),
        actions,
      ).compose(manifest).nodes[0]!;
      telemetry.startPageView();
      telemetry.recordDelivery({
        status: "ready",
        source: "builtin",
        reason: "server-fallback-builtin",
        manifest,
        requestId: null,
        resolutionReason: "no_eligible_manifest",
        previousRevision: null,
        circuitState: "closed",
      });
      const target = document.createElement("section");
      document.body.append(target);
      const disconnect = telemetry.observeComponent(node, target);

      const callback = observerCallback as IntersectionObserverCallback | null;
      expect(callback).not.toBeNull();
      callback?.([
        { target, intersectionRatio: 0.75 } as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      await vi.advanceTimersByTimeAsync(1_000);
      disconnect();
      telemetry.observeComponent(node, target)();
      await telemetry.flush();

      expect(observerCount).toBe(1);
      expect(sink.events.filter((event) => event.name === "component.render")).toHaveLength(1);
      expect(sink.events).toContainEqual(expect.objectContaining({
        name: "performance.measure",
        attributes: { metricName: "first_home_content_ms" },
      }));
      expect(sink.events.filter((event) => event.name === "component.exposure")).toEqual([
        expect.objectContaining({
          componentType: node.instance.type,
          componentInstanceId: node.instance.id,
          attributes: expect.objectContaining({
            region: node.instance.region,
            componentOrder: node.instance.order,
            threshold: 0.5,
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        value: originalObserver,
      });
    }
  });
});
