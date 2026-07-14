# Phase 29 Migration 057 Gate

## Scope

`057_phase29_marketing_coupon.sql` is the only Phase 29 migration. It adds the
nine city-scoped Marketing/Coupon tables documented in
`db/dictionary/TABLES.md`. It does not mutate locked migrations or create
business seed data.

## Automated evidence

Run from `G:\xlb100`:

```powershell
pnpm test:migration:phase29
```

The Gate checks:

1. the current local schema can apply/replay `057` without changing existing
   Order, Pricing, Outbox or Platform Delivery facts;
2. a fresh database converges after two migration-runner executions;
3. an exact `000`-`056` baseline upgrades to the nine empty Phase 29 tables;
4. recovery from a real partial-DDL boundary converges and writes one marker;
5. city isolation, same-city foreign keys, no cascade, integer-minor money,
   finite issuance/compensation caps, idempotency uniqueness, four-eyes rule
   review/publish separation, one blocking reservation and compensation source
   allowlisting are present in MySQL metadata;
6. the financial evidence chain is enforced by composite UNIQUE/FK pairs:
   Grant carries its Rule revision, Decision binds both the Grant revision and
   the immutable Rule content hash, Reservation binds the Decision currency and
   amount, Redemption binds the Reservation currency and amount, and
   Compensation binds the source Redemption currency and amount;
7. direct SQL attempts to forge a Rule hash, mix a Grant with another Rule
   revision, or change the Reservation, Redemption or Compensation amount are
   rejected by MySQL foreign keys.

Temporary Gate databases are always dropped in `finally`. The contradictory-
evidence test uses only ephemeral rows in one such database; its Platform
subscription fixture remains `proposed` and has no live-start boundary. The
command does not deploy, activate a subscriber, replay/backfill historical
events, or insert coupons/campaigns into the current database.

## Construction verification

On 2026-07-14 the full Gate passed all five database paths, including double
replay and the five contradictory-evidence rejection cases. The current-schema
path also proved convergence from an earlier pre-Lock 057 shape without
changing locked Order, Pricing, Outbox or Platform Delivery facts. Temporary
databases are removed by `finally`; final diff hygiene was rerun after this
evidence-chain hardening.
