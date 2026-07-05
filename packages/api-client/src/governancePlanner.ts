import type { ApiClient } from "./createApiClient.js";

// ── Phase 11: Dry-run Planner API client ──

export interface DryRunPlanResponse {
  planId: string;
  planHash: string;
  status: string;
  packetId: string;
  cityCode: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DryRunPlanItemResponse {
  planItemId: string;
  planId: string;
  statementId: string;
  workerId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  status: string;
  notes: string | null;
}

export interface DryRunPlanAuditEntry {
  auditId: string;
  planId: string;
  event: string;
  details: unknown;
  createdAt: string;
}

export interface DryRunEligibilityResponse {
  eligible: boolean;
  packetId: string;
  reason: string | null;
  checks: Record<string, boolean>;
}

export function createGovernancePlannerApi(client: ApiClient) {
  return {
    listSettlementDryRunPlans: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return client.get<{ ok: true; plans: DryRunPlanResponse[] }>(
        `/api/internal/settlement-action-governance/dry-run-plans${qs}`,
      );
    },

    getSettlementDryRunPlan: (planId: string) =>
      client.get<{ ok: true; plan: DryRunPlanResponse }>(
        `/api/internal/settlement-action-governance/dry-run-plans/${encodeURIComponent(planId)}`,
      ),

    createSettlementDryRunPlan: (packetId: string) =>
      client.post<{ ok: true; plan: DryRunPlanResponse }>(
        "/api/internal/settlement-action-governance/dry-run-plans",
        { packetId },
      ),

    getSettlementDryRunPlanItems: (planId: string) =>
      client.get<{ ok: true; items: DryRunPlanItemResponse[] }>(
        `/api/internal/settlement-action-governance/dry-run-plans/${encodeURIComponent(planId)}/items`,
      ),

    getSettlementDryRunPlanAudit: (planId: string) =>
      client.get<{ ok: true; entries: DryRunPlanAuditEntry[] }>(
        `/api/internal/settlement-action-governance/dry-run-plans/${encodeURIComponent(planId)}/audit`,
      ),

    getReadinessPacketDryRunEligibility: (packetId: string) =>
      client.get<{ ok: true; eligibility: DryRunEligibilityResponse }>(
        `/api/internal/settlement-action-governance/readiness-packets/${encodeURIComponent(packetId)}/dry-run-eligibility`,
      ),
  };
}

export const governancePlannerApi = { create: createGovernancePlannerApi };
