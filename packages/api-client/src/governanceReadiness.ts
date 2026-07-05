import type { ApiClient } from "./createApiClient.js";

export function createGovernanceReadinessApi(client: ApiClient) {
  return {
    createPacket: (body: Record<string, unknown>) => client.post<{ ok: true; packet: unknown }>("/api/internal/settlement-action-governance/readiness-packets", body),
    listPackets: (query?: Record<string, string>) => { const qs = query ? "?" + new URLSearchParams(query).toString() : ""; return client.get<{ ok: true; packets: unknown[] }>(`/api/internal/settlement-action-governance/readiness-packets${qs}`); },
    getPacket: (id: string) => client.get<{ ok: true; packet: unknown }>(`/api/internal/settlement-action-governance/readiness-packets/${encodeURIComponent(id)}`),
    recomputeChecks: (packetId: string) => client.post<{ ok: true; packet: unknown }>(`/api/internal/settlement-action-governance/readiness-packets/${encodeURIComponent(packetId)}/recompute-checks`),
    markBlocked: (packetId: string) => client.post<{ ok: true; packet: unknown }>(`/api/internal/settlement-action-governance/readiness-packets/${encodeURIComponent(packetId)}/mark-blocked`),
  };
}
export const governanceReadinessApi = { create: createGovernanceReadinessApi };
