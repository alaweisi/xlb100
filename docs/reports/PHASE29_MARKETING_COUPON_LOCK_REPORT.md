# Phase 29 Marketing / Coupon Lock Report

Date: 2026-07-14
Status: **LOCKED ON LOCAL MAIN**

## Lock scope

Phase29 closes the conservative Marketing / Coupon MVP approved by decisions D01–D24:

- Marketing-owned Campaign, immutable fixed-amount Rule revision, Coupon Definition and customer Grant governance;
- explicit one-coupon selection with immutable server decision and Order-time atomic reservation/redemption;
- Pricing-owned gross, Marketing-owned discount decision and Order-owned gross/discount/net evidence;
- Customer coupon/quote surfaces and city-scoped Admin governance/audit;
- dormant cancel/full-refund compensation with exact Platform Delivery source revalidation;
- append-only migration `057_phase29_marketing_coupon.sql` with no business seed or activation row.

This Lock does not authorize automatic promotions, percentage/tiered discounts, multiple coupons, public redemption codes, behavioral segments, partial-refund return, payment-failure release, production activation, subscriber activation, historical backfill/replay, external Providers, deployment or push.

## Integration chain

- immutable Phase28 base: `d7bf3e02e3ae8e3e2ecf74c942fb7350040f1afc`;
- feature branch: `codex/phase29-marketing-coupon`;
- implementation commit: `8e4ceb6`;
- committed-candidate gate hardening: `84cd8fb` and `b25d2ce`;
- local `main` no-fast-forward merge: `4881532bd52f4dfeb601cde12e34384462a2a2d2`;
- canonical annotated tag: `xlb-phase29-marketing-coupon`, targeting the final Lock governance commit;
- Phase28 canonical tag remains immutable.

## Independent acceptance

The second independent read-only review concluded:

- P0: 0;
- P1: 0;
- P2: 0;
- P3: 0;
- decision: PASS.

The human then instructed that a passing acceptance be sealed and archived immediately. No review finding was waived.

## Verification evidence

| Evidence | Result |
|---|---|
| Phase29 aggregate Gate | PASS on feature and post-merge `main` |
| Phase29 unit/contract | 9 files / 61 tests PASS |
| Phase29 security | 1 file / 2 tests PASS |
| Phase29 real MySQL | 2 files / 9 tests PASS |
| Migration 057 | existing, empty, 000–056 upgrade, true partial-DDL, double replay, constraints and contradictory-SQL rejection PASS |
| Chromium real-API E2E | 1/1 PASS |
| Workspace typecheck | 17/17 PASS |
| Workspace build | 11/11 PASS |
| Post-merge unit/contract | 179 files / 986 passed plus 1 historical todo |
| Post-merge DB/security/integration | 198 files / 587 tests PASS |
| Architecture Preflight | PASS through Phase29 on feature and post-merge `main` |
| Diff hygiene | PASS |

## Committed-candidate gate hardening

Lock verification exposed that several historical gates scanned `main...HEAD` and therefore could not see uncommitted Phase29 work during construction. The candidate was committed before Lock, those gates then correctly rejected unknown later-phase files, and the following exact repairs were made without removing protected terms or widening to directory-level bypasses:

- Phase8J/K/L and Phase9B–E accept only the approved Phase29 refund semantics in exact files under multi-source authorization;
- Phase9A–C migration gates accept only `057_phase29_marketing_coupon.sql`;
- Phase9D/E and Phase11/12 accept only the approved Phase29 frontend files;
- Phase12 table-write ownership recognizes only exact Marketing tables and existing Order-owned snapshot tables;
- Phase23C provider scanning is restricted to first-party `apps/*/src` rather than thousands of dependency files, retaining the original 15-second hard timeout.

The complete workspace test, Preflight and Phase29 aggregate Gate passed again on the final feature tip and after the no-fast-forward merge.

## Data and production truth

- migrations `000`–`056` and all historical tags remain unchanged;
- migration `057` is recorded exactly once and contains no business seed or activation row;
- Marketing compensation remains dormant: no runner, scheduler, subscriber, subscription, live start, backfill or replay was activated;
- no production migration, deployment, push, Provider or production data processing occurred;
- Phase14 remains `64/100`, `IN PROGRESS`; staging and production remain `NO-GO`.

## Exit decision

Phase29 construction, independent acceptance, local main integration, post-merge verification and Lock governance are complete. The canonical tag `xlb-phase29-marketing-coupon` identifies the final governance commit. Phase30 and Phase31 are outside this Lock and must begin from this immutable baseline through their own session sync, entry decisions and phase boundaries.
