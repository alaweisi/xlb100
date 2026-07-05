# Phase 12 Rework v2 Plan

## Diff Accounting
CodeWhale R1 reported 31 files +2569/-895. Codex v2 found 46 files +3812/-67. Delta: dist/ files (packages/validators/dist/, packages/types/dist/) are auto-generated and were counted by Codex but not reported by CodeWhale. Actual source diff is 31 files as reported.

## Fixes Mapping

| Fix | Files | Action |
|-----|-------|--------|
| F1 | envelopeService.ts:validateSourceReadiness, createEnvelope, freezeEnvelope, approveEnvelope | Revalidate review_status at create/freeze/approve. Return HttpError on stale, never stale_or_conflict status. |
| F2 | envelopeService.ts:freezeEnvelope | Use Phase 11 item types (settlement_batch/payable/item/ledger_accrual) to resolve amounts. Fail closed on missing sources. |
| F3 | envelopeService.ts:freezeEnvelope | Scope conflict checks to envelope's source packet/plan, not city-wide. Compute deterministic conflict_check_snapshot_hash. Block freeze on cancellations/voids/duplicates. |
| F4 | envelopeService.ts:freezeEnvelope, approveEnvelope | Add conflict_check_snapshot_hash to immutable payload. Revalidate source before freeze/approve. Post-readback city-scoped. Prevent regression. |
| F5 | migration 026 | Make source_plan_id NOT NULL. Add UNIQUE(city_code, source_packet_id). Add conflict_check_snapshot_hash column. |
| F6 | preparationSchema.ts, preparation.ts, contract test | Align types/validators. Remove stale_or_conflict from status enum. |
| F7 | 9 gate scripts | Add unsafe fixture tests. Remove broad exemptions. Catch split SQL. Block forbidden module zones. |
| F8 | Phase 9 scripts | Remove broad preparation|PHASE12|REWORK. Replace with exact file paths. |
| F9 | 4 test files | Import real service. Test real create/freeze/approve. Gate rejection of unsafe fixtures. |
