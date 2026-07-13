# Phase 27A Platform Delivery Foundation Implementation Report

> Status: **HUMAN ACCEPTED — NOT LOCKED**. T3 independent review passed with no P0/P1/P2/P3 findings and the Phase27A runtime foundation substage was human-accepted on 2026-07-13. Phase25 remains the last LOCKED Phase; Phase27 overall is not complete or locked, and Phase27B remains unauthorized.

## 1. Session Sync and construction baseline

- Repository: `G:\xlb100`.
- Session date: 2026-07-13.
- Required project instructions and the four required XLB skills were read and executed in order before construction.
- Verified starting branch and commit: clean `main` at `38fe944` (`docs: sync Phase 27 design governance state`).
- Verified governance truth: Phase25 was and remains the last LOCKED Phase; Phase26 and Phase27 were accepted as design only; Phase14 remained 64/100, IN PROGRESS, staging/production NO-GO.
- Verified migration ledger before entry: highest migration `053`; no `054` or `055` existed.
- Construction branch: `codex/phase27a-platform-delivery-foundation`.

## 2. Human authorization and scope

Human authorization on 2026-07-13:

> “批准 Phase27A Platform Delivery Foundation runtime entry。”

The authorization covers only append-only migration `054`, Platform Delivery types, validators, persistence, read-only source materialization, retained-source reconciliation, independent delivery lease/retry/reaper/DLQ behavior, internal controls, audit structures, and proportionate tests/gates.

It does not authorize Phase27B–27E, Phase28, migration `055`, subscription activation, live-start, backfill, replay execution, Notification behavior, public API/UI/client work, external delivery channels, production deployment, tag, merge, or push.

## 3. Modified and added files

### Governance and evidence

- `docs/CURRENT_STATE.md`
- `docs/reports/PHASE27A_PLATFORM_DELIVERY_ENTRY_REPORT.md`
- `docs/reports/PHASE27A_PLATFORM_DELIVERY_IMPLEMENTATION_REPORT.md`

### Contracts and validators

- `packages/types/src/platformDelivery.ts`
- `packages/types/src/index.ts`
- `packages/validators/src/platformDeliverySchema.ts`
- `packages/validators/src/index.ts`

### Migration and runtime foundation

- `db/migrations/054_phase27a_platform_delivery_foundation.sql`
- `backend/src/events/platformDeliveryPolicy.ts`
- `backend/src/events/platformEventCompatibility.ts`
- `backend/src/events/platformDeliveryRepository.ts`
- `backend/src/events/platformDeliveryService.ts`

### Tests and gates

- `tests/contract/platformDelivery.contract.test.ts`
- `tests/unit/platformDeliveryPolicy.test.ts`
- `tests/integration/platformDeliveryLifecycle.test.ts`
- `tests/security/phase27aPlatformDeliveryBoundaries.test.ts`
- `scripts/check-phase27a-platform-delivery-boundaries.ps1`
- `scripts/run-phase27a-migration-gate.mjs`
- `scripts/check-phase24-completion-boundaries.ps1`
- `scripts/check-phase25-closure.mjs`
- `scripts/check-phase25-gate1a.mjs`
- `scripts/check-phase25-gate1b.mjs`

The four historical gate changes are minimal forward-compatibility wiring. They permit only the exact authorized Phase27A migration/runtime file set when `CURRENT_STATE` contains the Phase27A runtime-entry authorization; other later migrations or protected changes remain fail-closed.

## 4. Contracts and validator boundaries

- Added explicit subscriber, exact-major subscription, checkpoint, delivery, attempt, action, claim, mutation, materialization, and reconciliation contracts.
- Added a non-human `platform_service` identity contract with `internal_domain_contract` credential kind. Customer, Worker, Admin, Operator, and Auditor-shaped identities are rejected; an authenticated city and subscriber cannot be overridden by request data.
- The internal credential kind is a domain boundary for this phase, not evidence of production-grade service authentication. Real service credential integration remains a later gate.
- Synthetic compatibility major `0` exists only in Platform metadata. It is not added to or written back to source events.
- Raw `order.created` and `support.ticket.resolved` inputs use exact key sets and strict types. Missing, extra, unknown, or mistyped fields fail closed without best-effort defaults.
- Raw payloads are hashed for delivery/audit correlation but are not copied into generic delivery or action tables.

