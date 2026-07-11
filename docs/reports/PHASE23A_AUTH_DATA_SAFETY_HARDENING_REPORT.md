# Phase 23A — Authentication and Data Safety Hardening Report

## Status

- Entered: 2026-07-11
- Branch: `codex/phase23a-auth-data-safety-hardening`
- Base: `58242be`
- State: LOCK CANDIDATE VERIFIED

## Scope

- Exact worker identity lookup using a non-reversible phone hash
- Production-safe OTP debug route registration
- Rate limiting on the three real OTP issue routes
- CityConfig optimistic compare-and-swap updates
- Production configuration fail-closed validation
- Focused contract, security, integration, and concurrency verification

## Boundary

- No real payment provider integration
- No Amap or other real map provider integration
- No real OSS/object-storage provider integration
- No edits to locked migrations `000` through `042`
- No order, payment, dispatch, fulfillment, ledger, settlement, payout, or refund semantic changes

## Security Decisions

- A masked phone number is not an identity credential.
- Legacy worker rows without a trusted `phone_hash` fail closed during login.
- Phone-hash enrollment must use a trusted administrative or seed path with the verified full phone number.
- Production startup must reject missing or weak identity/JWT/database secrets.
- Debug OTP routes must not be registered in production.

## Implementation

- Migration `043_phase23a_worker_phone_identity_hash.sql` adds a nullable,
  globally unique `worker_profiles.phone_hash` and is safe to replay after a
  partial MySQL DDL application.
- Runtime lookup uses a domain-separated HMAC-SHA256 hash and never falls back
  to `phone_masked`.
- `scripts/enroll-worker-phone.mjs` provides an explicit, parameterized,
  transaction-protected operator path for trusted full-phone enrollment.
- The three real OTP issuance routes share the OTP rate-limit rule.
- Debug OTP routes are not registered when production is active or debug
  readback is disabled.
- CityConfig writes require `expectedVersion`, update with compare-and-swap,
  and return HTTP 409 with stable conflict metadata when the version is stale.
- CityConfig CAS update and returned snapshot execute in one transaction.
- Correctness-critical CityConfig reads bypass the previous process-local TTL
  cache; a shared version-aware cache may be introduced in a later phase.
- Production startup rejects weak or missing JWT, MySQL, and phone-hash
  secrets.

## Deployment Prerequisites

- `AUTH_PHONE_HASH_SECRET` is critical identity key material. It must be stored
  in the deployment secret manager and backed up. Phase 23A does not implement
  online key rotation; changing or losing it invalidates enrolled identities.
- Existing rows cannot be backfilled from masked phones. Before Worker login
  smoke tests, required demo/staging workers must be enrolled from a verified
  full-phone source with `scripts/enroll-worker-phone.mjs`.
- The local verification database contained 748 worker rows after migration;
  747 remained deliberately unenrolled. No unverified phone was inferred or
  assigned during Phase 23A.
- Staging runs with `NODE_ENV=production`; rebuilding it now requires explicit
  strong `JWT_SECRET`, `MYSQL_PASSWORD`, and `AUTH_PHONE_HASH_SECRET` values.
  The checked-in `.env.staging.example` placeholders are intentionally
  rejected by production validation.
- The enrollment CLI must be restricted to trusted operators. Until durable
  identity-enrollment audit persistence is introduced, its invocation evidence
  must be retained in the operational change record.

## Verification

- `scripts/check-phase23a-boundaries.ps1`: passed
- Focused Phase 23A tests: 8 files / 55 tests passed
- Migration replay after removing only the `043` marker: passed; one column,
  one unique index, and one migration marker remained
- Forced no-cache typecheck: 17 / 17 tasks passed
- Forced no-cache build: 11 / 11 tasks passed
- Full `pnpm test -- --bail=1` command: passed; the database/security project
  reported 167 files / 476 tests
- Full architecture preflight: passed, including the Phase 23A boundary gate
- `git diff --check`: passed
- Existing React `act(...)` warnings remain non-failing and were not introduced
  as part of this hardening phase.

Phase 23A is implemented but is intentionally not marked locked and has no tag.

## Lock Candidate Verification — 2026-07-11

- Feature head: `96d24ee`
- Local MySQL and Redis: healthy
- Migration runner: 043 present and idempotently skipped
- Seed runner: passed
- Focused Phase 23A suite: passed
- Forced typecheck: 17/17 tasks passed
- Forced build: 11/11 tasks passed
- Full normal regression: passed with exit code 0
- Architecture preflight: passed through the Phase 23A boundary gate
- Locked migrations 000–042: unchanged
- Provider boundary: no real payment, Amap, or object-storage integration
- User-owned untracked audit files: preserved and excluded

The feature branch is eligible for the Phase 23A `--no-ff` merge ceremony.
