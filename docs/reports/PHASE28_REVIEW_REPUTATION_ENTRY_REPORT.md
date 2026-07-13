# Phase 28 Review / Reputation Entry Report

Date: 2026-07-13
Status: **ENTRY GATE PASS — CONSTRUCTION OPEN — EXIT NOT YET PASSED**

## 1. Session sync

| Item | Verified fact |
|---|---|
| Repository | `G:\xlb100` |
| Branch | `codex/phase28-review-reputation` |
| Base | `853f78af17262ca11fc829202af93972940903a8` |
| Phase27 | LOCKED at canonical tag `xlb-phase27-notification-foundation` |
| Latest locked migration | `055_phase27b_notification_projection_foundation.sql` |
| Next migration | `056`, only under the approved Phase28 package |
| Phase14 | `64/100`, `IN PROGRESS`, staging/production `NO-GO` |
| Forbidden | Phase29, push, production deployment/activation, changes to migrations `000`–`055` |

Mandatory startup skills were executed in order: `xlb-session-sync`, `xlb-context-map` including `reference.md`, `xlb-current-vs-target`, and `xlb-phase-boundary`. `xlb-phase-lock` was read only to define exit evidence; no Lock action was performed at entry.

## 2. Current-versus-target finding

Current Review is a real Customer order-review MVP, not a qualification or general content-audit module. It has one canonical writer, rating 1–5, required comment, paid/completed/customer/city guards and one review per order. Reputation, moderation sidecars, appeal, explicit source event major v1, Platform compatibility for Review, projection generations, Worker aggregate API and dedicated moderation UI did not exist at entry.

Phase28 evolves that implementation additively. It does not replace it, duplicate it or write aggregate results into Worker/Dispatch tables.

## 3. Entry review findings

| Severity | Finding | Entry disposition |
|---|---|---|
| P1 | existing-review result preceded order-owner validation | mandatory fix and wrong-owner regression proof |
| P1 | migration `030` uses single-column references and does not prove city alignment at DB level | append-only `056` composite-city hardening |
| P1 | Customer UI fabricated a fallback review comment | remove fallback and require actual input |
| P1 | source Outbox had no explicit event major while Platform adapter admitted only compatibility major 0 | add explicit source version and exact-major-v1 paths, including the seven-field visibility event |
| P2 | no dedicated Review security/concurrency/projection suite | Phase28 focused unit/contract/integration/security gates required |
| P2 | ordinary Admin order trace exposed full comment | redact unless dedicated audited moderator access |

## 4. Human decision closure

The fourteen-point conservative entry package was explicitly approved. Its canonical record is `PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md`; architecture and contract are frozen in `28_XLB_REVIEW_REPUTATION.md` and `CONTRACT_REVIEW_REPUTATION.md`.

Therefore the product/privacy/ownership Entry blocker is closed for engineering construction. The minimal `review.visibility.changed@1` contract is frozen to `reviewId`, `workerId`, `rating`, `fromVisibility`, `toVisibility`, `moderationVersion`, `occurredAt`, with decision/reason/comment/customer/city fields forbidden. Moderation lists are redacted for every role; full content requires same-city `admin` through the dedicated single-item content route, with one `moderation_detail` audit per successful read. Worker Reputation is self-scoped at `/api/worker/reputation`. Worker appeal discovery is separately limited to at most 100 items, each containing exactly `reviewId`, `visibility`, `moderationVersion`, `decidedAt`, `activeAppealStatus`, through the self/city-scoped `/api/worker/review-appeal-targets`; it is not a public Review list. Legal retention duration and production activation remain intentionally unresolved and continue to block production, not local Phase28 construction.

## 5. Construction work packages

| Gate | Work package | Exit evidence |
|---|---|---|
| E0 | approved decisions, boundaries and exact version contract | entry documents and static entry gate |
| E1 | contract/types/validators and immutable Review writer remediation | strict parse tests, owner-before-idempotency and UI truth tests |
| E2 | append-only migration `056` and city integrity | empty/existing/partial/double replay plus cross-city FK rejection |
| E3 | transactional review events and exact-major Platform compatibility | strict PII/version/reconciliation/claim-revalidation tests |
| E4 | moderation and appeal runtime/API | role/city/four-eyes/CAS/idempotency/zero-leak tests |
| E5 | generation-safe Reputation projection and reads | contribution retry/reversal/rebuild/cutover/protected-domain tests |
| E6 | Customer/Worker/Admin real-API UI | no fabricated data, comment redaction, responsive/browser evidence |
| E7 | aggregate acceptance and Lock readiness | full regression, typecheck, build, preflight, migration gate, independent review |

## 6. Entry conclusion

E0 passes: Phase27 is locked, migration numbering is available, Phase28 boundaries and human product/privacy decisions are explicit, and the P1 remediation list is frozen. Runtime/schema construction may proceed on the Phase28 branch.

This is not exit acceptance or Lock evidence. Phase28 must not be merged or tagged until E1–E7 pass and the final report is updated with observed results.
