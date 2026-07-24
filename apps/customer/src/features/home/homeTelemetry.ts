import type {
  CustomerSduiComponentRegion,
  CustomerSduiComponentType,
  CustomerSduiPageManifest,
} from "@xlb/types";
import type { HomeActionRuntimeEvent } from "../../platform/sdui/actions/HomeActionRegistry.js";
import type {
  HomeComponentRenderError,
  HomeCompositionNode,
  HomeCompositionResult,
} from "../../platform/sdui/composition/index.js";
import type {
  HomeDataBatchResult,
  HomeDataTelemetryEvent,
} from "../../platform/sdui/data/index.js";
import type {
  HomeManifestDeliveryTelemetryEvent,
  HomeManifestLoadResult,
} from "../../platform/sdui/delivery/index.js";
import {
  BrowserCustomerSduiTelemetrySink,
  CustomerSduiPerformanceTracker,
  CustomerSduiTelemetryClient,
  NoopCustomerSduiTelemetrySink,
  observeCustomerSduiComponent,
  reportCustomerSduiError,
  type CustomerSduiPerformanceMetric,
  type CustomerSduiTelemetryContext,
  type CustomerSduiTelemetryCorrelation,
  type CustomerSduiTelemetryEvent,
  type CustomerSduiTelemetryOutcome,
  type CustomerSduiTelemetrySink,
  type CustomerSduiTelemetrySnapshot,
} from "../../platform/sdui/telemetry/index.js";

const DEFAULT_SAMPLE_RATE = 0.1;
const DEFAULT_FLUSH_INTERVAL_MS = 2_000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_BUFFER_SIZE = 200;
const MAX_FLUSH_BATCHES = 4;

export interface CustomerHomeTelemetryRuntimeContext {
  readonly appVersion: string;
}

export interface CustomerHomeTelemetryOptions {
  readonly sink?: CustomerSduiTelemetrySink;
  readonly sampleRate?: number;
  readonly random?: () => number;
  readonly now?: () => Date;
  readonly monotonicClock?: () => number;
  readonly createEventId?: () => string;
  readonly pageViewId?: string;
  readonly flushIntervalMs?: number;
  readonly batchSize?: number;
  readonly maxBufferSize?: number;
}

export interface CustomerHomeTelemetrySpan {
  finish(outcome?: CustomerSduiTelemetryOutcome, attributes?: unknown): number | null;
}

