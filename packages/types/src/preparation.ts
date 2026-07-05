import type { CityCode } from "./city.js";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Settlement Execution Preparation Control Envelope Types
// Governance-only envelope. No execution fields anywhere.
// ══════════════════════════════════════════════════════════════════

export type PreparationEnvelopeStatus =
  | "draft"
  | "frozen"
  | "approved_for_phase13_review";

export interface PreparationEnvelopeRecord {
  id: string;
  cityCode: CityCode;
  sourcePacketId: string;
  intentId: string;
  reviewId: string | null;
  evidenceBundleId: string | null;
  readinessPacketId: string | null;
  envelopeStatus: PreparationEnvelopeStatus;
  itemCount: number;
  conflictCheckSnapshotHash: string | null;
  frozenAt: string | null;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationItemRecord {
  id: string;
  envelopeId: string;
  cityCode: CityCode;
  settlementBatchId: string;
  statementId: string | null;
  workerId: string;
  orderId: string;
  amount: number;
  currency: "CNY";
  itemStatus: string;
  createdAt: string;
}

export interface PreparationAuditEntry {
  id: string;
  envelopeId: string;
  cityCode: CityCode;
  eventType: string;
  eventTimestamp: string;
  actorAdminId: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface CreateEnvelopeRequest {
  sourcePacketId: string;
}
