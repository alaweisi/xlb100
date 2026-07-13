# Phase 27B B2 Notification Runtime Decision Report

> Status: **DECISIONS FROZEN — CONSTRUCTION AUTHORIZED — ZERO PRODUCTION ACTIVATION**. The user's unified Phase27 A–E construction authority permits sequential B2 implementation without another intermediate approval pause. It does not waive dependency Gates, Phase14 readiness, or any production prohibition.

## 1. Authority and predecessor truth

- Human authority date: `2026-07-13`.
- The user authorized the general-contractor window to complete Phase27 A–E sequentially and to freeze the minimum conservative B2/C/D decisions before executable use.
- Construction branch: `codex/phase27b-notification-projection-foundation`.
- Accepted B1 predecessor commit: `e3541a1` (`feat(notification): add Phase27B projection foundation`).
- Phase27A is human accepted but not locked. Phase27B B1 passed S4 independent review with no P0/P1/P2/P3.
- Phase25 remains the last LOCKED Phase. Phase27 remains `IN PROGRESS — NOT LOCKED`.
- Phase14 remains `64/100`, `IN PROGRESS`, and staging/production `NO-GO`.

This report freezes B2 runtime semantics only. Production credentials, production subscriber/subscription rows, production allowlists, production templates, deployment and production scheduling remain absent.

## 2. Zero-production-entry rule

B2 must preserve all of the following:

1. Production allowlist and seed data remain empty.
2. B2 must not create, register, activate, repair or mutate a subscriber or subscription.
3. B2 may consume only a pre-existing, exact, real-city subscription whose subscriber and subscription are both `active` and whose claim is valid under the Phase27A owner/token/unexpired-lease/row-version contract.
4. There is no wildcard subscriber, wildcard event, wildcard major, `__global__` business city or default-city fallback.
5. Test fixtures may create exact active rows only inside isolated test databases. They are evidence, not seed or production activation.
6. B2 may expose a dependency-injected internal run-once/service entry for tests and later controlled orchestration. It must not add a public route, Admin action, `app.ts`/`server.ts` auto-run, production scheduler or production credential.

If no exact active subscription and no exact published template exist, B2 performs no Notification target write. This is the expected production state until a separate readiness and activation decision exists.

## 3. Exact eligible event envelope

The closed B2 handler set is:

| Event | Synthetic major | Recipient | Exact template scope | Delivery class |
|---|---:|---|---|---|
| `order.created` | `0` | exact same-city `customer` resolved by the Events compatibility boundary | `inapp.order.created.customer` | mandatory in-app |
| `support.ticket.resolved` | `0` | exact same-city `customer` requester resolved by the Events compatibility boundary | `inapp.support.ticket.resolved.customer` | mandatory in-app |
| `support.ticket.resolved` | `0` | exact same-city `worker` requester resolved by the Events compatibility boundary | `inapp.support.ticket.resolved.worker` | mandatory in-app |

This supported-handler set is not a production subscription allowlist and does not activate either event. An executable attempt additionally requires all of the following to agree exactly:

- real `city_code` on service identity, subscriber, subscription, delivery and retained source event;
- subscriber ID, subscription ID, delivery ID, source event ID and event type;
- synthetic compatibility major `0` and the exact compatibility handler revision;
- delivery status `processing`, claim owner, lease token, unexpired lease and expected delivery row version;
- current source canonical payload hash, frozen delivery hash and claim-scoped projection hash;
- canonical Customer-or-Worker recipient and strict event-specific render-parameter shape.

Notification receives no raw payload, source category-C fields or lease credentials. It never claims or writes `event_outbox` and never mutates Order, Payment, Dispatch, Fulfillment, Support, Ledger, Settlement, Enterprise Webhook or any other protected domain.

## 4. Prospective-only live-start

- Every executable subscription must already contain a non-null prospective `live_start_created_at` and `live_start_event_id` boundary.
- B2 consumes only Phase27A deliveries created from source events at or after that exact boundary.
- B2 must not scan source history, materialize an older source row, move a live-start boundary backwards, synthesize a historical delivery, or bypass Phase27A materialization.
- No historical backfill or replay is authorized.
- No replay generation, replay request, bulk repair, import CLI or migration data statement may be added.
- Reprocessing an already claimed delivery after ack loss is ordinary idempotent recovery through the durable `(subscriber_id,event_id)` receipt; it is not historical replay.

## 5. Template selection freeze

