# Phase 27B Notification Projection Foundation Entry Report

> Status: **B0 ACCEPTED / B1 CONSTRUCTION AUTHORIZED — NOT ACTIVATED**. This entry authorizes only the dormant Phase27B B1 foundation. It is not Phase27 completion, Lock, production readiness, or authority for B2, B3, B4, Phase28, or any external channel.

## 1. Authorization and verified baseline

- Human decision: the Phase27B runtime-entry decision package concluded **CONDITIONAL GO**, and the human explicitly accepted that decision on 2026-07-13.
- Human construction authority: Phase27B **B0 decision freeze** and **B1 Notification Projection Foundation** only.
- Repository: `G:\xlb100`.
- Immutable construction base: `7874355837430b8a803f09be731265fb20889073` (`feat(events): add Phase27A platform delivery foundation`).
- Construction branch: `codex/phase27b-notification-projection-foundation`, stacked on the accepted but not locked Phase27A commit.
- Phase25 remains the last LOCKED Phase. Phase27A is human accepted but not locked. Phase14 remains `64/100`, `IN PROGRESS`, and staging/production `NO-GO`.

## 2. B0 decision freeze

The accepted runtime-entry decision does not activate Notification. It freezes the minimum safe seam required before activation can be considered:

1. Notification may consume only an exact Platform Delivery claim through a claim-scoped minimal compatibility projection.
2. That projection must be bound to the exact city, subscriber, subscription, delivery, owner, lease token, unexpired lease, row version, handler revision/major, source event and source payload hash.
3. The projection may return only source identity/type/compatibility major/hash, canonical Customer-or-Worker recipient identity, approved event render parameters, and occurrence time.
4. Raw source payloads and category-C fields must remain inside the Events compatibility boundary. They may not enter Notification persistence, render output, logs, errors, DLQ evidence, tombstones, or audit payloads.
5. Notification must never directly claim, acknowledge, fail, reap, update, or otherwise write `event_outbox`.
6. Notification reuses the Phase27A delivery/attempt/action lifecycle. B1 must not establish a second retry, lease, reaper, replay, or DLQ subsystem.
7. A target effect, durable receipt, recipient state and audit evidence must be designed for one atomic transaction and deterministic idempotent recovery. B1 remains dormant and creates no executable subscriber, subscription, allowlist, template pointer, or data row.

## 3. Authorized B1 scope

B1 is restricted to the following construction envelope:

- append-only `db/migrations/055_phase27b_notification_projection_foundation.sql` with exactly eight empty Notification-owned tables;
- shared Notification contracts and validators;
- the narrow claim-scoped compatibility handoff from Phase27A;
- dormant recipient resolution, immutable template revision, in-app projection persistence, durable receipt, recipient state, append-only action/audit, and minimal tombstone foundations;
- focused unit, contract, integration, security, migration replay, partial-DDL, boundary Gate, and implementation reports;
- narrow additive changes to the accepted Phase27A handoff files only where required for the claim-scoped projection.

The exact migration 055 table set is frozen as:

1. `notification_templates`
2. `notification_template_revisions`
3. `notification_recipient_preferences`
4. `notification_records`
5. `notification_delivery_receipts`
6. `notification_recipient_states`
7. `notification_actions`
8. `notification_tombstones`

Migration 055 must be schema-only: zero seed, zero city/subscriber/subscription/event allowlist, zero template or revision data, zero active revision pointer, and zero activation. It must not contain external-channel intent/attempt tables or an independent retry/lease/DLQ ledger. Migrations `000` through `054` remain immutable, and migration `056+` is forbidden.

## 4. Decisions intentionally not opened by B1

All seven runtime-entry blocker groups remain closed to executable behavior:

| Blocker | B1 frozen treatment | Required before later entry |
|---|---|---|
| Initial allowlist | Empty schema only; no wildcard, global city, subscriber, event, or synthetic-major approval | B2 exact real-city/subscriber/event/major approvals |
| Live-start/backfill/replay | No boundary, tool, data, or execution path | Separate B2 prospective-only live-start decision; historical work separately authorized |
| Templates | Immutable empty template/revision structure only; no seed or active pointer | Exact locale, template, parameter and classification approval |
| Preferences/presentation | Structure only; no evaluator, unread count, archive, hidden, or delete semantics | Separate API/runtime semantic freeze |
| Retention/lifecycle | Non-destructive minimal tombstone structure only; no purge or physical deletion | Exact retention, legal-hold, redaction and deletion policy |
| Admin/four-eyes | No Admin route, UI, manual retry, publication or activation operation | Separate maker/checker authorization and permission design |
| External channels | Capability absent; no SMS, Push, WeChat, Email, Provider, channel intent or attempt | Independent future phase and Provider readiness |

## 5. Explicitly forbidden scope

- B2 activation, B3 API, B4 Customer/Worker UI, Phase27 Lock, or Phase28 work.
- Changes to `backend/src/app.ts`, `backend/src/server.ts`, public routes, `packages/api-client`, or any `apps/*` Notification wiring.
- Admin/OA/Dashboard features, external Providers, external delivery claims, or fake delivery success.
- Subscriber registration, initial allowlist, live-start, backfill, replay execution, manual retry, purge, or production data.
- Writes to `event_outbox`, Order, Payment, Dispatch, Ledger, Enterprise Webhook, Support, or any other protected source domain.
- Modification of migration `054` or any earlier migration; creation of migration `056+`.
- Merge, tag, push, deployment, production credential use, or a production-readiness claim.

## 6. Required exit evidence

B1 must stop after implementation and provide:

- exact-eight-table migration evidence for empty, existing, true partial-DDL and double replay states;
- contract/validator and claim-boundary tests;
- atomic persistence/idempotency, city/recipient isolation, source/protected-domain zero-write and bounded-error evidence;
- direct Phase27B boundary Gate, workspace typecheck/build, full regression, preflight and diff hygiene results;
- an implementation report reconciling the code, migration, test results and final Git inventory.

Passing B1 evidence makes the dormant foundation eligible for independent read-only review and human acceptance only. It does not authorize B2, B3, B4, activation, Lock, or production use.

## 7. Subsequent authorization addendum

After B1 construction and the S4 independent-review PASS, the user explicitly
authorized automatic completion of the remaining Phase27 A–E construction.
That later instruction supersedes only the intermediate B2/B3/B4 wait states in
this original entry report. It does not authorize production activation or
data, seed, historical backfill/replay, external channels/Providers, migration
056+, Phase28, push or deployment; dependency Gates and Phase14 staging/
production NO-GO remain mandatory.
