# TKE release deterministic simulation foundation

This Wave 2 / P6 test-only framework exercises the frozen release contracts
without Tencent Cloud, Docker, Kubernetes, Terraform, Redis, MySQL, DNS or CLB.
It owns no production implementation and grants no runtime authority.

## Adapter boundary

`ports.mjs` is the Gate 2 seam. P4 and P5 adapters must supply the named
methods for registry inspection, Terraform, no-traffic deployment, backup,
migration, smoke, jobs single-active, traffic, lifecycle, checkpoint storage
and process hooks. The deterministic fakes implement that seam entirely in
memory; P6 does not copy P4/P5 state-machine or provider code.

## Covered foundation scenarios

| Scenario | Expected result |
| --- | --- |
| full ordered release | reaches `LIGHTHOUSE_RETIRED` |
| registry digest drift | fails before Terraform review |
| Terraform plan rejected | fails before apply |
| deploy, migration or smoke failure | exact `FAILED` resume metadata |
| Lighthouse/TKE jobs double-active | traffic remains blocked |
| traffic step skipped | plan rejected before any provider call |
| post-deploy failure with rollback | traffic, jobs and Kubernetes rollback |
| process interruption | resumes after durable checkpoint without replay |
| explicit stage/traffic `FAIL` | durable failure; no later stage runs |
| artifact hash drift | stale resume blocked before provider calls |
| rollback provider failure | failed checkpoint plus rollback evidence |
| duplicate terminal release ID | idempotent with no provider replay |

Checkpoint persistence is an atomic `{ checkpoint, evidence }` envelope in
the simulation seam. This keeps the passing traffic prefix intact across a
process interruption and makes failed or rolled-back evidence inspectable.
`p4-p5-wiring.mjs` exposes adapters matching P4's injected executor and P5's
adapter/observer/progress-store contracts for Gate 2 composition.

Every simulated stage has a structured success contract. Boolean success
flags must be exactly `true`, execution evidence must be `PASS` with a run ID,
and registry digests, zero-traffic readiness, Jobs ownership and retirement
must all be explicit. Missing fields, false flags and `FAIL` results create a
durable `FAILED` checkpoint. Every nested `evidenceRef`, fake lease owner and
fake run ID is bound to the fixture's release ID; cross-release evidence is
rejected before the next state can advance.

## Gate 2 integration hand-off

`p4-p5-real-chain.test.mjs` now supplies the executable cross-module contract:
it builds a complete temporary artifact tree, advances the real P4
orchestrator through `JOBS_SWITCHED`, invokes the real P5 controller from the
P4 `TRAFFIC_5` executor with raw evidence bytes and transient tokens, writes
the resulting evidence and REAL provider receipt, and lets P4 re-hash and
commit the checkpoint. It also covers P5 failure/resume, external weight
drift, and P5 traffic rollback through P4's rollback-failure latch. The full
Gate 2 acceptance continues through `5/25/50/100`, rejects skipped levels,
reloads P4 plus a disk-backed P5 CAS store after process restart, resumes a
50-percent observation failure without replaying apply, and reverses the
complete `100/50/25/5/0` rollback prefix.
Gate 2 also launches separate Node child processes for the 25/50/100 stages.
Those processes use the production P5 file progress-store implementation,
and exercise both crash windows: provider apply before progress commit and P5
progress commit before P4 checkpoint commit. Recovery must keep the same
idempotency key without replaying provider apply. The P5 product-store suite
separately proves single-winner concurrent CAS, corrupt-main fail-closed,
orphan-temp isolation, and dead-owner recovery without time-based live-owner
takeover.
The tests resolve P4/P5 from the current integrated checkout. Pre-integration
branch validation may explicitly inject the two module files with
`XLB_P4_ORCHESTRATOR_MODULE`, `XLB_P5_CUTOVER_MODULE`, and
`XLB_P5_PROGRESS_STORE_MODULE`; no sibling-worktree path is inferred or
persisted.

The final pre-integration child-process run was explicitly pinned to P4
`a5dda43` and P5 `d89a895` (which contains `efe3a93`). This suite proves the
listed process-boundary integration scenarios only. Gate 2 still requires the
P5 product-store review to close its separate path-confinement, recovery-token,
and double-recovery findings before the integrated line can be declared
successful.

- Replace selected fakes with the kind/local-registry/MySQL/Redis test harness
  when runtime-level coverage is scheduled; keep Tencent Cloud providers
  mocked.
- Run the aggregate delivery gate from the integration branch; shared package,
  CI and result-report changes remain the integration owner's responsibility.

Run the foundation directly with:

```text
node --test tests/tke/release/*.test.mjs
```
