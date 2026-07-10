# Phase 18 Fulfillment Evidence Foundation Report

Date: 2026-07-10
Status: LOCKED
Branch: `codex/phase18-fulfillment-evidence-oss-envelope`

## Objective

Phase 18 closes the field-service evidence gap against Wanshifu, Luban Daojia, and Zhuomuniao: worker evidence nodes, customer-visible proof, complaint-linked evidence, operator traceability, and customer confirmation or dispute. The implementation is production-shaped locally while remaining truthful about external infrastructure.

## Delivered

- Append-only migration `035` with `media_assets`, `fulfillment_evidence`, and `fulfillment_customer_confirmations`.
- Append-only migration `036` with composite city/order/fulfillment/complaint/media foreign keys.
- Shared types, validators, API clients, outbox events, and customer-confirmation state machine.
- Real private local filesystem provider and in-memory mock provider; no real OSS adapter.
- 5 MiB JPEG/PNG/WebP upload boundary with signature, extension, filename, and SHA-256 validation.
- Worker evidence upload/list UI, customer evidence confirmation/dispute UI, and admin order-trace evidence view.
- Evidence binding to city, order, fulfillment, and optional Phase 17 complaint.
- Completion-created evidence snapshot and terminal customer confirmation workflow.
- Authenticated private binary read with customer, worker, admin, and city isolation.

## Provider Truthfulness

The provider envelope cannot represent external success:

- provider is `local` or `mock`
- `externalProviderExecuted` is always `false`
- `publicUrl` is always `null`
- database checks enforce provider/status/name consistency
- unsupported provider configuration fails startup
- scan status explicitly says `not_malware_scanned_local`

## Boundaries

- No Alibaba OSS, S3, COS, Qiniu, or other cloud object-storage call.
- No public evidence URL.
- No payment, refund, ledger, settlement, payout, or dispatch assignment mutation.
- No real map/Amap integration.
- No edits to locked migrations.

## Verification

Formal gate: `scripts/check-phase18-migration-verification.ps1`.

Coverage details: `docs/reports/PHASE18_TEST_COVERAGE.md`.

Development checks completed before final lock verification:

- Phase 18 migration gate: 6 files / 25 tests passed after city-reference hardening.
- Monorepo typecheck: 17/17 tasks passed.
- Monorepo build: 11/11 tasks passed.
- Full repository suite: 270 files / 1,106 tests passed; 1 existing todo.
- Architecture preflight and Phase 18 boundary scan passed.

The single retained todo is `tests/contract/api.contract.test.ts:4` (`Phase 1: customer API contract`). It predates Phase 18; this phase added no todo.

City isolation is verified by active negative tests: cross-city admin reads return no rows, cross-city worker upload returns 404, and direct mismatched-city SQL insertion is rejected by composite foreign keys.

## Browser Verification

The current branch was served on isolated local ports with backend `3018`, customer `5183`, worker `5184`, and admin `5185`.

- Customer aftersale rendered the `Service Evidence` area, confirmation note, complaint selector, and private local/mock label.
- Worker task detail authenticated as `worker-demo-hangzhou` and rendered evidence node, image, complaint, note, upload, refresh, provider truthfulness, and customer-owned confirmation controls.
- Admin authenticated as the operator role, loaded a real order trace, and rendered fulfillment evidence and pending confirmation state.
- Browser console error count was zero.

The Phase 18 development candidate completed all required checks and was subsequently merged and tagged.

## Pre-Merge Lock Verification

Verification on `codex/phase18-fulfillment-evidence-oss-envelope`:

| Check | Result |
| --- | --- |
| `npx pnpm build` | PASS, 11/11 tasks |
| `npx pnpm typecheck` | PASS, 17/17 tasks |
| `npx pnpm test` | PASS, 270 files / 1,106 tests; 1 existing Phase 1 todo |
| `npx pnpm preflight` | PASS |
| Phase 18 migration gate | PASS, 6 files / 25 tests |
| Migrations | `035` and `036` each applied exactly once |
| Composite city foreign keys | 7 present |
| External provider execution / public URL / global-city rows | 0 / 0 / 0 |
| Docker infrastructure | MySQL and Redis healthy |
| Migration and seed replay | PASS and idempotent |
| A/W/C browser verification | PASS, zero console errors |

Phase 19 was not entered during this verification.

## Lock Conclusion

- Merged: yes, with `--no-ff`
- Feature commit: `8331be3`
- Main merge commit: `6afd770e2af7fcf1998a4fdc1c25dc683b2caf6c`
- Tag: `xlb-phase18-fulfillment-evidence-oss-envelope`
- Tag target: `6afd770e2af7fcf1998a4fdc1c25dc683b2caf6c`
- Branch and post-merge tests: 270 files / 1,106 passed; 1 existing Phase 1 todo
- Build, typecheck, architecture preflight, infrastructure, migration/seed replay, Phase 18 gate, and A/W/C browser verification: passed before and after merge
- External storage execution, public evidence URLs, and global-city evidence rows: zero
- Phase 19: not entered and no Phase 19 branch created
