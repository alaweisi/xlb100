# Phase 27B B1 Notification Projection Foundation Implementation Report

> Status: **B1 ACCEPTED AFTER S4 INDEPENDENT PASS — SEQUENTIAL B2/27C AUTHORIZED**. This report covers only the dormant B1 foundation. It is not Phase27 completion, Lock, activation or production readiness.

## 1. Construction authority and baseline

- Human authorization date: `2026-07-13`.
- Authorized work: Phase27B B0 decision freeze plus B1 Notification Projection Foundation construction only.
- Repository: `G:\xlb100`.
- Branch: `codex/phase27b-notification-projection-foundation`.
- Exact stacked base: `7874355837430b8a803f09be731265fb20889073` (`feat(events): add Phase27A platform delivery foundation`).
- Phase27A remains human accepted but not locked. Phase25 remains the last LOCKED Phase.
- Phase14 remains `64/100`, `IN PROGRESS`, and staging/production `NO-GO`.

## 2. Delivered foundation

### 2.1 Claim-scoped Events handoff

Phase27A now exposes one narrow internal projection seam for Notification:

1. The caller must hold an exact active subscription and a `processing` delivery claim.
2. City, subscriber, subscription, delivery, event, owner, lease token, unexpired lease and delivery row version are checked before source compatibility projection.
3. Event type, synthetic major `0`, compatibility handler revision and stored source payload hash must agree with the exact subscription and current raw source shape.
4. Raw `event_outbox.payload_json` is read only inside `backend/src/events`; it is never returned to Notification.
5. The handoff returns only delivery/subscription/source identity, canonical Customer-or-Worker recipient identity, `orderId` or `ticketId`, occurrence time, synthetic major, handler revision and source payload hash.
6. Category-C fields such as SKU, amount, ticket category/priority/status/version/actor and all unknown fields are validated and then discarded.

The Notification target transaction locks and revalidates the same exact Phase27A claim before writing its own tables. It never mutates Platform delivery state; acknowledge/fail/retry/reaper/DLQ ownership remains in Phase27A.

### 2.2 Migration 055

`055_phase27b_notification_projection_foundation.sql` creates exactly eight empty, real-city Notification tables:

1. `notification_templates`
2. `notification_template_revisions`
3. `notification_recipient_preferences`
4. `notification_records`
5. `notification_delivery_receipts`
6. `notification_recipient_states`
7. `notification_actions`
8. `notification_tombstones`

Key guarantees:

- no seed, template, active pointer, subscriber, allowlist, activation, live-start, backfill or replay row;
- no external-channel intent/attempt table and no independent retry, lease, reaper or DLQ table;
- no `CASCADE`; all references use `RESTRICT`;
- record business key `(city_code,recipient_type,recipient_id,source_event_id,template_revision_id)`;
- durable receipt key `(subscriber_id,event_id)`;
- one unambiguous database delivery reference through Phase27A's canonical unique
  `(subscriber_id,event_id)` key; redundant delivery IDs that could point at a
  different row are deliberately absent from Notification persistence;
- frozen template revision, source hash, render-parameter hash and target fingerprint evidence;
- recipient state has row-version structure only; B1 exposes no read/archive/hidden/delete evaluator;
- tombstones contain hashes/revision/reason/version evidence and no raw content, render parameters, lease token or Provider body.
- the append-only action table reserves hashed idempotency evidence for later
  recipient-state APIs while remaining empty and exposing no executable API in B1.

### 2.3 Dormant Notification runtime

The new internal Notification module provides:

- deterministic canonical JSON/hash and target fingerprint policy;
- strict plain-text template rendering with an exact event-specific parameter allowlist;
- immutable published-revision lookup by explicit revision ID, with canonical content-hash verification;
- one transaction for record, durable receipt, initial recipient state and append-only action evidence;
- concurrency and ack-loss recovery returning the original canonical effect as `already_applied`;
- conflict rejection if a later attempt proposes a different frozen revision/fingerprint.

There is no scheduler, subscriber registration, API, route, API client, app page, Admin operation or application/server registration. The module is dormant until a separately authorized B2 activation package exists.

## 3. Boundary evidence

- Notification performs no `INSERT`, `UPDATE` or `DELETE` against `event_outbox` or protected domains.
- Notification does not call source Outbox claim/ack/fail/reaper functions.
- Notification only reads and locks the exact Phase27A delivery row to revalidate the target transaction; it does not mutate that row or the Phase27A attempt/action ledgers.
- `backend/src/app.ts`, `backend/src/server.ts`, `packages/api-client` and `apps/*` are unchanged.
- Migration `054` and migrations `000`–`053` are unchanged; migration `056+` does not exist.
- No real or mock SMS, Push, WeChat, Email or other messaging Provider was added.
- Historical phase Gates were extended only with exact 054/055 and module-owner allowlists so the current append-only repository state remains verifiable; their protected-domain rules were not relaxed.