## 5. Migration 054 data model and evidence

Migration `054_phase27a_platform_delivery_foundation.sql` creates seven additive InnoDB tables:

1. `platform_event_subscribers`
2. `platform_event_subscriptions`
3. `platform_event_materialization_checkpoints`
4. `platform_event_deliveries`
5. `platform_event_delivery_attempts`
6. `platform_event_replay_generations`
7. `platform_event_delivery_actions`

Important executable constraints include:

- Exact subscription uniqueness on `(city_code, subscriber_id, event_type, event_major_version)`; no version range.
- Delivery idempotency uniqueness on `(subscriber_id, event_id)`.
- Composite source FK `(city_code, event_id)` to `event_outbox`.
- Composite exact-subscription FK carrying city, subscription, subscriber, event type, and exact major.
- Real-city checks reject `__global__` for Platform business rows.
- Persistent delivery status, availability, lease owner/token/expiry, attempt count, policy maximum, row version, terminal timestamps, and bounded error fields.
- Attempts persist an irreversible lease-token hash rather than the raw token.
- All evidence-bearing FKs use `RESTRICT`; no cascade silently removes evidence.
- Terminal materialization rejection uniqueness on `(city_code, subscription_id_copy, subscriber_id_copy, event_id_copy, compatibility_handler_revision_copy, action_kind)` with a check requiring the copied subscription/handler/event/hash identity for every rejection.
- Replay/manual action tables contain control and audit metadata only. There is no replay executor or public execution entry.

The migration contains schema DDL and its final ledger marker only. It inserts no city, subscriber, subscription, allowlist, activation, live-start, backfill, replay, or business data. `CREATE TABLE IF NOT EXISTS` plus the marker-last pattern was verified by actually executing only the first three `CREATE TABLE` statements in an isolated 000–053 database, writing no 054 marker, and then running the formal migration runner to create the remaining four tables and one marker. A second runner invocation skipped the complete ledger. Migrations `000`–`053` were not modified, and the accepted seven-table design remains seven tables.

## 6. Materialization and reconciliation

- Candidate scanning reads source `event_outbox` rows only and uses the `(created_at, event_id)` checkpoint strictly as a scan optimization.
- Correctness for retained source rows is supplied by an anti-join reconciliation query and the `(subscriber_id, event_id)` database unique key.
- Repeated candidate scans and reconciliations are idempotent no-ops at the delivery boundary.
- Missing retained-source deliveries are repaired with a bounded `reconciliation_repair` action record.
- Every reconciliation batch records only `partial`. A bounded anti-join check may describe gaps observed during that invocation, but it cannot establish a terminal source boundary.
- Incompatible raw events converge to one terminal rejection fact per exact subscription/subscriber/source-event/handler revision. Reconciliation excludes that rejection fact from the observed gap set, while the reconciliation checkpoint itself remains non-terminal `partial`.
- Rejection rows contain only an allowlisted canonical classification, copied identifiers/revision and payload hash. They do not copy raw payload/PII, create a delivery/target effect, or acknowledge source success.
- No active exact subscription means no materialization or claim work. Proposed, paused, revoked, wrong-city, wrong-subscriber, wrong-event, and wrong-major cases fail closed.

The integration suite uses two real concurrent MySQL connections to exercise commit skew: transaction A inserts an older event and delays commit; event B commits and advances the candidate checkpoint; A then commits behind that checkpoint; candidate scanning does not see A, while retained-source anti-join reconciliation repairs exactly one missing delivery. The repair run and every later zero-gap observation remain `partial`, create no duplicate, and leave both source rows in their original lifecycle state.

Phase27A has no source commit sequence, watermark, or other verifiable commit frontier. Consequently, neither `(created_at,event_id)`, a retained-source anti-join, nor any finite number of ordinary post-check queries can exclude an eligible transaction that commits after the last query and before checkpoint persistence. The runtime therefore makes no completeness inference from a zero-gap observation.

