# Phase27C Notification API Implementation Report

Date: 2026-07-13

Status: INDEPENDENT REVIEW PASS — PHASE27E INPUT

Phase27 overall: NOT LOCKED

Production: NO-GO

## Scope delivered

Phase27C exposes only the authenticated Customer and Worker recipient's own
same-city in-app inbox:

- list inbox/archive using a signed scope-and-view-bound keyset cursor;
- unread count using `read_at IS NULL`, `archived_at IS NULL` and
  `hidden_at IS NULL` together;
- mark read with row-version CAS and a hashed idempotency key;
- archive and reversible restore without implicitly changing read state;
- strict public DTO validation and a shared Customer/Worker API Client.

Scope is derived from `RequestContext` only. Caller-provided city, recipient or
role fields are not accepted. Cross-city, cross-recipient and hidden mutations
are folded to the same 404 result. Unknown server failures return a generic
Notification error without persisting raw idempotency keys.

## Persistence and concurrency

Phase27C reuses migration 055's `notification_recipient_states` and
`notification_actions`; it creates no migration 056. The exact recipient-state
row is the serialization anchor. Same-key concurrent requests produce one
state change and one canonical idempotent replay. A reused key with a different
fingerprint is rejected with 409. Archive and restore increment row version;
no-change actions retain the current version and record durable reuse evidence.

## Public boundary

The four routes exist under both `/api/customer/notifications` and
`/api/worker/notifications`:

- `GET /`
- `GET /unread-count`
- `POST /:notificationId/read`
- `POST /:notificationId/archive`

No Admin/OA/Dashboard route, template-management route, subscriber-management
route, replay/backfill route, deletion route or external Provider capability is
included.

## Focused verification

| Verification | Result |
|---|---|
| Contract and API Client | PASS — 2 files / 8 tests |
| API integration and security | PASS — 2 files / 7 tests |
| Combined focused C verification | PASS — 4 files / 15 tests |
| Backend typecheck | PASS |
| Phase27C direct boundary Gate | PASS |
| Diff hygiene | PASS |

Independent review initially found canonical idempotency replay and target-first
CAS ordering defects. The repository now replays the persisted `action_result`,
returns target-already-satisfied before rejecting a stale version, and retains
409 for a reused key with a different fingerprint. The second review reported
P0/P1/P2/P3 all clear and **PASS**; workspace typecheck also passed 17/17.

Repository-wide tests, build, browser evidence, migration replay and final
governance Lock remain Phase27E work. This implementation does not authorize
production activation, seed, migration 056+, Phase28, push or deployment.
