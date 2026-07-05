import type { ApiClient } from "./createApiClient.js";

// ── Phase 10C: Governance Intent API client ──

export interface GovernanceIntentApiResponse {
  id: string;
  cityCode: string;
  statementId: string | null;
  actionKind: string;
  actionStatus: string;
  targetType: string | null;
  targetRef: string | null;
  requestedByAdminId: string;
  requestedReason: string;
  evidenceRefs: string[];
  riskFlags: string[];
  phaseBoundary: {
    phase: string;
    governanceOnly: true;
    executionEnabled: false;
    persistenceEnabled: boolean;
    mutationEnabled: false;
  };
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  archivedAt: string | null;
}

export function createGovernanceIntentApi(client: ApiClient) {
  return {
    createDraft: (body: Record<string, unknown>) =>
      client.post<{ ok: true; intent: GovernanceIntentApiResponse }>(
        "/api/internal/settlement-action-governance/intents",
        body,
      ),

    getIntent: (id: string) =>
      client.get<{ ok: true; intent: GovernanceIntentApiResponse }>(
        `/api/internal/settlement-action-governance/intents/${encodeURIComponent(id)}`,
      ),

    listIntents: (query?: Record<string, string>) => {
      const qs = query ? "?" + new URLSearchParams(query).toString() : "";
      return client.get<{ ok: true; intents: GovernanceIntentApiResponse[] }>(
        `/api/internal/settlement-action-governance/intents${qs}`,
      );
    },

    cancelIntent: (id: string) =>
      client.post<{ ok: true; intent: GovernanceIntentApiResponse }>(
        `/api/internal/settlement-action-governance/intents/${encodeURIComponent(id)}/cancel`,
      ),

    archiveIntent: (id: string) =>
      client.post<{ ok: true; intent: GovernanceIntentApiResponse }>(
        `/api/internal/settlement-action-governance/intents/${encodeURIComponent(id)}/archive`,
      ),
  };
}

export const governanceIntentApi = { create: createGovernanceIntentApi };