## 7. Independent delivery lifecycle

- Claim operates only on Platform delivery rows with atomic row locking and one effective lease per delivery.
- A claim records owner, random token, expiry, attempt count, row version, and a separate attempt row.
- Acknowledge/fail require matching subscriber, city, subscription, owner, token, unexpired lease, and expected row version.
- The locked delivery `SELECT`, duplicate-attempt lookup, delivery CAS, and attempt close all bind `request.subscriptionId`. A second active exact subscription owned by the same city/subscriber cannot acknowledge or fail the first subscription's delivery.
- Wrong owner/token, stale version, or expired lease returns conflict without mutation.
- Repeated acknowledge/fail has an explicit `already_applied` result when the requested terminal/retry outcome is already established.
- Failure uses a closed canonical code/message projection and either schedules `retry_wait` or transitions to the independent `dead_letter` state at the configured attempt maximum.
- Reaper changes only expired Platform leases, closes the attempt as `lease_expired`, records an audit action, and returns the delivery to retry/DLQ according to policy.
- One subscriber's dead letter does not block another subscriber's claim for the same source event.
- Lease and retry defaults are explicit safety defaults for tests/internal construction and are not final operations policy.

## 8. City, identity, and protected-domain boundaries

- Repository queries carry the authenticated service identity's city and subscriber through subscription lookup, materialization, claim, acknowledge/fail, and reaping.
- Customer/Worker/Admin-shaped identities, cross-city identities, mismatched subscribers, and `__global__` business city values are rejected.
- There is no public activation, replay, or Platform Delivery HTTP route.
- The database starts with no Platform subscribers/subscriptions, so the default state exposes no materializable or claimable work.
- Integration snapshots verify that materialization, reconciliation, claim, failure, retry, reaping, DLQ, and acknowledgement do not modify source `event_outbox` lifecycle columns.
- The same lifecycle test snapshots row counts for Dispatch, Ledger, Enterprise Webhook, Order, Payment, and Support protected tables and confirms zero change.
- The implementation does not call source claim/ack/fail/reaper APIs and does not change existing Dispatch, Ledger, or Enterprise Webhook consumers.

## 9. S2 independent-review remediation

1. **Reconciliation evidence (superseded by S3 terminality correction):** retained bounded pagination, remaining-gap observation and commit-skew detection, but S3 removes the former terminal inference. Every Phase27A reconciliation result and checkpoint is now `partial`.
2. **Exact-subscription completion:** bound delivery selection, duplicate result lookup, final CAS, and attempt completion to the requested exact subscription. Cross-subscription acknowledge/fail returns conflict with delivery, attempt, source and protected domains unchanged.
3. **Bounded rejection convergence:** reused the existing action table, added copied exact subscription/handler identity plus a database composite unique key, made duplicate rejection insertion a no-op, and excluded terminal rejection facts from unresolved reconciliation gaps. No eighth table, new migration, or synthetic-major semantic change was introduced.
4. **True partial-DDL gate:** replaced marker-deletion simulation with three isolated database scenarios: empty sequential migration; fully marked 000–053 upgrade; and a real interruption after the first three 054 table DDL statements with no marker, followed by formal-runner recovery and double replay.

New integration evidence covers three events with reconciliation limit two, bounded remaining-gap and zero-gap observations that both stay partial, repeated reconciliation, real delayed commit, repeated invalid candidate/reconciliation attempts, one rejection fact, cross-subscription acknowledge denial, cross-subscription fail denial, and source/protected-domain zero-write regression.

## 10. S3 second-round focused remediation

### 10.1 Non-terminal reconciliation evidence only

