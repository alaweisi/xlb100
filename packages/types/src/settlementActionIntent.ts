import type { CityCode } from "./city.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10B — Settlement Action Intent Contract
// Governance-only intent types. These are NOT execution commands.
// Execution is forbidden in Phase 10; see Phase 11.
// ══════════════════════════════════════════════════════════════════

/**
 * Allowed governance intent action kinds.
 * These are governance review/preparation actions — NOT execution.
 */
export type GovernanceActionKind =
  | "review_settlement_statement"
  | "prepare_payout_review"
  | "prepare_refund_review"
  | "prepare_reversal_review"
  | "request_evidence_review"
  | "mark_governance_risk";

/**
 * Allowed governance intent statuses.
 * These are governance lifecycle statuses — NOT execution outcomes.
 */
export type GovernanceActionStatus =
  | "draft"
  | "ready_for_review"
  | "blocked"
  | "cancelled"
  | "archived";

/**
 * Phase boundary metadata — must always indicate governance-only mode.
 */
export interface PhaseBoundary {
  /** Current phase: "10B" during Phase 10B, updated in later phases */
  phase: string;
  /** Governance-only: execution is permanently disabled in Phase 10 */
  governanceOnly: true;
  /** Execution is disabled until Phase 11 */
  executionEnabled: false;
  /** Persistence is NOT enabled in Phase 10B */
  persistenceEnabled: false;
  /** Mutation is NOT enabled in Phase 10B */
  mutationEnabled: false;
}

/**
 * Settlement Action Intent — a governance draft/proposal.
 *
 * This is NOT an execution command. It defines the shape of a governance
 * intent to review, prepare, or flag settlement actions. No real payout,
 * refund, reversal, ledger mutation, or settlement mutation is triggered
 * by this contract.
 */
export interface SettlementActionIntent {
  /** Unique intent identifier */
  intentId: string;
  /** City scope (required) */
  cityCode: CityCode;
  /** Target settlement statement (optional — some intents may not target a specific statement) */
  statementId: string | null;
  /** Governance action kind — must be an allowed governance intent kind */
  actionKind: GovernanceActionKind;
  /** Governance action status — must be an allowed governance status */
  actionStatus: GovernanceActionStatus;
  /** Target entity type for the intent (e.g., "statement", "batch", "payable") */
  targetType: string | null;
  /** Reference to the target entity ID */
  targetRef: string | null;
  /** Admin user who requested this intent */
  requestedByAdminId: string;
  /** Human-readable reason for the governance action */
  requestedReason: string;
  /** References to evidence (export IDs, review IDs, outbox event IDs) — no file generation */
  evidenceRefs: string[];
  /** Governance risk flags — informational only, not execution triggers */
  riskFlags: string[];
  /** Phase boundary metadata confirming governance-only mode */
  phaseBoundary: PhaseBoundary;
  /** Timestamp when intent was created */
  createdAt: string;
  /** Timestamp when intent was last updated */
  updatedAt: string;
}
