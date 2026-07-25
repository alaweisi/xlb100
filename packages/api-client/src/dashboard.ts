import type {
  DashboardRealtimeResponse,
  DashboardRealtimeSnapshot,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSnapshot(value: unknown): DashboardRealtimeSnapshot {
  if (!isRecord(value) || value.contractVersion !== "1") {
    throw new TypeError("Dashboard response.snapshot must use contractVersion 1");
  }
  for (const key of [
    "scope",
    "headline",
    "fulfillment",
    "aftersale",
    "support",
    "privacy",
  ]) {
    if (!isRecord(value[key])) {
      throw new TypeError(`Dashboard response.snapshot.${key} must be an object`);
    }
  }
  for (const key of ["pulse", "attention", "cities", "sources"]) {
    if (!Array.isArray(value[key])) {
      throw new TypeError(`Dashboard response.snapshot.${key} must be an array`);
    }
  }
  for (const key of ["generatedAt", "observedAt"]) {
    if (typeof value[key] !== "string" || Number.isNaN(Date.parse(value[key]))) {
      throw new TypeError(`Dashboard response.snapshot.${key} must be an ISO timestamp`);
    }
  }
  const privacy = value.privacy as Record<string, unknown>;
  if (
    privacy.containsPersonalData !== false ||
    privacy.exactWorkerLocationIncluded !== false ||
    privacy.messageContentIncluded !== false
  ) {
    throw new TypeError("Dashboard response must preserve the no-personal-data boundary");
  }
  return value as unknown as DashboardRealtimeSnapshot;
}

export function validateDashboardRealtimeResponse(
  value: unknown,
): DashboardRealtimeResponse {
  if (!isRecord(value) || value.ok !== true) {
    throw new TypeError("Dashboard realtime response must be a successful object");
  }
  return { ok: true, snapshot: assertSnapshot(value.snapshot) };
}

export function createDashboardApi(client: ApiClient) {
  return {
    getRealtimeSnapshot(cityCode?: string) {
      const query = cityCode
        ? `?${new URLSearchParams({ cityCode }).toString()}`
        : "";
      return client.get<DashboardRealtimeResponse>(
        `/api/dashboard/realtime${query}`,
        { validate: validateDashboardRealtimeResponse },
      );
    },
  };
}

export type DashboardApi = ReturnType<typeof createDashboardApi>;
