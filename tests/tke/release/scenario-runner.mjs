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
  } },
  { state: "INFRA_READY", stage: "APPLY_INFRASTRUCTURE", run: ports => ports.terraform.apply() },
  { state: "DEPLOYED_NO_TRAFFIC", stage: "DEPLOY_NO_TRAFFIC", run: ports => ports.kubernetes.deployNoTraffic() },
  { state: "BACKUP_VERIFIED", stage: "VERIFY_BACKUP", run: ports => ports.backup.verify() },
  { state: "MIGRATED", stage: "MIGRATE_DATA", run: async (ports, context) => {
    context.evidence.migration = await ports.migration.run();
  } },
  { state: "SMOKE_PASS", stage: "SMOKE", run: async (ports, context) => {
    context.evidence.smoke = await ports.smoke.run();
  } },
  { state: "JOBS_SWITCHED", stage: "SWITCH_JOBS", run: async (ports, context) => {
    await ports.jobs.switchToTke();
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
      await ports.traffic.setWeight(weight);
      context.evidence.trafficObservations.push(await ports.traffic.observe(weight));
      try {
        validateEvidenceSemantics(context.evidence);
      } catch (error) {
        throw new ProviderFailure(`TRAFFIC_${weight}`, error.message);
      }
    },
  })),
  { state: "OBSERVED", stage: "OBSERVE", run: ports => ports.lifecycle.observe() },
  { state: "LIGHTHOUSE_RETIRED", stage: "RETIRE_LIGHTHOUSE", run: ports => ports.lifecycle.retire() },
]);

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
  await ports.traffic.rollback();
  await ports.jobs.returnToLighthouse();
  await ports.kubernetes.rollback();
  const completedAt = ports.clock.now();
  evidence.rollback = {
    runId: "rollback-20260716-001",
    completedAt,
    result: "PASS",
    evidenceRef: ".artifacts/tke/releases/release-20260716-001/evidence/rollback.json",
  };
  assertTransition(checkpoint.currentState, "ROLLED_BACK");
  const rolledBack = validateCheckpointSemantics({
    ...checkpoint,
    currentState: "ROLLED_BACK",
    completedStages: [...new Set([...checkpoint.completedStages, "ROLLBACK"])],
    updatedAt: completedAt,
    revision: checkpoint.revision + 1,
  });
  await ports.checkpoint.save(rolledBack);
  return rolledBack;
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
  let checkpoint = await ports.checkpoint.load();
  let evidence = base.evidenceBundle;
  validateCheckpointSemantics(checkpoint);

  const initialStepIndex = stepStartIndex(checkpoint);
  if (initialStepIndex < 0) {
    return { checkpoint, evidence, resumed: checkpoint.currentState !== "ARTIFACTS_READY" };
  }

  for (const step of steps.slice(initialStepIndex)) {
    try {
      if (step.state === "PLAN_REVIEWED") {
        assertRegistryDigests(base.imageLock, await ports.registry.inspectDigests());
      }
      await step.run(ports, { checkpoint, evidence });
      checkpoint = updateCheckpoint(checkpoint, step.state, step.stage, ports.clock.now());
      await ports.checkpoint.save(checkpoint);
      await ports.process.afterCheckpoint(step.stage);
    } catch (error) {
      if (!(error instanceof ProviderFailure)) throw error;
      if (rollbackOnFailure && FORWARD_STATES.indexOf(checkpoint.currentState) >= FORWARD_STATES.indexOf("DEPLOYED_NO_TRAFFIC")) {
        checkpoint = await rollback(checkpoint, evidence, ports);
        return { checkpoint, evidence, rolledBackFrom: step.state, error };
      }
      checkpoint = failedCheckpoint(checkpoint, step, error, ports.clock.now());
      await ports.checkpoint.save(checkpoint);
      return { checkpoint, evidence, error };
    }
  }

  return { checkpoint, evidence };
}
