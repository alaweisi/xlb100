import type {
  CustomerSduiActionKey,
  CustomerSduiComponentType,
  CustomerSduiDataKey,
  CustomerSduiPageId,
  CustomerSduiSchemaVersion,
} from "@xlb/types";

export const CUSTOMER_SDUI_TELEMETRY_EVENT_NAMES = [
  "manifest.load",
  "manifest.validation",
  "manifest.fallback",
  "composition.render",
  "component.render",
  "component.exposure",
  "component.click",
  "data.load",
  "action.execute",
  "performance.measure",
  "runtime.error",
] as const;

export type CustomerSduiTelemetryEventName =
  typeof CUSTOMER_SDUI_TELEMETRY_EVENT_NAMES[number];

export const CUSTOMER_SDUI_TELEMETRY_OUTCOMES = [
  "started",
  "succeeded",
  "failed",
  "rejected",
  "fallback",
  "cancelled",
] as const;

export type CustomerSduiTelemetryOutcome =
  typeof CUSTOMER_SDUI_TELEMETRY_OUTCOMES[number];

export const CUSTOMER_SDUI_PERFORMANCE_METRICS = [
  "manifest_fetch_ms",
  "manifest_validate_ms",
  "composition_ms",
  "component_render_ms",
  "data_load_ms",
  "action_ms",
  "first_home_content_ms",
] as const;

export type CustomerSduiPerformanceMetric =
  typeof CUSTOMER_SDUI_PERFORMANCE_METRICS[number];

export const CUSTOMER_SDUI_TELEMETRY_ATTRIBUTE_KEYS = [
  "actionPhase",
  "batchSize",
  "cacheTier",
  "droppedEvents",
  "errorCode",
  "errorName",
  "fallbackSource",
  "metricName",
  "phase",
  "reasonCode",
  "recoverable",
  "resolutionReason",
  "source",
  "statusClass",
  "threshold",
  "visibleRatio",
] as const;

export type CustomerSduiTelemetryAttributeKey =
  typeof CUSTOMER_SDUI_TELEMETRY_ATTRIBUTE_KEYS[number];

export type CustomerSduiTelemetryAttributeValue = string | number | boolean | null;
export type CustomerSduiTelemetryAttributes = Partial<
  Record<CustomerSduiTelemetryAttributeKey, CustomerSduiTelemetryAttributeValue>
>;

/**
 * Correlation is deliberately presentation-only. It must never contain a
 * customer id, phone, address, free-form message, order payload, or Manifest
 * content.
 */
export interface CustomerSduiTelemetryContext {
  pageId: CustomerSduiPageId;
  pageViewId: string;
  appVersion: string;
  manifestId: string | null;
  manifestRevision: string | null;
  schemaVersion: CustomerSduiSchemaVersion | null;
}

export interface CustomerSduiTelemetryDraft {
  name: CustomerSduiTelemetryEventName;
  outcome: CustomerSduiTelemetryOutcome;
  context: CustomerSduiTelemetryContext;
  componentType?: CustomerSduiComponentType | null;
  componentInstanceId?: string | null;
  dataKey?: CustomerSduiDataKey | null;
  actionKey?: CustomerSduiActionKey | null;
  durationMs?: number | null;
  attributes?: unknown;
}

export interface CustomerSduiTelemetryEvent {
  eventId: string;
  sequence: number;
  occurredAt: string;
  name: CustomerSduiTelemetryEventName;
  outcome: CustomerSduiTelemetryOutcome;
  pageId: CustomerSduiPageId;
  pageViewId: string;
  appVersion: string;
  manifestId: string | null;
  manifestRevision: string | null;
  schemaVersion: CustomerSduiSchemaVersion | null;
  componentType: CustomerSduiComponentType | null;
  componentInstanceId: string | null;
  dataKey: CustomerSduiDataKey | null;
  actionKey: CustomerSduiActionKey | null;
  durationMs: number | null;
  attributes: CustomerSduiTelemetryAttributes;
}

export interface CustomerSduiTelemetrySink {
  send(events: readonly CustomerSduiTelemetryEvent[]): Promise<void>;
}

export interface CustomerSduiTelemetrySnapshot {
  bufferedEvents: number;
  droppedEvents: number;
  nextSequence: number;
  flushInProgress: boolean;
}

export interface CustomerSduiTelemetryFlushResult {
  delivered: boolean;
  eventCount: number;
  bufferedEvents: number;
}
