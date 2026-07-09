import type { CityCode } from "./city.js";
import type { GovernanceActionKind, GovernanceActionStatus } from "./settlementActionIntent.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10C — Governance Intent Persistence Record
// Wraps SettlementActionIntent with DB storage metadata.
// Does NOT change Phase 10B execution boundary.
// ══════════════════════════════════════════════════════════════════

/**
 * Phase boundary for persisted governance intents.
 * Persistence is enabled in Phase 10C, but execution/mutation remain disabled.
 */
export interface GovernanceIntentPhaseBoundary {
  phase: string;
  governanceOnly: true;
  executionEnabled: false;
  persistenceEnabled: true;
  mutationEnabled: false;
}

/**
 * Governance Intent Record — the persisted form of a SettlementActionIntent.
 * This wraps the Phase 10B intent contract with DB storage metadata.
 */
export interface GovernanceIntentRecord {
  /** Unique record ID (DB primary key) */
  id: string;
  /** City scope (required) */
  cityCode: CityCode;
  /** Target settlement statement (nullable) */
  statementId: string | null;
  /** Governance action kind */
  actionKind: GovernanceActionKind;
  /** Governance action status */
  actionStatus: GovernanceActionStatus;
  /** Target entity type */
  targetType: string | null;
  /** Reference to target entity */
  targetRef: string | null;
  /** Admin user who requested */
  requestedByAdminId: string;
  /** Human-readable reason */
  requestedReason: string;
  /** Evidence references (JSON array of strings) */
  evidenceRefs: string[];
  /** Risk flags (JSON array of strings) */
  riskFlags: string[];
  /** Phase boundary metadata */
  phaseBoundary: GovernanceIntentPhaseBoundary;
  /** Record creation timestamp */
  createdAt: string;
  /** Record last update timestamp */
  updatedAt: string;
  /** Cancellation timestamp (null if not cancelled) */
  cancelledAt: string | null;
  /** Archive timestamp (null if not archived) */
  archivedAt: string | null;
}

/**
 * Request body for creating a governance intent draft.
 */
export interface CreateGovernanceIntentRequest {
  cityCode: CityCode;
  statementId?: string | null;
  actionKind: GovernanceActionKind;
  targetType?: string | null;
  targetRef?: string | null;
  requestedByAdminId?: string;
  requestedReason: string;
  evidenceRefs?: string[];
  riskFlags?: string[];
}

/**
 * Response for governance intent CRUD operations.
 */
export interface GovernanceIntentResponse {
  ok: true;
  intent: GovernanceIntentRecord;
}

/**
 * Response for listing governance intents.
 */
export interface GovernanceIntentListResponse {
  ok: true;
  intents: GovernanceIntentRecord[];
}

/**
 * Query parameters for listing governance intents.
 */
export interface GovernanceIntentListQuery {
  cityCode?: string;
  statementId?: string;
  actionStatus?: GovernanceActionStatus;
  limit?: number;
}