- Removed the `hasReconciliationGap + recordReconciliation` decision path that could persist `complete`.
- Renamed the checkpoint writer to `recordPartialReconciliation`; it has no result parameter and writes only the migration `054` status `partial`.
- Narrowed `PlatformReconciliationResult.completeness` to the literal `partial`. Phase27A runtime contains no executable `complete` result path; the migration enum value remains reserved for a future capability that would require a separately approved verifiable commit frontier.
- Did not add a source commit sequence, producer lock, extra query pass, eighth table, migration `055`, or any change to the seven-table migration ledger.
- Added a deterministic real-MySQL race: the first repair is followed by a confirmed zero-gap observation; a new eligible source transaction commits inside the repository hook immediately before checkpoint persistence; the checkpoint remains `partial`; the next reconciliation repairs the late event; later runs do not duplicate either delivery; both source lifecycle snapshots and all protected-domain counts remain unchanged.
- The boundary gate now searches the complete Phase27A runtime file set and fails if an executable quoted `complete` value, the old result writer, raw error inspection, or source/protected-domain write appears.

Canonical interpretation shared by the return result, persisted checkpoint status, and this report:

> 本轮已修复当前观察到的 retained-source gap，但由于不存在可验证 commit frontier，结果保持 non-terminal/partial；后续 reconciliation 继续发现并修复迟提交事件。

### 10.2 Strict allowlisted error projection

- Replaced regex-based message cleaning and arbitrary `error.code` preservation with `PLATFORM_DELIVERY_CANONICAL_ERRORS`, a closed code-to-fixed-message catalog.
- Only `PlatformDeliveryCanonicalError`, a controlled internal error type, may preserve an approved canonical code. Projection derives the fixed message from the catalog and never trusts the instance message. A plain object or external `Error` is generic even when it carries the text `INVALID_EVENT_PAYLOAD` or `LEASE_EXPIRED` in its own `code` property.
- Unknown `Error`, unknown/custom `error.code`, strings, objects and Provider-shaped failures all map to `PLATFORM_DELIVERY_ERROR` / `platform delivery failed`.
- Delivery and attempt persistence reuse one projection object in the same transaction. Reaper and materialization-rejection action evidence use the same fixed catalog. Runtime does not log raw error or payload values.
- Policy tests cover JSON, phone number, address, name, token, Authorization, credential/Provider body, HTML, XML, multiline text and custom/spoofed codes. Integration evidence queries both delivery and attempt after failure, proves all raw values absent, verifies the generic mapping, then verifies an approved internal canonical code/message through retry and DLQ while duplicate-fail and CAS behavior remain unchanged.

## 11. Verification commands and exact results

Final successful evidence:

