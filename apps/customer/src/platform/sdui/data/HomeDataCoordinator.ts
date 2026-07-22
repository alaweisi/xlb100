import type { CustomerSduiDataKey, CustomerSduiDataSource } from "@xlb/types";

import { HomeDataAdapterRegistry } from "./HomeDataAdapterRegistry.js";
import type {
  HomeDataBatchIssue,
  HomeDataBatchResult,
  HomeDataCoordinatorOptions,
  HomeDataCoordinatorRequest,
  HomeDataError,
  HomeDataLoadContext,
  HomeDataSourceResult,
  HomeDataTelemetryEvent,
  HomeDataValueByKey,
} from "./types.js";

interface CacheEntry {
  value: HomeDataValueByKey[CustomerSduiDataKey];
  freshUntil: number;
  staleUntil: number;
}

const DEFAULT_FRESH_TTL_MS = 30_000;
const DEFAULT_STALE_TTL_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 8_000;

class HomeDataTimeoutError extends Error {
  constructor() {
    super("Home data request timed out");
    this.name = "HomeDataTimeoutError";
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function sourceCacheKey(scopeKey: string, source: CustomerSduiDataSource): string {
  return `${scopeKey}|${source.dataKey}|${canonicalize(source.parameters)}`;
}

function timestamp(now: number): string {
  return new Date(now).toISOString();
}

function errorFor(error: unknown, signal: AbortSignal): HomeDataError {
  const reason = signal.reason;
  if (reason instanceof HomeDataTimeoutError || error instanceof HomeDataTimeoutError) {
    return { code: "timeout", retryable: true };
  }
  if (signal.aborted) {
    return { code: "cancelled", retryable: true };
  }
  return { code: "adapter_error", retryable: true };
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function batchState(results: readonly HomeDataSourceResult[]): HomeDataBatchResult["state"] {
  if (results.length === 0) return "empty";
  const usable = results.filter((result) => result.state === "success" || result.state === "stale").length;
  if (usable === results.length) return "ready";
  if (usable > 0) return "partial";
  if (results.every((result) => result.state === "cancelled")) return "cancelled";
  return "failed";
}

export class HomeDataCoordinator {
  readonly #registry: HomeDataAdapterRegistry;
  readonly #freshTtlMs: number;
  readonly #staleTtlMs: number;
  readonly #timeoutMs: number;
  readonly #now: () => number;
  readonly #onEvent?: (event: HomeDataTelemetryEvent) => void;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(registry: HomeDataAdapterRegistry, options: HomeDataCoordinatorOptions = {}) {
    this.#registry = registry;
    this.#freshTtlMs = options.freshTtlMs ?? DEFAULT_FRESH_TTL_MS;
    this.#staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? Date.now;
    this.#onEvent = options.onEvent;
    if (this.#freshTtlMs < 0 || this.#staleTtlMs < this.#freshTtlMs || this.#timeoutMs < 0) {
      throw new Error("Home data timing options are invalid");
    }
  }

  clearCache(scopeKey?: string): void {
    if (scopeKey === undefined) {
      this.#cache.clear();
      return;
    }
    const prefix = `${scopeKey}|`;
    for (const key of this.#cache.keys()) {
      if (key.startsWith(prefix)) this.#cache.delete(key);
    }
  }

  async load(request: HomeDataCoordinatorRequest): Promise<HomeDataBatchResult> {
    if (!request.requestId.trim()) throw new Error("Home data requestId is required");
    if (!request.cacheScopeKey.trim()) throw new Error("Home data cacheScopeKey is required");

    const started = this.#now();
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abortFromCaller = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (request.signal?.aborted) controller.abort(request.signal.reason);
    if (!controller.signal.aborted && this.#timeoutMs > 0) {
      timeout = setTimeout(() => controller.abort(new HomeDataTimeoutError()), this.#timeoutMs);
    }

    const upstreamRequests = new Map<string, Promise<unknown>>();
    const context: HomeDataLoadContext = {
      requestId: request.requestId,
      cityCode: request.cityCode,
      locale: request.locale,
      cacheScopeKey: request.cacheScopeKey,
      signal: controller.signal,
      request: <T>(key: string, loader: (signal: AbortSignal) => Promise<T>): Promise<T> => {
        const scopedKey = `${request.cacheScopeKey}|${key}`;
        const existing = upstreamRequests.get(scopedKey);
        if (existing) {
          this.#emit({ type: "upstream_coalesced", key });
          return existing as Promise<T>;
        }
        const pending = loader(controller.signal);
        upstreamRequests.set(scopedKey, pending);
        return pending;
      },
    };

    const issues: HomeDataBatchIssue[] = [];
    const uniqueSources = new Map<string, CustomerSduiDataSource>();
    for (const source of request.dataSources) {
      if (uniqueSources.has(source.id)) {
        issues.push({ sourceId: source.id, code: "duplicate_source_id" });
        continue;
      }
      uniqueSources.set(source.id, source);
    }

    const coalesced = new Map<string, Promise<HomeDataSourceResult>>();
    const entries = [...uniqueSources.values()].map(async (source) => {
      const key = sourceCacheKey(request.cacheScopeKey, source);
      let pending = coalesced.get(key);
      if (!pending) {
        pending = this.#resolveSource(source, key, context);
        coalesced.set(key, pending);
      }
      const result = await pending;
      return [source.id, { ...result, sourceId: source.id }] as const;
    });

    try {
      const resolvedEntries = await Promise.all(entries);
      const results = Object.fromEntries(resolvedEntries) as Record<string, HomeDataSourceResult>;
      const state = batchState(Object.values(results));
      const completedAt = timestamp(this.#now());
      this.#emit({ type: "batch_completed", requestId: request.requestId, state });
      return {
        requestId: request.requestId,
        state,
        startedAt: timestamp(started),
        completedAt,
        results,
        issues,
      };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async #resolveSource(
    source: CustomerSduiDataSource,
    key: string,
    context: HomeDataLoadContext,
  ): Promise<HomeDataSourceResult> {
    const startedAt = this.#now();
    const cached = this.#cache.get(key);
    if (cached && cached.freshUntil > startedAt) {
      this.#emit({ type: "source_cache_hit", sourceId: source.id, dataKey: source.dataKey });
      return {
        sourceId: source.id,
        dataKey: source.dataKey,
        state: "success",
        value: cached.value,
        cache: "fresh",
        resolvedAt: timestamp(startedAt),
      };
    }

    const adapter = this.#registry.resolve(source.dataKey);
    if (!adapter) {
      const error: HomeDataError = { code: "missing_adapter", retryable: false };
      this.#emit({ type: "source_failed", sourceId: source.id, dataKey: source.dataKey, code: error.code });
      return {
        sourceId: source.id,
        dataKey: source.dataKey,
        state: "unavailable",
        error,
        resolvedAt: timestamp(startedAt),
      };
    }

    this.#emit({ type: "source_started", sourceId: source.id, dataKey: source.dataKey });
    try {
      const value = await abortable(adapter.load(source, context), context.signal);
      const resolvedAt = this.#now();
      this.#cache.set(key, {
        value,
        freshUntil: resolvedAt + this.#freshTtlMs,
        staleUntil: resolvedAt + this.#staleTtlMs,
      });
      this.#emit({ type: "source_succeeded", sourceId: source.id, dataKey: source.dataKey });
      return {
        sourceId: source.id,
        dataKey: source.dataKey,
        state: "success",
        value,
        cache: "miss",
        resolvedAt: timestamp(resolvedAt),
      };
    } catch (cause) {
      const resolvedAt = this.#now();
      const error = errorFor(cause, context.signal);
      if (error.code !== "cancelled" && cached && cached.staleUntil > resolvedAt) {
        this.#emit({ type: "source_stale_fallback", sourceId: source.id, dataKey: source.dataKey });
        return {
          sourceId: source.id,
          dataKey: source.dataKey,
          state: "stale",
          value: cached.value,
          cache: "stale",
          error,
          resolvedAt: timestamp(resolvedAt),
        };
      }
      this.#emit({ type: "source_failed", sourceId: source.id, dataKey: source.dataKey, code: error.code });
      return {
        sourceId: source.id,
        dataKey: source.dataKey,
        state: error.code === "cancelled" ? "cancelled" : "error",
        error,
        resolvedAt: timestamp(resolvedAt),
      };
    }
  }

  #emit(event: HomeDataTelemetryEvent): void {
    try {
      this.#onEvent?.(event);
    } catch {
      // Telemetry is deliberately fail-open and cannot block customer data.
    }
  }
}
