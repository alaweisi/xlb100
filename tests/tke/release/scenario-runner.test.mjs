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

const providerCalls = (fake, stage) => fake.trace.filter(
  item => item.operation === "provider.invoke" && item.stage === stage,
).length;

const fixtureWithReleaseId = newId => {
  const oldId = "release-20260716-001";
  return buildReleaseFixture(bundle => {
    for (const key of Object.keys(bundle)) {
      bundle[key] = JSON.parse(JSON.stringify(bundle[key]).replaceAll(oldId, newId));
    }
  });
};

const collectEvidenceRefs = value => {
  const references = [];
  const visit = current => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (key === "evidenceRef") references.push(child);
      else visit(child);
    }
  };
  visit(value);
  return references;
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

test("registry inspection explicit FAIL blocks Terraform plan review", async () => {
  const { fixture, fake } = setup({ stageResults: { INSPECT_IMAGE_DIGESTS: "FAIL" } });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "IMAGES_PUBLISHED");
  assert.equal(providerCalls(fake, "PLAN_INFRASTRUCTURE"), 0);
});

test("rejected Terraform plan never reaches apply", async () => {
  const { fixture, fake } = setup({ planApproved: false });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "PLAN_INFRASTRUCTURE");
  assert.equal(fake.trace.some(item => item.stage === "APPLY_INFRASTRUCTURE"), false);
});

for (const [stage, field, failedStage] of [
  ["INSPECT_IMAGE_DIGESTS", "published", "IMAGES_PUBLISHED"],
  ["PLAN_INFRASTRUCTURE", "approved", "PLAN_INFRASTRUCTURE"],
  ["APPLY_INFRASTRUCTURE", "applied", "APPLY_INFRASTRUCTURE"],
  ["DEPLOY_NO_TRAFFIC", "ready", "DEPLOY_NO_TRAFFIC"],
  ["VERIFY_BACKUP", "verified", "VERIFY_BACKUP"],
  ["SWITCH_JOBS", "switched", "SWITCH_JOBS"],
  ["OBSERVE", "passed", "OBSERVE"],
  ["RETIRE_LIGHTHOUSE", "retired", "RETIRE_LIGHTHOUSE"],
]) {
  test(`${stage} structured false result is durable FAILED evidence`, async () => {
    const { fixture, fake } = setup({ stageOverrides: { [stage]: { [field]: false } } });
    const result = await runReleaseSimulation({ fixture, ports: fake.ports });
    assert.equal(result.checkpoint.currentState, "FAILED");
    assert.equal(result.checkpoint.failure.failedStage, failedStage);
    assert.match(result.checkpoint.failure.message, new RegExp(field));
    assert.equal(fake.snapshots.at(-1).checkpoint.currentState, "FAILED");
  });
}

for (const [stage, failedStage] of [
  ["INSPECT_IMAGE_DIGESTS", "IMAGES_PUBLISHED"],
  ["PLAN_INFRASTRUCTURE", "PLAN_INFRASTRUCTURE"],
  ["APPLY_INFRASTRUCTURE", "APPLY_INFRASTRUCTURE"],
  ["DEPLOY_NO_TRAFFIC", "DEPLOY_NO_TRAFFIC"],
  ["VERIFY_BACKUP", "VERIFY_BACKUP"],
  ["MIGRATE_DATA", "MIGRATE_DATA"],
  ["SMOKE", "SMOKE"],
  ["SWITCH_JOBS", "SWITCH_JOBS"],
  ["OBSERVE_JOBS", "SWITCH_JOBS"],
  ["TRAFFIC_5", "TRAFFIC_5"],
  ["OBSERVE", "OBSERVE"],
  ["RETIRE_LIGHTHOUSE", "RETIRE_LIGHTHOUSE"],
]) {
  test(`${stage} missing structured success fields fail closed`, async () => {
    const { fixture, fake } = setup({ stageResponses: { [stage]: {} } });
    const result = await runReleaseSimulation({ fixture, ports: fake.ports });
    assert.equal(result.checkpoint.currentState, "FAILED");
    assert.equal(result.checkpoint.failure.failedStage, failedStage);
    assert.equal(fake.snapshots.at(-1).checkpoint.currentState, "FAILED");
  });
}

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

test("an explicit stage result FAIL is persisted and can never retire Lighthouse", async () => {
  const { fixture, fake } = setup({ stageResults: { SMOKE: "FAIL" } });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "SMOKE");
  assert.equal(result.evidence.smoke.result, "FAIL");
  assert.equal(providerCalls(fake, "SWITCH_JOBS"), 0);
  assert.equal(fake.snapshots.at(-1).checkpoint.currentState, "FAILED");
  assert.equal(fake.snapshots.at(-1).evidence.smoke.result, "FAIL");
});

test("an explicit FAIL traffic observation blocks the next weight and retirement", async () => {
  const { fixture, fake } = setup({ trafficResults: { 25: "FAIL" } });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "TRAFFIC_25");
  assert.deepEqual(result.evidence.trafficObservations.map(item => [item.weight, item.result]), [
    [5, "PASS"],
    [25, "FAIL"],
  ]);
  assert.equal(providerCalls(fake, "TRAFFIC_50"), 0);
  assert.equal(providerCalls(fake, "RETIRE_LIGHTHOUSE"), 0);
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
  assert.equal(providerCalls(fake, "APPLY_INFRASTRUCTURE"), 1);
  assert.equal(providerCalls(fake, "DEPLOY_NO_TRAFFIC"), 1);
  assert.equal(providerCalls(fake, "VERIFY_BACKUP"), 1);
});

