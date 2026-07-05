import type { ApiClient } from "./createApiClient.js";

export function createGovernanceEvidenceApi(client: ApiClient) {
  return {
    createBundle: (body: Record<string, unknown>) => client.post<{ ok: true; bundle: unknown }>("/api/internal/settlement-action-governance/evidence-bundles", body),
    listBundles: (query?: Record<string, string>) => { const qs = query ? "?" + new URLSearchParams(query).toString() : ""; return client.get<{ ok: true; bundles: unknown[] }>(`/api/internal/settlement-action-governance/evidence-bundles${qs}`); },
    getBundle: (id: string) => client.get<{ ok: true; bundle: unknown }>(`/api/internal/settlement-action-governance/evidence-bundles/${encodeURIComponent(id)}`),
    attachRef: (bundleId: string, body: Record<string, unknown>) => client.post<{ ok: true; bundle: unknown }>(`/api/internal/settlement-action-governance/evidence-bundles/${encodeURIComponent(bundleId)}/refs`, body),
    getAuditTrail: (intentId: string) => client.get<{ ok: true; entries: unknown[] }>(`/api/internal/settlement-action-governance/audit-trail/${encodeURIComponent(intentId)}`),
  };
}
export const governanceEvidenceApi = { create: createGovernanceEvidenceApi };