- `npx pnpm exec vitest run --workspace vitest.workspace.ts --project unit-contract tests/contract/platformDelivery.contract.test.ts tests/unit/platformDeliveryPolicy.test.ts` — exit `0`; `2` files and `10` tests passed (`6` contract, `4` unit).
- `npx pnpm exec vitest run --workspace vitest.workspace.ts --project db-serial tests/integration/platformDeliveryLifecycle.test.ts tests/security/phase27aPlatformDeliveryBoundaries.test.ts` — exit `0`; `2` files and `10` tests passed (`9` integration, `1` security).
- Combined Phase27A focused evidence — `4` files and `20` tests passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase27a-platform-delivery-boundaries.ps1` — exit `0`; `check-phase27a-platform-delivery-boundaries: passed`, including the runtime no-`complete`, strict error allowlist, raw-error/logging, source-write and protected-domain-write checks.
- `node scripts/run-phase27a-migration-gate.mjs` — exit `0`; `Phase 27A migration 054 empty/existing/true-partial-DDL/double-replay Gate PASS` (`84.0s` process wall time).
- `npx pnpm typecheck --force` — exit `0`; Turbo `17 successful, 17 total`, `0 cached`.
- `npx pnpm build --force` — exit `0`; Turbo `11 successful, 11 total`, `0 cached`.
- `npx pnpm test` — exit `0`; `188` test files and `535` tests passed; duration `324.32s` reported by Vitest (`349.8s` process wall time). No Phase23C timeout occurred and no historical Phase23C implementation or test was modified.
- `npx pnpm preflight` — exit `0`; all configured architecture, historical boundary, ledger replay/immutability, Phase governance, Phase24 closure, and Phase25 closure checks passed (`56.9s` process wall time).
- `git diff --check` — exit `0` after final report/status refresh.

The first full-test iteration exposed test-city contamination from concurrent suites and historical Phase25 gates that globally rejected all future `054` files. The Phase27A integration fixture was isolated to a transient test-only city and cleans it after the suite. Historical gates were narrowed to the exact authorized 054/runtime files. A Phase23C timing failure from the first overloaded run passed in isolation and also passed in the final full run; no historical Phase23C implementation or test was changed.

The first two preflight attempts separately exposed historical Phase24 and Phase25 closure checks that treated any future backend/db work as prohibited. Each was minimally made authorization-aware and tested directly; the third full preflight passed.

During S2 gate development, the first isolated 000–053 baseline attempt failed before 054 because the temporary harness connection did not enable MySQL `multipleStatements`. The temporary database was deleted by `finally`; enabling that option only on the isolated gate connection fixed the harness, and both subsequent complete migration-gate runs passed. The formal migration runner was not changed.

## 12. Known risks and unresolved gates

- Production-grade service credentials are not present. The current internal identity contract prevents human-token substitution but still requires a later credential integration and security review.
- There are no subscribers or subscriptions, and no operational activation workflow. This is intentional and means the default runtime has no work.
- Retry limits and lease durations require explicit product/operations approval before any later activation.
- Retained-source reconciliation can repair only rows still retained in `event_outbox`; retention policy and operational reconciliation cadence remain later decisions.
- Phase27A has no verifiable source commit frontier, so reconciliation is permanently non-terminal `partial` in this runtime. Later runs may discover and repair eligible transactions that commit after an earlier bounded observation.
- No replay execution path exists. Replay-generation/action tables are evidence/control foundations only.
- Phase14 remains 64/100, IN PROGRESS and staging/production NO-GO. Its secrets, provider, backup/restore, monitoring, deployment, rollback, and approval blockers remain effective.
- Independent review must re-check migration DDL/FKs, real commit-skew evidence, source/protected zero-write evidence, service-identity limitations, and the historical-gate forward-compatibility allowlists before acceptance.

## 13. Explicitly not implemented or authorized

- Migration `055` or later.
- Subscriber, subscription, allowlist, city, live-start, or activation seed data.
- Notification projection, template, preference, inbox, recipient resolution, unread/archive/hide/delete behavior, API, API client, route, or page.
- SMS, Push, WeChat, Email, or any external channel integration.
- Live backfill, replay execution, automatic destructive purge, or source Outbox mutation.
- Changes to Order, Payment, Dispatch, Ledger, Enterprise Webhook, Support business state, or existing source consumer lifecycle.
- Phase27 completion/Lock/tag, main merge, push, deployment, or Phase27B entry.

## 14. T3 independent review and human acceptance

- **Independent review**: T3 completed on 2026-07-13 with no P0, P1, P2 or P3 findings and concluded PASS, suitable for human Phase27A acceptance.
- **T3 verification**: contract/unit `2 files / 10 tests`, integration/security `2 files / 10 tests`, Phase27A boundary gate, migration 054 empty/existing/true-partial-DDL/double-replay Gate, typecheck `17/17`, build `11/11`, full regression `188 files / 535 tests`, preflight and `git diff --check` all passed.
- **Human acceptance instruction**: “直接发给窗口t，继续别停，抓紧施工” on 2026-07-13, explicitly continuing the prior recommendation to accept and close Phase27A.
- **Accepted scope**: only the Phase27A Platform Delivery Foundation runtime substage on `codex/phase27a-platform-delivery-foundation`. This acceptance is not a Phase27 completion, Lock, main merge, tag, push, deployment, subscription activation, live-start, replay or production-readiness decision.
- **Readiness boundary**: Phase14 remains `64/100`, `IN PROGRESS`, and staging/production `NO-GO`. Production-grade service credentials and subscriber activation remain absent.
- **Next-phase boundary**: migration `055`, Notification projection/API/client/UI/Provider work and all Phase27B+ runtime remain unauthorized until a separate human runtime-entry decision.