B2 selects the template revision internally. A caller may not nominate an arbitrary revision ID for the executable B2 entry.

The lookup must be exact and deterministic:

1. Derive the canonical template key only from the closed event/recipient map above, then match one `notification_templates` row by real city, exact template key, exact event type and exact recipient type.
2. Require template status `published`.
3. Join only revisions for that exact city and template.
4. Require revision status `published`, locale exactly `zh-CN`, and PII level exactly `P1`.
5. Select the highest `revision_number`; use `template_revision_id` as the deterministic final ordering key.
6. Recompute and verify the canonical immutable content hash before rendering.
7. Freeze the selected revision ID, render-parameter hash, source payload hash and target fingerprint in the first committed target effect.

There is no locale fallback, cross-city fallback, recipient fallback, draft/reviewed fallback, lower/higher PII fallback or current-time re-render of an existing receipt. Missing or invalid exact scope fails closed with zero target effect and a canonical bounded Phase27A delivery failure.

Published revisions are immutable runtime inputs. B2 adds no create/update/publish/retire template API, no active-revision pointer and no Admin template workflow. An existing receipt always returns its original canonical revision and target; it never upgrades to a later published revision.

## 6. Mandatory in-app and preference rule

- Both supported events are mandatory in-app notifications.
- No opt-out, unsubscribe, preference override or no-row default evaluator is exposed for them.
- `notification_recipient_preferences` is not consulted by the B2 executable path for these events.
- B2 must not insert a preference row or claim that a preference was applied.
- This rule authorizes in-app projection semantics only. It does not authorize SMS, Push, WeChat, Email or any other external channel.

## 7. Read, unread and archive semantics

The canonical recipient-state interpretation is now frozen for later 27C API and 27D UI use:

- **Visible in the primary inbox**: `archived_at IS NULL AND hidden_at IS NULL`.
- **Unread**: visible in the primary inbox and `read_at IS NULL`; equivalently `read_at IS NULL AND archived_at IS NULL AND hidden_at IS NULL`.
- **Read**: `read_at IS NOT NULL`. Read is independent from archive.
- **Archive**: reversible presentation state represented by non-null `archived_at`.
- Archiving does not set, clear or otherwise mutate `read_at`.
- Archived records are excluded from the primary inbox and from unread results/counts.
- Restoring an archived record clears only `archived_at`; a never-read restored record becomes unread again, while a previously read restored record remains read.
- Mark-read, archive and restore use recipient/city/notification ownership checks followed by row-version CAS and durable idempotency evidence.
- Not-owner and cross-city cases fail without an existence oracle and with zero mutation.

B2 may add internal policy/repository primitives and tests for these semantics. Public Customer/Worker list, mark-read, archive and restore endpoints belong to sequential 27C construction; Customer/Worker pages belong to 27D.

## 8. Capabilities that remain absent

The following are not part of Phase27 B2–E and must have no executable path:

- hidden mutation or hidden-policy evaluator;
- delete, redaction execution, purge, retention worker or physical deletion;
- tombstone execution beyond the dormant B1 schema/evidence type;
- Admin, OA or Dashboard inbox;
- Admin template publication, diagnostics, manual retry or four-eyes UI;
- external-channel intent/attempt, Provider adapter, Provider credential or external delivery status;
- historical backfill or replay;
- production subscriber/template/allowlist seed or activation;
- public runtime activation route or production scheduler.

Migration `056` is reserved for Phase28. Phase27 B2, 27C, 27D and 27E must not create it or modify migrations `000` through `055`.

## 9. B2 failure and transaction rules

- Exact eligibility and template selection occur before the target transaction, then the Phase27A claim and current source hash are revalidated inside the target transaction before any Notification write.
- The first successful target transaction atomically commits the canonical notification record, durable receipt, initial recipient state and append-only action evidence.
- Target commit followed by ack loss returns the same durable receipt and canonical target on retry.
- Concurrent attempts result in one target and one receipt; a different revision/fingerprint fails closed as a projection conflict.
- Template absence/mismatch, unsupported event/major, city mismatch, claim mismatch, expired lease, source-hash mismatch and projection conflict use a closed canonical error catalog. Raw errors, payloads, render content, tokens and Provider bodies never enter errors, logs, DLQ or audit evidence.
- Phase27A continues to own acknowledge/fail/retry/lease/reaper/DLQ. Notification must not create a second lifecycle.

## 10. Required B2 boundary Gate

The direct B2 Gate must fail unless all of these hold:

