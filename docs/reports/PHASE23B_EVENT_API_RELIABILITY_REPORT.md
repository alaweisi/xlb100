# Phase 23B — Event and API Reliability Report

## Status

- Entered: 2026-07-11
- Branch: `codex/phase23b-event-api-reliability`
- Base: locked Phase 23A main metadata commit `c2088ec`
- State: LOCKED
- Feature commit: `b5bf08b`
- Main merge commit: `3efbfd6adde055df6f41c2824609eb8a980ddf38`
- Tag: `xlb-phase23b-event-api-reliability`
- Required migration: `044_phase23b_event_outbox_reliability.sql`

## Scope

- Atomic Outbox claiming with an explicit `processing` state
- Lease ownership, renewal, expiry recovery, bounded retry, and dead-letter handling
- Multi-consumer concurrency and crash-recovery verification
- API Client timeout and caller cancellation support
- Unified network, timeout, cancellation, HTTP, and response-format errors
- Runtime validation of authentication, order/payment, task acceptance, and fulfillment responses
- Automatic retry only for safe requests or operations explicitly declared idempotent

## Reliability Model

Phase 23B provides **at-least-once delivery**. It does not claim exactly-once
delivery. A consumer may receive an event again after a crash or lease expiry;
business-side uniqueness constraints and existing idempotency rules remain the
final protection against duplicate effects.

Claims are isolated by city and event type. A successful claim moves a due
`pending` or `retry_wait` row to `processing`, increments its attempt count, and
assigns a lease owner, opaque lease token, and expiry timestamp. Acknowledge,
renew, and failure transitions use owner/token/city/status compare-and-swap
conditions, so a stale or foreign consumer cannot mutate the active claim.

## Migration 044

`044_phase23b_event_outbox_reliability.sql` is append-only and replay-safe for
MySQL's auto-committing DDL behavior. It adds:

- processing and lease metadata: `processing_started_at`, `lease_owner`,
  `lease_token`, and `lease_expires_at`
- retry policy metadata: `attempt_count`, `max_attempts`, and `available_at`
- bounded failure evidence: `last_error_code`, `last_error_message`, and
  `last_failed_at`
- terminal-state evidence: `dead_lettered_at` and `updated_at`
- city-scoped claim, typed-claim, and lease-reaper indexes

Legacy `failed` rows are deterministically converted to `dead_letter` with a
terminal attempt count and migration evidence. The migration gate removes only
the `044` marker, replays the migration, and verifies the expected columns,
indexes, marker uniqueness, and legacy-row conversion.

Locked migrations `000` through `043` were not edited.

## Outbox Implementation

- Atomic claims use a transaction, `READ COMMITTED`, `FOR UPDATE SKIP LOCKED`,
  and exact `pending` / `retry_wait` scans.
- Typed claims force the purpose-built typed-claim index. This is required for
  predictable lock scope under concurrent consumers; the previous optimizer
  choice of the legacy event-type index caused lock amplification.
- A claim batch is bounded to 25 rows. Lease duration and reaper batch size are
  also bounded.
- Retry uses bounded exponential delay. Error codes/messages are normalized,
  length-limited, and common credentials are redacted.
- Exhausted attempts move the event to `dead_letter`; expired processing leases
  move to `retry_wait` or `dead_letter` according to the row's attempt policy.
- Dispatch and Ledger consumers claim real rows, renew leases while processing,
  acknowledge with lease CAS, and record retry/dead-letter transitions on
  failure.
- Dispatch publish recovery preserves one dispatch task across a failed publish
  followed by concurrent retries.
- Ledger concurrency preserves the existing accrual and entry idempotency
  guarantees; Phase 23B does not redefine ledger semantics.

## Multi-consumer Evidence

The database concurrency suite inserted 64 eligible events and ran 8 consumers
in parallel. All 64 event IDs were claimed exactly once within that claim run,
with work distributed across more than one consumer. Same-type events from a
different city and same-city events of a different type remained `pending`.

The suite also verifies:

- wrong owner or token cannot renew or acknowledge a claim
- acknowledgement is single-use
- stale consumers cannot fail or acknowledge an expired claim
- expired leases are recovered by the city-scoped reaper
- row-specific maximum attempts transition retry to dead letter
- already exhausted rows are not claimable
- failed Dispatch publish can retry without creating a second task
- concurrent Ledger consumers retain one accrual and the existing three-entry
  posting result

This evidence demonstrates atomic claim ownership and idempotent downstream
effects; it does not convert at-least-once delivery into exactly-once delivery.

## API Client Implementation

- Every request supports a default or per-request timeout and an external
  `AbortSignal`; timeout and caller cancellation remain distinguishable.
- `ApiClientError` provides stable kinds: `network`, `timeout`, `cancelled`,
  `http`, and `response_format`, together with method/path and applicable HTTP
  status metadata.
- Non-success response bodies are bounded to 2,048 characters and redact common
  tokens, secrets, passwords, authorization values, and phone numbers.
- Invalid JSON and failed runtime validation are reported as
  `response_format`, rather than being silently cast to TypeScript types.
- Runtime validators cover login/code responses, order and payment responses,
  Worker task pool and task acceptance, and fulfillment list/detail/lifecycle
  responses.
- GET requests may retry transient network, timeout, 408, 425, 429, and 5xx
  failures. POST and binary uploads do not retry by default; they retry only
  when the caller explicitly supplies `retry: "idempotent"`.
- `Retry-After` supports bounded delta-seconds and HTTP-date values. Backoff and
  retry-after waits remain cancellable.

## Boundary

- No real payment provider integration
- No Amap or other real map provider integration
- No real OSS/object-storage provider integration
- No edits to locked migrations `000` through `043`
- No change to existing order, payment, dispatch, fulfillment, ledger,
  settlement, payout, or refund business semantics
- No Phase 23C frontend restructuring or Phase 23D performance closure included
  in this phase

The existing mock/local provider boundaries remain intact. Phase 23B changes
delivery coordination and client-side transport validation only.

## Verification

- `pnpm gate:phase23b`: passed
  - API Client reliability tests: passed
  - critical-response contract validation tests: passed
  - Outbox delivery-policy tests: passed
  - atomic claim, Dispatch recovery, and Ledger concurrency database tests:
    passed
  - migration `044` replay and legacy conversion gate: passed
  - critical dependency audit: zero critical findings
- Multi-consumer claim proof: 8 consumers / 64 eligible events / 64 unique
  claims; city/type noise remained unclaimed
- Full `pnpm test -- --bail=1`: passed; 169 files / 484 tests
- Forced no-cache typecheck: 17 / 17 tasks passed
- Forced no-cache build: 11 / 11 tasks passed
- Architecture preflight: passed through the Phase 23B reliability gate
- `git diff --check`: passed
- Existing non-failing React `act(...)` warnings are outside this backend/API
  reliability scope

## Lock Conclusion

Phase 23B is independently LOCKED. The verified feature commit was merged to
`main` with `--no-ff`; local MySQL and Redis were healthy; migration `044` and
the local seeds replayed successfully; the Phase 23B gate, forced typecheck and
build, full 169-file / 484-test regression, and architecture preflight all
passed again on merge commit `3efbfd6`. The lightweight tag
`xlb-phase23b-event-api-reliability` points to that verified merge commit.

Phase 23C may start only from the locked Phase 23B main state. The provider and
business-semantic boundaries recorded above remain mandatory.
