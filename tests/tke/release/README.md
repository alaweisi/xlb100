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

## Gate 2 wiring still required

- Adapt P4's checkpoint/state execution to these ports and compare checkpoint
  transitions against this reference runner.
- Adapt P5's CLB/DNS planner and rollback controller to the traffic port.
- Replace selected fakes with the kind/local-registry/MySQL/Redis test harness
  after P4/P5 integration; keep Tencent Cloud providers mocked.
- Add failure injection for real P4/P5 command boundaries and verify artifact
  hash drift, retry policy, rollback failure and idempotent repeated release ID.
- Run the aggregate delivery gate from the integration branch; shared package,
  CI and result-report changes remain the integration owner's responsibility.

Run the foundation directly with:

```text
node --test tests/tke/release/scenario-runner.test.mjs
```
