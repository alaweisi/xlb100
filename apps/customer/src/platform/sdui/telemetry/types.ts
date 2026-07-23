import type {
  CustomerSduiActionKey,
  CustomerSduiComponentType,
  CustomerSduiDataKey,
  CustomerSduiPageId,
  CustomerSduiSchemaVersion,
} from "@xlb/types";

export const CUSTOMER_SDUI_TELEMETRY_EVENT_NAMES = [
  "page.view",
  "manifest.load",
  "manifest.validation",
  "manifest.fallback",
  "composition.render",
  "component.render",
  "component.exposure",
  "component.click",
  "data.load",
  "action.execute",
  "brand.asset",
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
  "brandState",
  "cacheTier",
  "cancelledCount",
  "circuitState",
  "componentOrder",
  "compositionStatus",
  "dataState",
  "deliveryReason",
  "deliverySource",
  "droppedEvents",
  "errorCode",
  "errorCount",
  "errorName",
  "fallbackSource",
  "fatalIssueCount",
  "freshCount",
  "issueCount",
  "metricName",
  "phase",
  "reasonCode",
  "recoverable",
  "region",
  "resolutionReason",
  "resultState",
  "source",
  "statusClass",
  "staleCount",
  "threshold",
  "timeoutCount",
  "unavailableCount",
  "visibleRatio",
  "warningIssueCount",
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
  sampledOutEvents: number;
  sampledIn: boolean;
  nextSequence: number;
  flushInProgress: boolean;
}

export interface CustomerSduiTelemetryFlushResult {
  delivered: boolean;
  eventCount: number;
  bufferedEvents: number;
}
