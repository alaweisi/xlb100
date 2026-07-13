# Phase27D Notification UI Implementation Report

Date: 2026-07-13

Status: INDEPENDENT REVIEW PASS — PHASE27E INPUT

Phase27 overall: NOT LOCKED

Production: NO-GO

## Scope delivered

Phase27D adds the real Customer and Worker in-app inbox routes:

- `/customer/notifications`
- `/worker/notifications`

Both pages use `@xlb/api-client` and contain no runtime mock data. They cover
loading, empty, error/retry, inbox/archive switching, cursor loading, accessible
unread state, mark-read, archive/restore and 409 canonical reload. Every
mutation supplies the visible row version and a newly generated idempotency
key; a synchronous busy guard prevents duplicate clicks before React state is
committed.

Customer `order.created` notifications link only to the existing encoded order
route. No unsupported Worker or Support deep link is invented. Entries are
placed outside the bottom navigation; both app bottom bars remain the approved
seven items and no speculative badge or unread count is displayed.

## UI engineering boundary

Customer uses the established route shell and Phase25 stylesheet. Worker uses
the existing app frame and a token-based Notification stylesheet. No new inline
style or hard-coded token baseline was introduced. Admin, OA and Dashboard are
unchanged.

## Focused verification

| Verification | Result |
|---|---|
| Notification page behavior | PASS — 1 file / 6 tests |
| Notification pages plus existing Worker app regression | PASS — 2 files / 24 tests |
| Customer/Worker typecheck | PASS in agent verification |
| Phase27D direct boundary Gate | PASS |
| Phase25 Gate1A hardcode baseline | PASS |
| Diff hygiene | PASS |

The first independent review found a pending-mutation tab race and a Customer
source-relative API Client import. Both pages now synchronously block and
visually disable view switching during mutation, with deferred-operation tests
for Customer and Worker. Customer imports only through `@xlb/api-client`.
Worker's non-bottom entry also uses SPA navigation so its in-memory authenticated
session is not discarded. The second review reported P0/P1/P2 clear and
**PASS**; its sole P3 was the test-count wording corrected above.

Real authenticated browser evidence, full workspace typecheck/build/tests and
aggregate security Gates remain Phase27E work. Phase27D does not authorize
production activation, external channels, Phase28, push or deployment.
