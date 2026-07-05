import type { CityCode } from "./city.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10E — Governance Evidence Bundle Types
// References-only evidence. No file generation, no download, no execution.
// ══════════════════════════════════════════════════════════════════

export type EvidenceBundleStatus =
  | "draft"
  | "attached_to_review"
  | "approved_for_governance_reference"
  | "archived";

export interface EvidenceRef {
  refType: string;
  refId: string;
  sourcePhase: string;
  sourceRoute: string;
  cityCode: string;
  statementId?: string | null;
  exportRecordId?: string | null;
  reviewId?: string | null;
  label: string;
  createdAt: string;
}

export interface Phase9Context {
  statementRef?: { statementId: string; cityCode: string } | null;
  exportReviewRef?: { exportId: string; cityCode: string } | null;
  detailRef?: { statementId: string; cityCode: string } | null;
}

export interface GovernanceEvidenceBundleRecord {
  id: string;
  cityCode: CityCode;
  intentId: string;
  reviewId: string | null;
  statementId: string | null;
  bundleStatus: EvidenceBundleStatus;
  evidenceRefs: EvidenceRef[];
  phase9Context: Phase9Context;
  reviewHistoryRefs: string[];
  auditTrailRefs: string[];
  riskSummary: string | null;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CreateEvidenceBundleRequest {
  cityCode: CityCode;
  intentId: string;
  reviewId?: string | null;
  statementId?: string | null;
  createdByAdminId: string;
  riskSummary?: string | null;
}

export interface AttachEvidenceRefRequest {
  refType: string;
  refId: string;
  sourcePhase: string;
  sourceRoute: string;
  cityCode: string;
  statementId?: string | null;
  exportRecordId?: string | null;
  reviewId?: string | null;
  label: string;
}

export interface GovernanceAuditTrailEntry {
  eventType: string;
  eventTimestamp: string;
  actorAdminId: string;
  targetType: string;
  targetId: string;
  cityCode: string;
  summary: string;
}

export interface EvidenceBundleResponse {
  ok: true;
  bundle: GovernanceEvidenceBundleRecord;
}

export interface EvidenceBundleListResponse {
  ok: true;
  bundles: GovernanceEvidenceBundleRecord[];
}

export interface AuditTrailResponse {
  ok: true;
  entries: GovernanceAuditTrailEntry[];
}