test("TRAFFIC_25 interruption restores evidence prefix before continuing at 50", async () => {
  const { fixture, fake } = setup({ interruptAfter: "TRAFFIC_25" });
  await assert.rejects(
    runReleaseSimulation({ fixture, ports: fake.ports }),
    error => error instanceof ProcessInterrupted && error.stage === "TRAFFIC_25",
  );
  assert.equal(fake.getCheckpoint().currentState, "TRAFFIC_25");
  assert.deepEqual(fake.getEvidence().trafficObservations.map(item => item.weight), [5, 25]);

  const resumed = await runReleaseSimulation({ fixture, ports: fake.ports });
  assert.equal(resumed.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  assert.deepEqual(resumed.evidence.trafficObservations.map(item => item.weight), [5, 25, 50, 100]);
  assert.equal(providerCalls(fake, "TRAFFIC_5"), 1);
  assert.equal(providerCalls(fake, "TRAFFIC_25"), 1);
  assert.equal(providerCalls(fake, "TRAFFIC_50"), 1);
});

test("artifact hash drift creates durable FAILED evidence before any provider call", async () => {
  const fixture = buildReleaseFixture();
  const checkpoint = structuredClone(fixture.checkpoint);
  checkpoint.artifactHashes.imageLock = "f".repeat(64);
  const fake = createDeterministicProviderFakes(fixture, { checkpoint });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "PLAN_INFRASTRUCTURE");
  assert.match(result.checkpoint.failure.message, /hash drift/);
  assert.equal(fake.trace.some(item => item.operation === "provider.invoke"), false);
  assert.equal(fake.snapshots.at(-1).checkpoint.currentState, "FAILED");
});

test("rollback provider failure persists FAILED checkpoint and FAIL rollback evidence", async () => {
  const { fixture, fake } = setup({
    failAt: "SMOKE",
    stageResults: { ROLLBACK_TRAFFIC: "FAIL" },
  });
  const result = await runReleaseSimulation({
    fixture,
    ports: fake.ports,
    rollbackOnFailure: true,
  });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "SMOKE");
  assert.match(result.checkpoint.failure.message, /rollback failed/);
  assert.equal(result.evidence.rollback.result, "FAIL");
  assert.equal(fake.snapshots.at(-1).evidence.rollback.result, "FAIL");
});

test("repeating the same terminal release ID is idempotent", async () => {
  const { fixture, fake } = setup();
  const first = await runReleaseSimulation({ fixture, ports: fake.ports });
  assert.equal(first.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  const callsAfterFirst = fake.trace.filter(item => item.operation === "provider.invoke").length;

  const repeated = await runReleaseSimulation({ fixture, ports: fake.ports });
  assert.equal(repeated.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  assert.equal(fake.trace.filter(item => item.operation === "provider.invoke").length, callsAfterFirst);
});

test("rollback evidence derives its release ID instead of using the sample ID", async () => {
  const newId = "release-custom-002";
  const fixture = fixtureWithReleaseId(newId);
  const fake = createDeterministicProviderFakes(fixture, { failAt: "SMOKE" });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports, rollbackOnFailure: true });

  assert.equal(result.checkpoint.currentState, "ROLLED_BACK");
  assert.equal(result.evidence.rollback.runId, `rollback-${newId}`);
  assert.match(result.evidence.rollback.evidenceRef, new RegExp(newId));
  assert.equal(fake.snapshots.at(-1).checkpoint.currentState, "ROLLED_BACK");
  assert.equal(fake.snapshots.at(-1).evidence.rollback.runId, `rollback-${newId}`);
});

test("a changed release ID completes the full chain with only release-scoped fake evidence", async () => {
  const releaseId = "release-full-chain-777";
  const fixture = fixtureWithReleaseId(releaseId);
  const fake = createDeterministicProviderFakes(fixture);
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  assert.equal(result.evidence.migration.runId, `migration-${releaseId}`);
  assert.equal(result.evidence.smoke.runId, `smoke-${releaseId}`);
  assert.equal(result.evidence.jobsSingleActive.leaseOwner, `tke-jobs-${releaseId}`);
  const prefix = `.artifacts/tke/releases/${releaseId}/`;
  assert.ok(collectEvidenceRefs(result.evidence).length > 0);
  assert.equal(collectEvidenceRefs(result.evidence).every(reference => reference.startsWith(prefix)), true);
});

test("cross-release evidenceRef becomes durable FAILED before the next stage", async () => {
  const { fixture, fake } = setup({
    stageOverrides: {
      SMOKE: { evidenceRef: ".artifacts/tke/releases/release-other-999/evidence/smoke.json" },
    },
  });
  const result = await runReleaseSimulation({ fixture, ports: fake.ports });

  assert.equal(result.checkpoint.currentState, "FAILED");
  assert.equal(result.checkpoint.failure.failedStage, "SMOKE");
  assert.match(result.checkpoint.failure.message, /evidenceRef must belong/);
  assert.equal(providerCalls(fake, "SWITCH_JOBS"), 0);
  assert.equal(fake.snapshots.at(-1).evidence.smoke.evidenceRef.includes("release-other-999"), true);
});
