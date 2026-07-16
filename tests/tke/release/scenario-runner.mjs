import {
  FORWARD_STATES,
  assertTransition,
  validateCheckpointSemantics,
  validateContractBundle,
  validateEvidenceSemantics,
} from "../../../scripts/check-tke-release-contracts.mjs";
import { clone, lockedDigests } from "./fixture-builder.mjs";
import { ProviderFailure } from "./provider-fakes.mjs";
import { assertSimulationPorts, assertTrafficPlan, TRAFFIC_STEPS } from "./ports.mjs";

const steps = Object.freeze([
  { state: "PLAN_REVIEWED", stage: "PLAN_INFRASTRUCTURE", run: async ports => {
    const plan = await ports.terraform.reviewPlan();
    if (!plan.approved) throw new ProviderFailure("PLAN_INFRASTRUCTURE", "Terraform plan was rejected");
    assertStageResult("PLAN_INFRASTRUCTURE", plan);
  } },
  { state: "INFRA_READY", stage: "APPLY_INFRASTRUCTURE", run: async ports => {
    assertStageResult("APPLY_INFRASTRUCTURE", await ports.terraform.apply());
  } },
  { state: "DEPLOYED_NO_TRAFFIC", stage: "DEPLOY_NO_TRAFFIC", run: async ports => {
    assertStageResult("DEPLOY_NO_TRAFFIC", await ports.kubernetes.deployNoTraffic());
  } },
  { state: "BACKUP_VERIFIED", stage: "VERIFY_BACKUP", run: async ports => {
    assertStageResult("VERIFY_BACKUP", await ports.backup.verify());
  } },
  { state: "MIGRATED", stage: "MIGRATE_DATA", run: async (ports, context) => {
    context.evidence.migration = await ports.migration.run();
    assertStageResult("MIGRATE_DATA", context.evidence.migration);
  } },
  { state: "SMOKE_PASS", stage: "SMOKE", run: async (ports, context) => {
    context.evidence.smoke = await ports.smoke.run();
    assertStageResult("SMOKE", context.evidence.smoke);
  } },
  { state: "JOBS_SWITCHED", stage: "SWITCH_JOBS", run: async (ports, context) => {
    assertStageResult("SWITCH_JOBS", await ports.jobs.switchToTke());
    context.evidence.jobsSingleActive = await ports.jobs.observeSingleActive();
    try {
      validateEvidenceSemantics(context.evidence);
    } catch (error) {
      throw new ProviderFailure("SWITCH_JOBS", error.message);
    }
  } },
  ...TRAFFIC_STEPS.map(weight => ({
    state: `TRAFFIC_${weight}`,
    stage: `TRAFFIC_${weight}`,
    run: async (ports, context) => {
      context.evidence.trafficObservations = context.evidence.trafficObservations.filter(
        item => item.weight < weight,
      );
      assertStageResult(`TRAFFIC_${weight}`, await ports.traffic.setWeight(weight));
      const observation = await ports.traffic.observe(weight);
      context.evidence.trafficObservations.push(observation);
      assertStageResult(`TRAFFIC_${weight}`, observation);
      try {
        validateEvidenceSemantics(context.evidence);
      } catch (error) {
        throw new ProviderFailure(`TRAFFIC_${weight}`, error.message);
      }
    },
  })),
  { state: "OBSERVED", stage: "OBSERVE", run: async ports => {
    assertStageResult("OBSERVE", await ports.lifecycle.observe());
  } },
  { state: "LIGHTHOUSE_RETIRED", stage: "RETIRE_LIGHTHOUSE", run: async ports => {
    assertStageResult("RETIRE_LIGHTHOUSE", await ports.lifecycle.retire());
  } },
]);

function assertStageResult(stage, result) {
  if (result?.result === "FAIL") {
    throw new ProviderFailure(stage, `${stage} returned explicit result=FAIL`);
  }
  return result;
}

function assertRegistryDigests(imageLock, actual) {
  const expected = lockedDigests(imageLock);
  for (const name of Object.keys(expected)) {
    if (actual[name] !== expected[name]) {
      throw new ProviderFailure(
        "IMAGES_PUBLISHED",
        `${name} registry digest drift: expected ${expected[name]}, received ${actual[name] ?? "missing"}`,
      );
    }
  }
}

function updateCheckpoint(checkpoint, state, stage, now) {
  assertTransition(checkpoint.currentState, state, checkpoint.currentState === "FAILED"
    ? { resumeState: checkpoint.failure.resumeState }
    : {});
  return validateCheckpointSemantics({
    ...checkpoint,
    currentState: state,
    completedStages: [...new Set([...checkpoint.completedStages, stage])],
    updatedAt: now,
    revision: checkpoint.revision + 1,
    failure: undefined,
  });
}

function failedCheckpoint(checkpoint, step, error, now) {
  assertTransition(checkpoint.currentState, "FAILED");
  return validateCheckpointSemantics({
    ...checkpoint,
    currentState: "FAILED",
    updatedAt: now,
    revision: checkpoint.revision + 1,
    failure: {
      failedStage: error.stage ?? step.stage,
      failedAt: now,
      message: error.message,
      retryable: true,
      resumeState: step.state,
    },
  });
}