function pageViewId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `page-${globalThis.crypto.randomUUID()}`;
  }
  return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function browserMonotonicClock(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function configuredSampleRate(): number {
  const parsed = Number(import.meta.env.VITE_CUSTOMER_TELEMETRY_SAMPLE_RATE);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_SAMPLE_RATE;
}

function configuredSink(): CustomerSduiTelemetrySink {
  const endpoint = import.meta.env.VITE_CUSTOMER_TELEMETRY_ENDPOINT?.trim();
  if (!endpoint) return new NoopCustomerSduiTelemetrySink();
  try {
    return new BrowserCustomerSduiTelemetrySink({ endpoint });
  } catch {
    return new NoopCustomerSduiTelemetrySink();
  }
}

function resultOutcome(
  state: HomeDataBatchResult["state"],
): CustomerSduiTelemetryOutcome {
  if (state === "ready" || state === "empty") return "succeeded";
  if (state === "partial") return "fallback";
  if (state === "cancelled") return "cancelled";
  return "failed";
}

function componentCorrelation(
  type: CustomerSduiComponentType | undefined,
  region: CustomerSduiComponentRegion | undefined,
  order: number | undefined,
  instanceId: string,
): string {
  if (/^[a-z][a-z0-9._:-]{0,63}$/.test(instanceId) && !/\d{10,}/.test(instanceId)) {
    return instanceId;
  }
  return `${type ?? "component"}:${region ?? "unknown"}:${order ?? 0}`;
}

function componentAttributes(
  region: CustomerSduiComponentRegion | undefined,
  order: number | undefined,
) {
  const boundedOrder = Number.isInteger(order) && (order ?? -1) >= 0 && (order ?? 1_000) <= 999
    ? order
    : undefined;
  return {
    ...(region === undefined ? {} : { region }),
    ...(boundedOrder === undefined ? {} : { componentOrder: boundedOrder }),
  };
}

/**
 * The single Customer Home telemetry integration point. It accepts only
 * already-normalized runtime outcomes and never receives business payloads.
 */
export class CustomerHomeTelemetry {
  readonly #client: CustomerSduiTelemetryClient;
  readonly #performance: CustomerSduiPerformanceTracker;
  readonly #flushIntervalMs: number;
  readonly #batchSize: number;
  readonly #pageViewId: string;
  readonly #appVersion: string;
  readonly #clock: () => number;
  #manifestId: string | null = null;
  #manifestRevision: string | null = null;
  #schemaVersion: CustomerSduiPageManifest["schemaVersion"] | null = null;
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #pageViewStarted = false;
  #firstContentStartedAt: number | null = null;
  #brandState: string | null = null;
  #rendered = new Set<string>();
  #failed = new Set<string>();
  #exposed = new Set<string>();

  constructor(
    context: CustomerHomeTelemetryRuntimeContext,
    options: CustomerHomeTelemetryOptions = {},
  ) {
    this.#appVersion = context.appVersion;
    this.#pageViewId = options.pageViewId ?? pageViewId();
    this.#clock = options.monotonicClock ?? browserMonotonicClock;
    this.#batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
    this.#flushIntervalMs = Math.max(
      0,
      Math.floor(options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS),
    );
    this.#client = new CustomerSduiTelemetryClient({
      sink: options.sink ?? configuredSink(),
      sampleRate: options.sampleRate ?? configuredSampleRate(),
      random: options.random,
      now: options.now,
      createEventId: options.createEventId,
      batchSize: this.#batchSize,
      maxBufferSize: options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
    });
    this.#performance = new CustomerSduiPerformanceTracker(
      this.#client,
      this.#clock,
    );
  }

  startPageView(): void {
    if (this.#pageViewStarted) return;
    this.#pageViewStarted = true;
    this.#firstContentStartedAt = this.#clock();
    this.#track({
      name: "page.view",
      outcome: "started",
      context: this.#context(),
      attributes: { source: "runtime" },
    });
  }

  beginSpan(
    metricName: CustomerSduiPerformanceMetric,
    correlation: CustomerSduiTelemetryCorrelation = {},
  ): CustomerHomeTelemetrySpan {
    const span = this.#performance.start(metricName, this.#context(), correlation);
    return {
      finish: (outcome, attributes) => {
        const duration = span.finish(outcome, attributes);
        if (duration !== null) this.#scheduleFlush();
        return duration;
      },
    };
  }

  recordManifestLoadStarted(forceRefresh: boolean): void {
    this.#track({
      name: "manifest.load",
      outcome: "started",
      context: this.#context(),
      attributes: { source: forceRefresh ? "refresh" : "initial" },
    });
  }

  recordDelivery(result: HomeManifestLoadResult): void {
    if (result.status === "superseded") {
      this.#track({
        name: "manifest.load",
        outcome: "cancelled",
        context: this.#context(),
        attributes: { reasonCode: "superseded" },
      });
      return;
    }

    this.#setManifest(result.manifest);
    const fallback = result.source === "last-known-good" || result.source === "builtin";
    const attributes = {
      deliverySource: result.source,
      deliveryReason: result.reason,
      circuitState: result.circuitState,
      ...(result.resolutionReason === null
        ? {}
        : { resolutionReason: result.resolutionReason }),
    };
    this.#track({
      name: "manifest.load",
      outcome: fallback ? "fallback" : "succeeded",
      context: this.#context(),
      attributes,
    });
    if (fallback) {
      this.#track({
        name: "manifest.fallback",
        outcome: "fallback",
        context: this.#context(),
        attributes: {
          ...attributes,
          fallbackSource: result.source,
        },
      });
    }
  }

  readonly onDeliveryEvent = (event: HomeManifestDeliveryTelemetryEvent): void => {
    if (event.type === "transport_timeout") {
      this.#track({
        name: "manifest.load",
        outcome: "failed",
        context: this.#context(),
        attributes: {
          phase: "transport",
          reasonCode: "timeout",
          recoverable: true,
        },
      });
    }
  };

  recordComposition(result: HomeCompositionResult): void {
    const fatalIssueCount = result.issues.filter((issue) => issue.severity === "fatal").length;
    const warningIssueCount = result.issues.length - fatalIssueCount;
    const outcome: CustomerSduiTelemetryOutcome = result.status === "ready"
      ? "succeeded"
      : result.status === "degraded"
        ? "fallback"
        : "rejected";
    const attributes = {
      compositionStatus: result.status,
      issueCount: result.issues.length,
      fatalIssueCount,
      warningIssueCount,
      reasonCode: result.issues[0]?.code ?? "none",
    };
    this.#track({
      name: "manifest.validation",
      outcome,
      context: this.#context(),
      attributes,
    });
    this.#track({
      name: "composition.render",
      outcome,
      context: this.#context(),
      attributes,
    });
    if (result.status === "rejected") this.#finishFirstContent("rejected");
  }

  readonly onDataEvent = (event: HomeDataTelemetryEvent): void => {
    if (event.type === "batch_completed") return;
    if (event.type === "upstream_coalesced") {
      this.#track({
        name: "data.load",
        outcome: "succeeded",
        context: this.#context(),
        attributes: { reasonCode: "upstream_coalesced" },
      });
      return;
    }

    const base = {
      name: "data.load" as const,
      context: this.#context(),
      dataKey: event.dataKey,
    };
    if (event.type === "source_started") {
      this.#track({ ...base, outcome: "started", attributes: { source: event.type } });
    } else if (event.type === "source_cache_hit") {
      this.#track({
        ...base,
        outcome: "succeeded",
        attributes: { source: event.type, cacheTier: "fresh" },
      });
    } else if (event.type === "source_stale_fallback") {
      this.#track({
        ...base,
        outcome: "fallback",
        attributes: { source: event.type, cacheTier: "stale" },
      });
    } else if (event.type === "source_succeeded") {
      this.#track({ ...base, outcome: "succeeded", attributes: { source: event.type } });
    } else {
      this.#track({
        ...base,
        outcome: event.code === "cancelled" ? "cancelled" : "failed",
        attributes: {
          source: event.type,
          errorCode: event.code,
          recoverable: event.code !== "missing_adapter" && event.code !== "invalid_source",
        },
      });
    }
  };

  recordDataBatch(batch: HomeDataBatchResult): void {
    const results = Object.values(batch.results);
    const count = (predicate: (result: (typeof results)[number]) => boolean) =>
      results.filter(predicate).length;
    this.#track({
      name: "data.load",
      outcome: resultOutcome(batch.state),
      context: this.#context(),
      durationMs: Math.max(0, Date.parse(batch.completedAt) - Date.parse(batch.startedAt)),
      attributes: {
        source: "batch",
        dataState: batch.state,
        batchSize: results.length,
        issueCount: batch.issues.length,
        freshCount: count((result) => result.state === "success" && result.cache === "fresh"),
        staleCount: count((result) => result.state === "stale"),
        errorCount: count((result) => result.state === "error"),
        timeoutCount: count((result) =>
          "error" in result && result.error.code === "timeout"),
        cancelledCount: count((result) => result.state === "cancelled"),
        unavailableCount: count((result) => result.state === "unavailable"),
      },
    });
  }

  readonly onActionEvent = (event: HomeActionRuntimeEvent): void => {
    const componentInstanceId = componentCorrelation(
      event.sourceComponentType,
      event.sourceComponentRegion,
      event.sourceComponentOrder,
      event.sourceComponentId,
    );
    const correlation = {
      componentType: event.sourceComponentType,
      componentInstanceId,
      actionKey: event.actionKey,
    };
    const attributes = {
      actionPhase: event.phase,
      ...componentAttributes(event.sourceComponentRegion, event.sourceComponentOrder),
    };

    if (event.phase === "invoked") {
      this.#track({
        name: "component.click",
        outcome: "succeeded",
        context: this.#context(),
        ...correlation,
        attributes,
      });
      this.#track({
        name: "action.execute",
        outcome: "started",
        context: this.#context(),
        ...correlation,
        attributes,
      });
      return;
    }

    const outcome: CustomerSduiTelemetryOutcome = event.phase === "succeeded"
      ? "succeeded"
      : event.phase === "rejected"
        ? "rejected"
        : "failed";
    this.#track({
      name: "action.execute",
      outcome,
      context: this.#context(),
      ...correlation,
      durationMs: event.durationMs,
      attributes,
    });
    if (event.phase === "failed") {
      reportCustomerSduiError(this.#client, this.#context(), event.error, {
        phase: "action_execute",
        recoverable: true,
        ...correlation,
        attributes,
      });
      this.#scheduleFlush();
    }
  };

  observeComponent(node: HomeCompositionNode, target: Element): () => void {
    const instanceId = componentCorrelation(
      node.instance.type,
      node.instance.region,
      node.instance.order,
      node.instance.id,
    );
    const key = `${this.#manifestRevision ?? "unknown"}:${instanceId}`;
    if (this.#failed.has(key)) return () => undefined;

    if (!this.#rendered.has(key)) {
      this.#rendered.add(key);
      this.#track({
        name: "component.render",
        outcome: "succeeded",
        context: this.#context(),
        componentType: node.instance.type,
        componentInstanceId: instanceId,
        attributes: componentAttributes(node.instance.region, node.instance.order),
      });
      this.#finishFirstContent("succeeded");
    }
    if (this.#exposed.has(key)) return () => undefined;

    const handle = observeCustomerSduiComponent(target, {
      client: this.#client,
      context: this.#context(),
      componentType: node.instance.type,
      componentInstanceId: instanceId,
      threshold: 0.5,
      minimumVisibleMs: 1_000,
      attributes: componentAttributes(node.instance.region, node.instance.order),
      onExposure: () => {
        this.#exposed.add(key);
        this.#scheduleFlush();
      },
    });
    return () => handle.disconnect();
  }

  recordSlotError(failure: HomeComponentRenderError): void {
    const { instance } = failure.node;
    const instanceId = componentCorrelation(
      instance.type,
      instance.region,
      instance.order,
      instance.id,
    );
    const key = `${this.#manifestRevision ?? "unknown"}:${instanceId}`;
    this.#failed.add(key);
    const attributes = {
      reasonCode: "slot_isolation",
      ...componentAttributes(instance.region, instance.order),
    };
    this.#track({
      name: "component.render",
      outcome: "failed",
      context: this.#context(),
      componentType: instance.type,
      componentInstanceId: instanceId,
      attributes,
    });
    reportCustomerSduiError(this.#client, this.#context(), failure.error, {
      phase: "slot_render",
      recoverable: true,
      componentType: instance.type,
      componentInstanceId: instanceId,
      attributes,
    });
    this.#scheduleFlush();
  }

  readonly recordBrandAssetState = (
    state: "default" | "loading" | "ready" | "asset-failure",
  ): void => {
    if (state === this.#brandState) return;
    this.#brandState = state;
    this.#track({
      name: "brand.asset",
      outcome: state === "loading"
        ? "started"
        : state === "asset-failure"
          ? "fallback"
          : "succeeded",
      context: this.#context(),
      attributes: { brandState: state },
    });
  };

  recordRuntimeError(error: unknown, phase: string, recoverable: boolean): void {
    reportCustomerSduiError(this.#client, this.#context(), error, {
      phase,
      recoverable,
    });
    if (phase === "home_load") this.#finishFirstContent("failed");
    this.#scheduleFlush();
  }

  attachBrowserLifecycle(): () => void {
    if (typeof window === "undefined") return () => undefined;
    const flush = () => void this.flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }

  async flush(): Promise<void> {
    this.#clearFlushTimer();
    await this.#client.flushAll(MAX_FLUSH_BATCHES);
  }

  snapshot(): CustomerSduiTelemetrySnapshot {
    return this.#client.snapshot();
  }

  #setManifest(manifest: CustomerSduiPageManifest): void {
    if (this.#manifestRevision !== manifest.revision) {
      this.#rendered = new Set();
      this.#failed = new Set();
      this.#exposed = new Set();
    }
    this.#manifestId = manifest.manifestId;
    this.#manifestRevision = manifest.revision;
    this.#schemaVersion = manifest.schemaVersion;
  }

  #context(): CustomerSduiTelemetryContext {
    return {
      pageId: "customer.home",
      pageViewId: this.#pageViewId,
      appVersion: this.#appVersion,
      manifestId: this.#manifestId,
      manifestRevision: this.#manifestRevision,
      schemaVersion: this.#schemaVersion,
    };
  }

  #track(draft: Parameters<CustomerSduiTelemetryClient["track"]>[0]): CustomerSduiTelemetryEvent | null {
    const event = this.#client.track(draft);
    if (event !== null) this.#scheduleFlush();
    return event;
  }

  #finishFirstContent(outcome: CustomerSduiTelemetryOutcome): void {
    if (this.#firstContentStartedAt === null) return;
    const durationMs = Math.max(0, this.#clock() - this.#firstContentStartedAt);
    this.#firstContentStartedAt = null;
    this.#track({
      name: "performance.measure",
      outcome,
      context: this.#context(),
      durationMs,
      attributes: { metricName: "first_home_content_ms" },
    });
  }

  #scheduleFlush(): void {
    if (this.#client.snapshot().bufferedEvents >= this.#batchSize) {
      void this.flush();
      return;
    }
    if (this.#flushIntervalMs === 0 || this.#flushTimer !== null) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      void this.#client.flushAll(MAX_FLUSH_BATCHES);
    }, this.#flushIntervalMs);
  }

  #clearFlushTimer(): void {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
  }
}

export function createCustomerHomeTelemetry(
  context: CustomerHomeTelemetryRuntimeContext,
  options?: CustomerHomeTelemetryOptions,
): CustomerHomeTelemetry {
  return new CustomerHomeTelemetry(context, options);
}
