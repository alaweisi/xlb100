import { sanitizeCustomerSduiTelemetryAttributes } from "./sanitize";
import type {
  CustomerSduiTelemetryDraft,
  CustomerSduiTelemetryEvent,
  CustomerSduiTelemetryFlushResult,
  CustomerSduiTelemetrySink,
  CustomerSduiTelemetrySnapshot,
} from "./types";

export interface CustomerSduiTelemetryClientOptions {
  sink?: CustomerSduiTelemetrySink;
  maxBufferSize?: number;
  batchSize?: number;
  now?: () => Date;
  createEventId?: () => string;
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
  readonly #buffer: CustomerSduiTelemetryEvent[] = [];
  #sequence = 1;
  #droppedEvents = 0;
  #activeFlush: Promise<CustomerSduiTelemetryFlushResult> | null = null;

  constructor(options: CustomerSduiTelemetryClientOptions = {}) {
    this.#sink = options.sink ?? new NoopCustomerSduiTelemetrySink();
    this.#maxBufferSize = Math.max(1, Math.floor(options.maxBufferSize ?? 200));
    this.#batchSize = Math.max(1, Math.floor(options.batchSize ?? 20));
    this.#now = options.now ?? (() => new Date());
    this.#createEventId = options.createEventId ?? defaultEventId;
  }

  track(draft: CustomerSduiTelemetryDraft): CustomerSduiTelemetryEvent | null {
    try {
      const event: CustomerSduiTelemetryEvent = {
        eventId: this.#createEventId(),
        sequence: this.#sequence++,
        occurredAt: this.#now().toISOString(),
        name: draft.name,
        outcome: draft.outcome,
        pageId: draft.context.pageId,
        pageViewId: draft.context.pageViewId,
        appVersion: draft.context.appVersion,
        manifestId: draft.context.manifestId,
        manifestRevision: draft.context.manifestRevision,
        schemaVersion: draft.context.schemaVersion,
        componentType: draft.componentType ?? null,
        componentInstanceId: draft.componentInstanceId ?? null,
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
      nextSequence: this.#sequence,
      flushInProgress: this.#activeFlush !== null,
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
