import {
  sanitizeCustomerSduiTelemetryAttributes,
  sanitizeCustomerSduiTelemetryIdentifier,
  sanitizeOptionalCustomerSduiTelemetryIdentifier,
} from "./sanitize";
import type {
  CustomerSduiTelemetryEventName,
  CustomerSduiTelemetryOutcome,
  CustomerSduiTelemetryDraft,
  CustomerSduiTelemetryEvent,
  CustomerSduiTelemetryFlushResult,
  CustomerSduiTelemetrySink,
  CustomerSduiTelemetrySnapshot,
} from "./types";
import {
  CUSTOMER_SDUI_TELEMETRY_EVENT_NAMES,
  CUSTOMER_SDUI_TELEMETRY_OUTCOMES,
} from "./types";

const eventNames = new Set<string>(CUSTOMER_SDUI_TELEMETRY_EVENT_NAMES);
const outcomes = new Set<string>(CUSTOMER_SDUI_TELEMETRY_OUTCOMES);
const pageIds = new Set<string>(CUSTOMER_SDUI_PAGE_IDS);
const schemaVersions = new Set<string>(CUSTOMER_SDUI_SCHEMA_VERSIONS);
const componentTypes = new Set<string>(CUSTOMER_SDUI_COMPONENT_TYPES);
const dataKeys = new Set<string>(CUSTOMER_SDUI_DATA_KEYS);
const actionKeys = new Set<string>(CUSTOMER_SDUI_ACTION_KEYS);

export interface CustomerSduiTelemetryClientOptions {
  sink?: CustomerSduiTelemetrySink;
  maxBufferSize?: number;
  batchSize?: number;
  sampleRate?: number;
  now?: () => Date;
  createEventId?: () => string;
  random?: () => number;
}

export class NoopCustomerSduiTelemetrySink implements CustomerSduiTelemetrySink {
  async send(): Promise<void> {}
}

function defaultEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `sdui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedDuration(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function normalizedSampleRate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function validOptional(value: string | null | undefined, allowed: ReadonlySet<string>): boolean {
  return value === null || value === undefined || allowed.has(value);
}

/**
 * Best-effort client. Tracking and sink failures never throw into the customer
 * journey. No persistence or network transport is enabled by the P9 foundation.
 */
export class CustomerSduiTelemetryClient {
  readonly #sink: CustomerSduiTelemetrySink;
  readonly #maxBufferSize: number;
  readonly #batchSize: number;
  readonly #now: () => Date;
  readonly #createEventId: () => string;
  readonly #sampledIn: boolean;
  readonly #buffer: CustomerSduiTelemetryEvent[] = [];
  #sequence = 1;
  #droppedEvents = 0;
  #sampledOutEvents = 0;
  #activeFlush: Promise<CustomerSduiTelemetryFlushResult> | null = null;

  constructor(options: CustomerSduiTelemetryClientOptions = {}) {
    this.#sink = options.sink ?? new NoopCustomerSduiTelemetrySink();
    this.#maxBufferSize = Math.max(1, Math.floor(options.maxBufferSize ?? 200));
    this.#batchSize = Math.max(1, Math.floor(options.batchSize ?? 20));
    this.#now = options.now ?? (() => new Date());
    this.#createEventId = options.createEventId ?? defaultEventId;
    const sampleRate = normalizedSampleRate(options.sampleRate);
    this.#sampledIn = sampleRate >= 1 ||
      (sampleRate > 0 && (options.random ?? Math.random)() < sampleRate);
  }

  track(draft: CustomerSduiTelemetryDraft): CustomerSduiTelemetryEvent | null {
    if (!this.#sampledIn) {
      this.#sampledOutEvents += 1;
      return null;
    }
    try {
      if (
        !eventNames.has(draft.name) ||
        !outcomes.has(draft.outcome) ||
        !pageIds.has(draft.context.pageId) ||
        !validOptional(draft.context.schemaVersion, schemaVersions) ||
        !validOptional(draft.componentType, componentTypes) ||
        !validOptional(draft.dataKey, dataKeys) ||
        !validOptional(draft.actionKey, actionKeys)
      ) {
        return null;
      }
      const event: CustomerSduiTelemetryEvent = {
        eventId: sanitizeCustomerSduiTelemetryIdentifier(
          this.#createEventId(),
          `sdui-event-${this.#sequence}`,
        ),
        sequence: this.#sequence++,
        occurredAt: this.#now().toISOString(),
        name: draft.name as CustomerSduiTelemetryEventName,
        outcome: draft.outcome as CustomerSduiTelemetryOutcome,
        pageId: draft.context.pageId,
        pageViewId: sanitizeCustomerSduiTelemetryIdentifier(
          draft.context.pageViewId,
          "invalid-page-view",
        ),
        appVersion: sanitizeCustomerSduiTelemetryIdentifier(
          draft.context.appVersion,
          "unknown-version",
        ),
        manifestId: sanitizeOptionalCustomerSduiTelemetryIdentifier(
          draft.context.manifestId,
        ),
        manifestRevision: sanitizeOptionalCustomerSduiTelemetryIdentifier(
          draft.context.manifestRevision,
        ),
        schemaVersion: draft.context.schemaVersion,
        componentType: draft.componentType ?? null,
        componentInstanceId: sanitizeOptionalCustomerSduiTelemetryIdentifier(
          draft.componentInstanceId,
        ),
        dataKey: draft.dataKey ?? null,
        actionKey: draft.actionKey ?? null,
        durationMs: normalizedDuration(draft.durationMs),
        attributes: sanitizeCustomerSduiTelemetryAttributes(draft.attributes),
      };
      this.#buffer.push(event);
      this.#enforceBufferLimit();
      return event;
    } catch {
      return null;
    }
  }

  flush(): Promise<CustomerSduiTelemetryFlushResult> {
    if (this.#activeFlush) return this.#activeFlush;
    this.#activeFlush = this.#flushBatch().finally(() => {
      this.#activeFlush = null;
    });
    return this.#activeFlush;
  }

  snapshot(): CustomerSduiTelemetrySnapshot {
    return {
      bufferedEvents: this.#buffer.length,
      droppedEvents: this.#droppedEvents,
      sampledOutEvents: this.#sampledOutEvents,
      sampledIn: this.#sampledIn,
      nextSequence: this.#sequence,
      flushInProgress: this.#activeFlush !== null,
    };
  }

  async flushAll(maxBatches = 4): Promise<CustomerSduiTelemetryFlushResult> {
    const limit = Math.max(1, Math.floor(maxBatches));
    let delivered = true;
    let eventCount = 0;

    for (let batch = 0; batch < limit && this.#buffer.length > 0; batch += 1) {
      const result = await this.flush();
      delivered = delivered && result.delivered;
      eventCount += result.eventCount;
      if (!result.delivered) break;
    }

    return {
      delivered,
      eventCount,
      bufferedEvents: this.#buffer.length,
    };
  }

  async #flushBatch(): Promise<CustomerSduiTelemetryFlushResult> {
    const batch = this.#buffer.splice(0, this.#batchSize);
    if (batch.length === 0) {
      return { delivered: true, eventCount: 0, bufferedEvents: 0 };
    }

    try {
      await this.#sink.send(Object.freeze([...batch]));
      return {
        delivered: true,
        eventCount: batch.length,
        bufferedEvents: this.#buffer.length,
      };
    } catch {
      this.#buffer.unshift(...batch);
      this.#enforceBufferLimit();
      return {
        delivered: false,
        eventCount: batch.length,
        bufferedEvents: this.#buffer.length,
      };
    }
  }

  #enforceBufferLimit(): void {
    const overflow = this.#buffer.length - this.#maxBufferSize;
    if (overflow <= 0) return;
    this.#buffer.splice(0, overflow);
    this.#droppedEvents += overflow;
  }
}
import {
  CUSTOMER_SDUI_ACTION_KEYS,
  CUSTOMER_SDUI_COMPONENT_TYPES,
  CUSTOMER_SDUI_DATA_KEYS,
  CUSTOMER_SDUI_PAGE_IDS,
  CUSTOMER_SDUI_SCHEMA_VERSIONS,
} from "@xlb/types";
