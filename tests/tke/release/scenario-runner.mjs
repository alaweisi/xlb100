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
    assertTrueField("PLAN_INFRASTRUCTURE", plan, "approved");
  } },
  { state: "INFRA_READY", stage: "APPLY_INFRASTRUCTURE", run: async ports => {
    assertTrueField("APPLY_INFRASTRUCTURE", await ports.terraform.apply(), "applied");
  } },
  { state: "DEPLOYED_NO_TRAFFIC", stage: "DEPLOY_NO_TRAFFIC", run: async ports => {
    const result = await ports.kubernetes.deployNoTraffic();
    assertTrueField("DEPLOY_NO_TRAFFIC", result, "ready");
    assertExactField("DEPLOY_NO_TRAFFIC", result, "publicTrafficWeight", 0);
  } },
  { state: "BACKUP_VERIFIED", stage: "VERIFY_BACKUP", run: async ports => {
    assertTrueField("VERIFY_BACKUP", await ports.backup.verify(), "verified");
  } },
  { state: "MIGRATED", stage: "MIGRATE_DATA", run: async (ports, context) => {
    context.evidence.migration = await ports.migration.run();
    assertExecutionEvidence("MIGRATE_DATA", context.evidence.migration, context.releaseId);
  } },
  { state: "SMOKE_PASS", stage: "SMOKE", run: async (ports, context) => {
    context.evidence.smoke = await ports.smoke.run();
    assertExecutionEvidence("SMOKE", context.evidence.smoke, context.releaseId);
  } },
  { state: "JOBS_SWITCHED", stage: "SWITCH_JOBS", run: async (ports, context) => {
    assertTrueField("SWITCH_JOBS", await ports.jobs.switchToTke(), "switched");
    context.evidence.jobsSingleActive = await ports.jobs.observeSingleActive();
    try {
      validateEvidenceSemantics(context.evidence);
    } catch (error) {
      throw new ProviderFailure("SWITCH_JOBS", error.message);
    }
    const jobs = context.evidence.jobsSingleActive;
    assertExactField("SWITCH_JOBS", jobs, "lighthouseState", "STOPPED");
    assertExactField("SWITCH_JOBS", jobs, "tkeState", "ACTIVE");
    assertExactField("SWITCH_JOBS", jobs, "leaseOwner", `tke-jobs-${context.releaseId}`.slice(0, 253));
    assertEvidenceRef("SWITCH_JOBS", jobs.evidenceRef, context.releaseId);
  } },
  ...TRAFFIC_STEPS.map(weight => ({
    state: `TRAFFIC_${weight}`,
    stage: `TRAFFIC_${weight}`,
    run: async (ports, context) => {
      context.evidence.trafficObservations = context.evidence.trafficObservations.filter(
        item => item.weight < weight,
      );
      assertExactField(`TRAFFIC_${weight}`, await ports.traffic.setWeight(weight), "weight", weight);
      const observation = await ports.traffic.observe(weight);
      context.evidence.trafficObservations.push(observation);
      assertExactField(`TRAFFIC_${weight}`, observation, "weight", weight);
      assertExactField(`TRAFFIC_${weight}`, observation, "result", "PASS");
      assertEvidenceRef(`TRAFFIC_${weight}`, observation.evidenceRef, context.releaseId);
      try {
        validateEvidenceSemantics(context.evidence);
      } catch (error) {
        throw new ProviderFailure(`TRAFFIC_${weight}`, error.message);
      }
    },
  })),
  { state: "OBSERVED", stage: "OBSERVE", run: async ports => {
    assertTrueField("OBSERVE", await ports.lifecycle.observe(), "passed");
  } },
  { state: "LIGHTHOUSE_RETIRED", stage: "RETIRE_LIGHTHOUSE", run: async ports => {
    assertTrueField("RETIRE_LIGHTHOUSE", await ports.lifecycle.retire(), "retired");
  } },
]);

function assertStageResult(stage, result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ProviderFailure(stage, `${stage} returned no structured result`);
  }
  if (result?.result === "FAIL") {
    throw new ProviderFailure(stage, `${stage} returned explicit result=FAIL`);
  }
  return result;
}

function assertExactField(stage, result, field, expected) {
  assertStageResult(stage, result);
  if (!(field in result)) throw new ProviderFailure(stage, `${stage} result.${field} is required`);
  if (result[field] !== expected) {
    throw new ProviderFailure(stage, `${stage} result.${field} must be ${JSON.stringify(expected)}`);
  }
  return result;
}

function assertTrueField(stage, result, field) {
  return assertExactField(stage, result, field, true);
}

function assertEvidenceRef(stage, reference, releaseId) {
  const prefix = `.artifacts/tke/releases/${releaseId}/`;
  if (typeof reference !== "string" || !reference.startsWith(prefix)) {
    throw new ProviderFailure(stage, `${stage} evidenceRef must belong to ${prefix}`);
  }
}

function assertExecutionEvidence(stage, result, releaseId) {
  assertExactField(stage, result, "result", "PASS");
  if (typeof result.runId !== "string" || result.runId.length < 6 || result.runId.length > 63) {
    throw new ProviderFailure(stage, `${stage} result.runId is required`);
  }
  if (!Number.isFinite(Date.parse(result.completedAt))) {
    throw new ProviderFailure(stage, `${stage} result.completedAt is required`);
  }
  assertEvidenceRef(stage, result.evidenceRef, releaseId);
}

function assertEvidenceOwnership(evidence, releaseId, stage) {
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "evidenceRef") assertEvidenceRef(stage, child, releaseId);
      else visit(child);
    }
  };
  visit(evidence);
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
  const traffic = await ports.traffic.rollback();
  assertExactField("ROLLBACK", traffic, "lighthouseWeight", 100);
  assertExactField("ROLLBACK", traffic, "tkeWeight", 0);
  assertExactField("ROLLBACK", await ports.jobs.returnToLighthouse(), "activeSide", "LIGHTHOUSE");
  assertTrueField("ROLLBACK", await ports.kubernetes.rollback(), "rolledBack");
  const completedAt = ports.clock.now();
  evidence.rollback = {
    runId: `rollback-${checkpoint.releaseId}`.slice(0, 63),
    completedAt,
    result: "PASS",
    evidenceRef: `.artifacts/tke/releases/${checkpoint.releaseId}/evidence/rollback.json`,
  };
  assertEvidenceOwnership(evidence, checkpoint.releaseId, "ROLLBACK");
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
    assertEvidenceOwnership(evidence, checkpoint.releaseId, "PREPARE");
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
        assertTrueField("IMAGES_PUBLISHED", registryResult, "published");
        if (!registryResult.digests || typeof registryResult.digests !== "object") {
          throw new ProviderFailure("IMAGES_PUBLISHED", "IMAGES_PUBLISHED result.digests is required");
        }
        assertRegistryDigests(base.imageLock, registryResult.digests);
      }
      await step.run(ports, { checkpoint, evidence, releaseId: checkpoint.releaseId });
      assertEvidenceOwnership(evidence, checkpoint.releaseId, step.stage);
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
