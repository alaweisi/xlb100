# Settlement Action Intent Contract (Phase 10B)

## Scope

This contract defines the `SettlementActionIntent` type and its associated governance-only types (`GovernanceActionKind`, `GovernanceActionStatus`, `PhaseBoundary`).

The `SettlementActionIntent` is a **governance draft/proposal** — it is NOT an execution command. It represents an administrator's intent to review, prepare, or flag a settlement action. No real payout, refund, reversal, ledger mutation, or settlement mutation is triggered by this contract.

## Business Rules

1. **Governance-Only**: All intents are governance drafts. Execution is permanently disabled during Phase 10 and will not be enabled until Phase 11.

2. **City Scope**: Every intent must be scoped to a specific `city_code`. The `__global__` sentinel is rejected.

3. **Target Entity**: At least one of `statement_id` or `target_ref` must be provided. Intents that reference no target entity are invalid.

4. **Action Kind Boundary**: Only the following governance action kinds are allowed:
   - `review_settlement_statement` — review a settlement statement
   - `prepare_payout_review` — prepare for payout review (not execute payout)
   - `prepare_refund_review` — prepare for refund review (not execute refund)
   - `prepare_reversal_review` — prepare for reversal review (not execute reversal)
   - `request_evidence_review` — request evidence/document review
   - `mark_governance_risk` — flag a governance risk

   The following execution kinds are **permanently forbidden** in Phase 10:
   - `execute_payout`, `pay_now`, `withdraw`
   - `execute_refund`, `reverse_ledger`
   - `mutate_settlement`, `commit_settlement`
   - `generate_export_file`, `execute_payment`
   - `provider_withdrawal`, `refund_reversal_execution`
   - `ledger_mutation`, `payment_execution`, `settlement_mutation`
   - `export_file_generation`, `download_export`

5. **Status Boundary**: Only the following governance statuses are allowed:
   - `draft` — initial draft state
   - `ready_for_review` — ready for governance review
   - `blocked` — blocked by a governance concern
   - `cancelled` — cancelled by administrator
   - `archived` — archived for audit trail

   The following execution/money-movement statuses are **forbidden**:
   - `paid`, `refunded`, `reversed`, `executed`, `settled`
   - `completed_as_money_movement`, `payout_completed`

6. **Evidence References**: `evidence_refs` contains reference IDs (export IDs, review IDs, outbox event IDs). It does NOT generate or download files.

7. **Risk Flags**: `risk_flags` are governance-only informational markers. They do NOT trigger any execution.

8. **Phase Boundary**: Every intent carries a `phase_boundary` block that MUST confirm:
   - `governance_only: true` — governance mode active
   - `execution_enabled: false` — execution permanently disabled
   - `persistence_enabled: false` — no DB persistence
   - `mutation_enabled: false` — no data mutation

## Schema

See `packages/validators/src/settlementActionIntentSchema.ts` for the Zod validation schema.

## Type Definition

See `packages/types/src/settlementActionIntent.ts` for the TypeScript type definitions.

## Phase Boundary

- **Phase 10B**: Contract defined. No persistence, no execution.
- **Phase 10C**: Persistence may be added (separate phase).
- **Phase 11**: Execution may be enabled (separate phase, requires explicit authorization).