## 4. Verification results

| Verification | Final result |
|---|---|
| Phase27A+27B contract/unit targeted | PASS — 4 files / 18 tests |
| Phase27A+27B integration/security targeted | PASS — 4 files / 12 tests |
| Phase27B direct boundary Gate | PASS |
| Phase27A regression boundary Gate | PASS |
| Migration 055 Gate | PASS — existing, empty, 000–054 upgrade, true partial-DDL, double replay; 8 tables empty; 93.4s |
| `npx pnpm typecheck --force` | PASS — 17/17, 0 cached |
| `npx pnpm build --force` | PASS — 11/11, 0 cached |
| `npx pnpm test` complete B1 run before S4 remediation | PASS — 190/190 files, 537/537 tests, 0 todo; 305.99s; S4 is covered by the focused evidence below and the repository-wide suite will run again at Phase27E |
| `npx pnpm preflight` | PASS |
| `git diff --check` | PASS |

Regression note: the first complete full-suite run found two Phase25 security assertions that required the historical literal `migration 054` in Gate source text. The Gate wording was corrected to retain that marker while also naming migration 055. The two focused historical Gate files then passed 7/7, and the subsequent complete full-suite run passed 190 files / 537 tests with no isolated substitution.

Non-blocking existing warnings: pnpm project configuration deprecation notices, Vitest workspace deprecation, migration process `DEP0190`, and the full-suite `MaxListenersExceededWarning`. No Phase23C timeout occurred.

## 5. Remaining blockers

The following are explicitly not implemented or authorized:

- B2 subscriber/event/city/synthetic-major allowlist, template publication policy and prospective live-start activation;
- B3 Customer/Worker own-list and mark-read APIs;
- B4 Customer/Worker UI;
- unread count, archive, hidden, delete, preference evaluator, retention execution, legal hold, redaction or physical deletion;
- Admin diagnostics/manual retry/template publication/four-eyes workflow;
- historical backfill or replay;
- external channels and Providers;
- migration `056+`, merge, tag, push or deployment.

## 6. Exit conclusion

Phase27B B1 is implementation-complete on its feature branch and is eligible for an independent read-only review. It must stop at this boundary. A PASS review may be submitted for human B1 acceptance, but neither review nor acceptance automatically authorizes B2, B3, B4, Phase27 Lock or production use.

## 7. Independent-review remediation S4

The first independent B1 review reported no P0, one P1 and one P2. Both were
remediated before any stage or commit:

1. **P1 — target-transaction TOCTOU**: the initial claim projection is now
   revalidated from the Events boundary inside the Notification target
   transaction. The locked query rechecks the exact delivery identity,
   owner/token/unexpired lease/row version, active subscriber, active
   subscription, live-start presence and compatibility handler revision. Events
   recomputes the current raw source canonical hash without returning the payload
   to Notification, compares it with both the delivery hash and frozen
   projection hash, rebuilds the minimal projection, and rejects any mismatch.
2. **P2 — split delivery references**: Notification records and receipts no
   longer persist a second delivery ID. Both use only Phase27A's database-unique
   `(subscriber_id,event_id)` key; receipt-to-record uses one seven-column
   composite FK. A real database negative test proves that one delivery key
   cannot be combined with another notification target.

The controlled interleaving test changes subscription status, handler revision
and current source payload after the initial projection but before target
transaction validation. All three paths fail closed with zero target effect.
Migration 055 remains exactly eight empty Notification tables, contains no
activation/seed/provider data, and still owns no retry/lease/DLQ lifecycle.

S4 focused verification:

| Verification | Result |
|---|---|
| Phase27A+27B contract/unit | PASS — 4 files / 18 tests |
| Phase27A+27B integration/security | PASS — 4 files / 14 tests; the remediated lifecycle file also passed an immediate isolated 3/3 repeat |
| Migration 055 Gate | PASS — existing/empty/000–054 upgrade/true partial-DDL/double replay; 89.8s |
| Workspace typecheck | PASS — 17/17, 0 cached |
| Phase27A and Phase27B direct boundary Gates | PASS |
| `git diff --check` | PASS |

The second independent read-only review reported P0/P1/P2/P3 all clear and
concluded **PASS — suitable for a predecessor commit**. The user's later unified
Phase27 A–E construction instruction waives intermediate wait states, so this
B1 evidence is accepted for sequential progression to B2/27C. Production
activation, external Providers, migration 056+, Phase28 and deployment remain
outside that authority.
