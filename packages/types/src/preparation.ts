import type { CityCode } from "./city.js";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Settlement Execution Preparation Control Envelope Types
// Governance-only envelope. No execution fields anywhere.
// Valid statuses ONLY: draft, frozen, approved_for_phase13_review
// ══════════════════════════════════════════════════════════════════

export type PreparationEnvelopeStatus =
  | "draft"
  | "frozen"
  | "approved_for_phase13_review";

export interface PreparationEnvelopeRecord {
  id: string;
  cityCode: CityCode;
  sourcePacketId: string;
  sourcePlanId: string | null;
  envelopeStatus: PreparationEnvelopeStatus;
  payloadHash: string;
  itemHash: string | null;
  sourcePacketHash: string | null;
  sourcePlanHash: string | null;
  amountSnapshot: Record<string, unknown>;
  cityConfigSnapshotHash: string | null;
  settlementCycleSnapshotHash: string | null;
  conflictCheckSnapshotHash: string | null;
  conflictCheckSnapshot: Record<string, unknown>;
  frozenByAdminId: string | null;
  approvedByAdminId: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  frozenAt: string | null;
  approvedAt: string | null;
}

export interface PreparationItemRecord {
  id: string;
  cityCode: CityCode;
  envelopeId: string;
  itemType: string;
  itemRefId: string;
  plannedAction: string | null;
  itemOrder: number;
  createdAt: string;
}

export interface PreparationAuditEntry {
  id: string;
  cityCode: CityCode;
  envelopeId: string;
  eventType: string;
  eventTimestamp: string;
  actorAdminId: string | null;
  summary: string | null;
  traceId: string | null;
}

export interface CreateEnvelopeRequest {
  sourcePacketId: string;
}
