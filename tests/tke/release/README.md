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

## Gate 2 wiring still required

- Adapt P4's checkpoint/state execution to these ports and compare checkpoint
  transitions against this reference runner.
- Adapt P5's CLB/DNS planner and rollback controller to the traffic port.
- Replace selected fakes with the kind/local-registry/MySQL/Redis test harness
  after P4/P5 integration; keep Tencent Cloud providers mocked.
- Add failure injection at the merged P4/P5 command boundaries and compare
  their persisted artifacts with the deterministic reference evidence.
- Run the aggregate delivery gate from the integration branch; shared package,
  CI and result-report changes remain the integration owner's responsibility.

Run the foundation directly with:

```text
node --test tests/tke/release/scenario-runner.test.mjs
```
