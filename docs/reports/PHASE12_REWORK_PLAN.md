# Phase 12 Rework Plan

## Diff Accounting
Codex found 31 files +2113/-42 vs main@6d77d46. CodeWhale's earlier report of 22 files was incorrect — it missed the gate updates and excluded modified (M) files vs untracked (??) files in the status count. Actual diff is 31 files.

## Fixes Mapping

| Fix | Target Files | Issue | Action |
|-----|-------------|-------|--------|
| F1 | envelopeService.ts:findLinkedPlan, createEnvelope | No mandatory plan rejection | Rewrite createEnvelope to require plan_status='generated', revalidate at create/freeze/approve, reject stale hashes |
| F2 | envelopeService.ts:freezeEnvelope | Nonexistent payable_amount column | Replace with worker_receivable_amount from worker_receivable_statements; fail-closed on snapshot error |
| F3 | envelopeService.ts:freezeEnvelope | Placeholder conflict metadata | Implement real conflict checks: amount drift, city_config hash, settlement cycle state, cancelled/voided statuses, refund/reversal absence as not_applicable |
| F4 | envelopeService.ts:createEnvelope, freezeEnvelope, approveEnvelope | No transaction wrapping | Wrap create+audit, freeze+audit, approve+audit in pool.getConnection() + beginTransaction/commit/rollback; check affectedRows=1 on conditional UPDATE |
| F5 | 026 migration | Single-column FK allows cross-city child rows | Add UNIQUE(id, city_code) on envelopes; change item/audit FK to composite (envelope_id, city_code) |
| F6 | preparationSchema.ts, preparation.contract.test.ts | Wrong validator fields | Rewrite validators to match actual service types; remove forbidden statuses from tests |
| F7 | 9 Phase 12 gate scripts | Superficial checks | Rewrite to inspect real source files, catch camelCase keywords, multiline SQL, require(), etc. |
| F8 | 9 Phase 9 allowlist scripts | Broad patterns | Narrow to exact file paths: 026_settlement_execution_preparation_envelope.sql, envelopeService.ts, envelopeRoutes.ts |
| F9 | All 4 test files | Disconnected mocks | Rewrite to test real service/validators; add missing-plan, stale-hash, cross-city, freeze-immutability, concurrent-freeze tests |

## Implementation Order
1. Migration F5 (DB constraints first)
2. Service F1-F4 (core logic)
3. Validators F6
4. Gates F7
5. Allowlist F8
6. Tests F9
7. Typecheck + preflight + full test suite
