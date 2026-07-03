import { randomUUID } from "node:crypto";
import { XLB_HEADERS } from "@xlb/types";

export { XLB_HEADERS };

export function generateTraceId(): string {
  return randomUUID();
}

export function readTraceIdHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers[XLB_HEADERS.traceId];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function resolveTraceId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const existing = readTraceIdHeader(headers);
  if (existing && existing.trim().length > 0) {
    return existing.trim();
  }
  return generateTraceId();
}
