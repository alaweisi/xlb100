import assert from "node:assert/strict";
import test from "node:test";
import { buildReleaseFixture, lockedDigests } from "./fixture-builder.mjs";
import {
  ProcessInterrupted,
  createDeterministicProviderFakes,
} from "./provider-fakes.mjs";
import { runReleaseSimulation } from "./scenario-runner.mjs";

const setup = options => {
  const fixture = buildReleaseFixture();
  return { fixture, fake: createDeterministicProviderFakes(fixture, options) };
};

test("deterministic happy path reaches Lighthouse retirement in contract order", async () => {
  const { fixture, fake } = setup();
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  assert.deepEqual(result.evidence.trafficObservations.map(item => item.weight), [5, 25, 50, 100]);
  assert.equal(result.evidence.jobsSingleActive.tkeState, "ACTIVE");
  assert.equal(fake.checkpoints.at(-1).currentState, "LIGHTHOUSE_RETIRED");
});

test("registry digest drift fails closed before Terraform plan review", async () => {
  const fixture = buildReleaseFixture();
  const digests = lockedDigests(fixture.imageLock);
  digests.backend = `sha256:${"f".repeat(64)}`;
  const fake = createDeterministicProviderFakes(fixture, { registryDigests: digests });

  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "IMAGES_PUBLISHED");
  assert.match(result.checkpoint.failure.message, /registry digest drift/);
  assert.equal(fake.trace.some(item => item.stage === "PLAN_INFRASTRUCTURE"), false);
});

test("rejected Terraform plan never reaches apply", async () => {
  const { fixture, fake } = setup({ planApproved: false });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "PLAN_INFRASTRUCTURE");
  assert.equal(fake.trace.some(item => item.stage === "APPLY_INFRASTRUCTURE"), false);
});

for (const [stage, expectedState] of [
  ["DEPLOY_NO_TRAFFIC", "DEPLOYED_NO_TRAFFIC"],
  ["MIGRATE_DATA", "MIGRATED"],
  ["SMOKE", "SMOKE_PASS"],
]) {
  test(`${stage} failure records an exact resumable checkpoint`, async () => {
    const { fixture, fake } = setup({ failAt: stage });
    const result = await runReleaseSimulation({ fixture, ports: fake.ports });

    assert.equal(result.checkpoint.currentState, "FAILED");
    assert.equal(result.checkpoint.failure.failedStage, stage);
    assert.equal(result.checkpoint.failure.resumeState, expectedState);
    assert.equal(result.checkpoint.completedStages.includes(stage), false);
  });
}

test("jobs double-active observation blocks traffic", async () => {
  const { fixture, fake } = setup({
    jobsObservation: {
      lighthouseState: "ACTIVE",
      tkeState: "ACTIVE",
      leaseOwner: "invalid-double-active",
      fencingToken: 42,
      observedAt: "2026-07-16T09:30:00Z",
      evidenceRef: ".artifacts/tke/releases/release-20260716-001/evidence/jobs-invalid.json",
    },
  });

  const result = await runReleaseSimulation({ fixture, ports: fake.ports });
  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "SWITCH_JOBS");
  assert.match(result.checkpoint.failure.message, /must never both be ACTIVE/);
  assert.equal(fake.trace.some(item => item.stage === "TRAFFIC_5"), false);
});

test("traffic cutover plan cannot skip a fixed staircase step", async () => {
  const { fixture, fake } = setup();
  await assert.rejects(
    runReleaseSimulation({ fixture, ports: fake.ports, trafficPlan: [5, 50, 100] }),
    /exactly 5\/25\/50\/100/,
  );
  assert.equal(fake.trace.length, 0);
});

test("post-deployment smoke failure can execute deterministic rollback", async () => {
  const { fixture, fake } = setup({ failAt: "SMOKE" });
  const result = await runReleaseSimulation({
    fixture,
    ports: fake.ports,
    rollbackOnFailure: true,
  });

  assert.equal(result.checkpoint.currentState, "ROLLED_BACK");
  assert.equal(result.rolledBackFrom, "SMOKE_PASS");
  assert.equal(result.evidence.rollback.result, "PASS");
  assert.deepEqual(
    fake.trace.filter(item => item.stage?.startsWith("ROLLBACK_")).map(item => item.stage),
    ["ROLLBACK_TRAFFIC", "ROLLBACK_JOBS", "ROLLBACK_KUBERNETES"],
  );
});

test("process interruption resumes from the saved checkpoint without repeating apply", async () => {
  const { fixture, fake } = setup({ interruptAfter: "DEPLOY_NO_TRAFFIC" });

  await assert.rejects(
    runReleaseSimulation({ fixture, ports: fake.ports }),
    error => error instanceof ProcessInterrupted && error.stage === "DEPLOY_NO_TRAFFIC",
  );
  assert.equal(fake.getCheckpoint().currentState, "DEPLOYED_NO_TRAFFIC");

  const resumed = await runReleaseSimulation({ fixture, ports: fake.ports });
  assert.equal(resumed.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  const providerCalls = stage => fake.trace.filter(
    item => item.operation === "provider.invoke" && item.stage === stage,
  ).length;
  assert.equal(providerCalls("APPLY_INFRASTRUCTURE"), 1);
  assert.equal(providerCalls("DEPLOY_NO_TRAFFIC"), 1);
  assert.equal(providerCalls("VERIFY_BACKUP"), 1);
});