function stepStartIndex(checkpoint) {
  if (checkpoint.currentState === "FAILED") {
    return steps.findIndex(step => step.state === checkpoint.failure.resumeState);
  }
  const currentIndex = FORWARD_STATES.indexOf(checkpoint.currentState);
  return steps.findIndex(step => FORWARD_STATES.indexOf(step.state) > currentIndex);
}

async function rollback(checkpoint, evidence, ports) {
  assertStageResult("ROLLBACK", await ports.traffic.rollback());
  assertStageResult("ROLLBACK", await ports.jobs.returnToLighthouse());
  assertStageResult("ROLLBACK", await ports.kubernetes.rollback());
  const completedAt = ports.clock.now();
  evidence.rollback = {
    runId: `rollback-${checkpoint.releaseId}`.slice(0, 63),
    completedAt,
    result: "PASS",
    evidenceRef: `.artifacts/tke/releases/${checkpoint.releaseId}/evidence/rollback.json`,
  };
  assertTransition(checkpoint.currentState, "ROLLED_BACK");
  const rolledBack = validateCheckpointSemantics({
    ...checkpoint,
    currentState: "ROLLED_BACK",
    completedStages: [...new Set([...checkpoint.completedStages, "ROLLBACK"])],
    updatedAt: completedAt,
    revision: checkpoint.revision + 1,
  });
  await ports.checkpoint.save(rolledBack, evidence);
  return rolledBack;
}

function assertArtifactHashes(checkpoint, expected) {
  const names = new Set([...Object.keys(checkpoint.artifactHashes), ...Object.keys(expected)]);
  for (const name of names) {
    if (checkpoint.artifactHashes[name] !== expected[name]) {
      throw new ProviderFailure("PREPARE", `${name} artifact hash drift detected; stale resume is blocked`);
    }
  }
}

export async function runReleaseSimulation({
  fixture,
  ports,
  trafficPlan = TRAFFIC_STEPS,
  rollbackOnFailure = false,
}) {
  assertSimulationPorts(ports);
  assertTrafficPlan(trafficPlan);
  const base = clone(fixture);
  validateContractBundle(base);
  const persisted = await ports.checkpoint.load();
  if (!persisted?.checkpoint || !persisted?.evidence) {
    throw new TypeError("checkpoint.load() must return checkpoint and evidence atomically");
  }
  let checkpoint = persisted.checkpoint;
  let evidence = persisted.evidence;
  validateContractBundle({ ...base, checkpoint, evidenceBundle: evidence });

  try {
    assertArtifactHashes(checkpoint, base.checkpoint.artifactHashes);
  } catch (error) {
    if (checkpoint.currentState === "FAILED" || ["LIGHTHOUSE_RETIRED", "ROLLED_BACK"].includes(checkpoint.currentState)) {
      throw error;
    }
    const next = steps[stepStartIndex(checkpoint)];
    const failure = new ProviderFailure(next.stage, error.message);
    checkpoint = failedCheckpoint(checkpoint, next, failure, ports.clock.now());
    await ports.checkpoint.save(checkpoint, evidence);
    return { checkpoint, evidence, error: failure };
  }

  const initialStepIndex = stepStartIndex(checkpoint);
  if (initialStepIndex < 0) {
    return { checkpoint, evidence, resumed: checkpoint.currentState !== "ARTIFACTS_READY" };
  }

  for (const step of steps.slice(initialStepIndex)) {
    try {
      if (step.state === "PLAN_REVIEWED") {
        const registryResult = await ports.registry.inspectDigests();
        assertStageResult("IMAGES_PUBLISHED", registryResult);
        assertRegistryDigests(base.imageLock, registryResult);
      }
      await step.run(ports, { checkpoint, evidence });
      checkpoint = updateCheckpoint(checkpoint, step.state, step.stage, ports.clock.now());
      await ports.checkpoint.save(checkpoint, evidence);
      await ports.process.afterCheckpoint(step.stage);
    } catch (error) {
      if (!(error instanceof ProviderFailure)) throw error;
      if (rollbackOnFailure && FORWARD_STATES.indexOf(checkpoint.currentState) >= FORWARD_STATES.indexOf("DEPLOYED_NO_TRAFFIC")) {
        try {
          checkpoint = await rollback(checkpoint, evidence, ports);
          return { checkpoint, evidence, rolledBackFrom: step.state, error };
        } catch (rollbackError) {
          const failedAt = ports.clock.now();
          evidence.rollback = {
            runId: `rollback-${checkpoint.releaseId}`.slice(0, 63),
            completedAt: failedAt,
            result: "FAIL",
            evidenceRef: `.artifacts/tke/releases/${checkpoint.releaseId}/evidence/rollback.json`,
          };
          const failure = new ProviderFailure(step.stage, `rollback failed: ${rollbackError.message}`);
          checkpoint = failedCheckpoint(checkpoint, step, failure, failedAt);
          await ports.checkpoint.save(checkpoint, evidence);
          return { checkpoint, evidence, error: failure, rollbackError };
        }
      }
      checkpoint = failedCheckpoint(checkpoint, step, error, ports.clock.now());
      await ports.checkpoint.save(checkpoint, evidence);
      return { checkpoint, evidence, error };
    }
  }

  return { checkpoint, evidence };
}
