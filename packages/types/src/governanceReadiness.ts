import type { CityCode } from "./city.js";

export type ReadinessPacketStatus = "draft" | "checks_pending" | "blocked" | "ready_for_future_phase_review" | "archived";

export interface ExecutionBoundary {
  governanceOnly: true; executionEnabled: false; mutationEnabled: false;
  payoutEnabled: false; refundExecutionEnabled: false; ledgerMutationEnabled: false;
  settlementMutationEnabled: false; fileGenerationEnabled: false; downloadEnabled: false; providerDispatchEnabled: false;
}

export interface DryRunGuard {
  dryRunMode: "governance_guard_only"; executionSimulationEnabled: false; moneyMovementSimulationEnabled: false;
  providerSimulationEnabled: false; ledgerSimulationEnabled: false; refundSimulationEnabled: false; fileGenerationSimulationEnabled: false;
  guardReason: string; nextAllowedPhase: string;
}

export interface GovernanceReadinessPacketRecord {
  id: string; cityCode: CityCode; intentId: string; reviewId: string | null;
  evidenceBundleId: string | null; statementId: string | null; packetStatus: ReadinessPacketStatus;
  readinessChecks: Record<string, boolean>; blockerFlags: string[]; riskFlags: string[];
  sourceRefs: string[]; dryRunGuard: DryRunGuard; executionBoundary: ExecutionBoundary;
  createdByAdminId: string; createdAt: string; updatedAt: string; archivedAt: string | null;
}

export interface CreateReadinessPacketRequest { cityCode: CityCode; intentId: string; reviewId?: string | null; evidenceBundleId?: string | null; statementId?: string | null; createdByAdminId?: string; }

export interface ReadinessPacketResponse { ok: true; packet: GovernanceReadinessPacketRecord; }
export interface ReadinessPacketListResponse { ok: true; packets: GovernanceReadinessPacketRecord[]; }