| Gate area | Required assertion |
|---|---|
| Migration boundary | exactly migrations through `055`; `000`–`055` unchanged from the accepted predecessor; no `056+` |
| Production data | no seed, production subscriber/subscription, allowlist, template, active pointer or activation artifact |
| Existing subscription only | no INSERT/UPDATE/DELETE of Phase27A subscriber/subscription tables; exact active real-city subscription and non-null live-start checks |
| Event closure | executable set contains only `order.created@0` and `support.ticket.resolved@0`; no wildcard/fallback |
| Prospective boundary | no backfill/replay/import/history scan; no live-start rewind; no source materialization bypass |
| Template scope | exact city/canonical-template-key/event/recipient; `zh-CN`; `P1`; template+revision published; highest immutable revision selected deterministically |
| Mandatory semantics | both events mandatory in-app; preference repository is not called by materialization; no opt-out API |
| State semantics | unread predicate includes all three null checks; archive excludes primary list/unread; restore clears archive only; archive never writes `read_at` |
| Ownership | Customer/Worker recipient and real city derived from authenticated/internal context; no recipient switch or `__global__` business scope |
| Source protection | zero write to `event_outbox` and all protected domains; raw payload remains in Events boundary |
| Lifecycle ownership | no Notification retry/lease/reaper/DLQ; Phase27A claim/ack/fail remains canonical |
| Absent capability | no hidden/delete/purge/physical-delete/Admin-inbox/external-channel/Provider executable path |
| Entry boundary | no public runtime route, `app.ts`/`server.ts` auto-run, production scheduler, API client or app page in B2 |
| File boundary | exact B2 runtime/policy/repository/test/Gate/report allowlist only |

The Gate must also rerun the accepted Phase27A and Phase27B B1 direct boundary Gates so a B2 change cannot weaken claim-scoped isolation or the eight-table/zero-seed foundation.

## 11. Required B2 test matrix

| Layer | Required cases |
|---|---|
| Policy unit | exact two-event/major-0 closure; canonical template-key map; mandatory-in-app classification; no preference opt-out; unread/read/archive/restore truth table |
| Template unit | exact canonical key mapping and exact city/key/event/recipient scope; `zh-CN`; `P1`; published-only; highest revision; deterministic tie-break; content-hash validation; no fallback |
| Contract | no caller-supplied recipient; no arbitrary executable template revision; real city; strict render params; canonical errors; no raw/C-class fields |
| Runtime integration | pre-existing exact active subscription succeeds; missing/inactive/wrong-city/wrong-subscriber/wrong-event/wrong-major/wrong-handler/live-start-missing cases produce zero target effect |
| Prospective integration | source before boundary is never delivered; source at/after boundary may use an existing Phase27A delivery; no backfill/replay path exists |
| Event integration | exact `order.created` Customer and `support.ticket.resolved` Customer/Worker recipient projections; all category-C source fields absent from target/error/audit |
| Template integration | draft/reviewed/retired, wrong locale, wrong PII, cross-city, wrong key/event/recipient ignored; highest exact published immutable revision frozen |
| Transaction/concurrency | one atomic record/receipt/state/action; concurrent one-effect proof; ack-loss reuse; changed revision/fingerprint conflict; in-transaction claim/source revalidation |
| Preference integration | preference rows cannot suppress either mandatory event and are not read by the executable materializer |
| Recipient-state integration | mark-read CAS/idempotency; archive does not mark read; archive excluded from primary/unread; restore preserves read state; not-owner/cross-city zero-write |
| Security | source/protected-domain zero-write; no raw payload/log/error leakage; exact service identity; no Admin/external/hidden/delete/purge entry |
| Static boundary | no migration change/056, seed, activation, Provider, public route, API client, app page, backfill or replay tool |
| Regression | B1 focused suite, Phase27A/B1/B2 Gates, workspace typecheck/build, full test, preflight and diff hygiene |

Database integration fixtures must be isolated, uniquely named and cleaned up. Fixture activation does not constitute production activation evidence.

## 12. B2 exit condition

B2 may be considered complete only after its decision constants, internal runtime entry, exact-template selection, prospective-only and recipient-state semantics pass the matrix above and an independent read-only review reports no unresolved P0/P1.

B2 completion authorizes only sequential 27C construction under the already granted unified Phase27 A–E authority. It does not make production activation, deployment, Phase28, migration `056`, external channels or Phase14 readiness permissible.
