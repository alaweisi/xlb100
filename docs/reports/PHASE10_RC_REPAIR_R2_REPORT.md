# Phase 10 RC Repair R2 Report

Generated: 2026-07-05

## A. Scope
- **Commit**: b244e73
- **Inspection**: Claude Code second inspection flagged gate bypass, city scope, security tests, UI
- **R1 commit** (092ba82) attempted fixes; R2 built on top

## B. What R2 attempted
1. **Remove preflight Phase 10 bypass** — confirmed removed in R2
2. **Remove broad gate exemptions** — replaced with precise allowlists
3. **Fix intent list city scope** — enforced context cityCode, rejected query override
4. **Fix body cityCode mismatch** — reject instead of silent override
5. **Fix review path/body mismatch** — reject instead of silent override
6. **Fix cross-city relation integrity** — review/evidence/readiness cross-city verification
7. **Fix readiness recompute** — real cross-city validation
8. **Fix fake security tests** — 19 real contract-level tests
9. **Fix API client exports** — governanceReviewApi, governanceEvidenceApi, governanceReadinessApi

## C. Claude later inspection findings
- Most R2 functional fixes PASSED in later inspections
- 44 gate scripts modified with precise allowlists (no bypass)
- Reports still stale — blocking at R3/R4

## D. Gate Evidence (from R2/R3 sequence)
- pnpm typecheck: PASS
- Phase 9 regression: PASS
- Phase 10 tests: PASS
- Security tests: 19/19 PASS
- Preflight: PASS (after gate allowlist fixes)
- Forbidden execution: PASS

## E. Status
- NOT LOCKED
- No tag
- Reports repaired in R4 docs-only
