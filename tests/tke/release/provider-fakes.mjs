import { clone, lockedDigests } from "./fixture-builder.mjs";

export class ProviderFailure extends Error {
  constructor(stage, message = `deterministic provider failure at ${stage}`) {
    super(message);
    this.name = "ProviderFailure";
    this.stage = stage;
  }
}

export class ProcessInterrupted extends Error {
  constructor(stage) {
    super(`deterministic process interruption after ${stage}`);
    this.name = "ProcessInterrupted";
    this.stage = stage;
  }
}

export function createDeterministicProviderFakes(fixture, options = {}) {
  const trace = [];
  const checkpoints = [];
  let storedCheckpoint = clone(options.checkpoint ?? fixture.checkpoint);
  let interrupted = false;
  let clockTick = 0;

  const record = (operation, detail = {}) => {
    trace.push({ sequence: trace.length + 1, operation, ...detail });
  };
  const invoke = (stage, result) => {
    record("provider.invoke", { stage });
    if (options.failAt === stage) throw new ProviderFailure(stage);
    return clone(result);
  };

  const defaultJobs = {
    lighthouseState: "STOPPED",
    tkeState: "ACTIVE",
    leaseOwner: "tke-jobs-release-20260716-001",
    fencingToken: 42,
    observedAt: "2026-07-16T09:30:00Z",
    evidenceRef: ".artifacts/tke/releases/release-20260716-001/evidence/jobs-tke.json",
  };

  const ports = {
    registry: {
      inspectDigests: () => invoke(
        "INSPECT_IMAGE_DIGESTS",
        options.registryDigests ?? lockedDigests(fixture.imageLock),
      ),
    },
    terraform: {
      reviewPlan: () => invoke("PLAN_INFRASTRUCTURE", { approved: options.planApproved ?? true }),
      apply: () => invoke("APPLY_INFRASTRUCTURE", { applied: true }),
    },
    kubernetes: {
      deployNoTraffic: () => invoke("DEPLOY_NO_TRAFFIC", { ready: true, publicTrafficWeight: 0 }),
      rollback: () => invoke("ROLLBACK_KUBERNETES", { rolledBack: true }),
    },
    backup: {
      verify: () => invoke("VERIFY_BACKUP", { verified: true }),
    },
    migration: {
      run: () => invoke("MIGRATE_DATA", {
        runId: "migration-20260716-001",
        completedAt: "2026-07-16T09:10:00Z",
        result: "PASS",
        evidenceRef: ".artifacts/tke/releases/release-20260716-001/evidence/migration.json",
      }),
    },
    smoke: {
      run: () => invoke("SMOKE", {
        runId: "smoke-20260716-001",
        completedAt: "2026-07-16T09:20:00Z",
        result: "PASS",
        evidenceRef: ".artifacts/tke/releases/release-20260716-001/evidence/smoke.json",
      }),
    },
    jobs: {
      switchToTke: () => invoke("SWITCH_JOBS", { switched: true }),
      observeSingleActive: () => invoke("OBSERVE_JOBS", options.jobsObservation ?? defaultJobs),
      returnToLighthouse: () => invoke("ROLLBACK_JOBS", { activeSide: "LIGHTHOUSE" }),
    },
    traffic: {
      setWeight: weight => invoke(`TRAFFIC_${weight}`, { weight }),
      observe: weight => invoke(`OBSERVE_TRAFFIC_${weight}`, {
        weight,
        observedAt: `2026-07-16T${String(10 + Math.floor(weight / 25)).padStart(2, "0")}:00:00Z`,
        result: "PASS",
        evidenceRef: `.artifacts/tke/releases/release-20260716-001/evidence/traffic-${weight}.json`,
      }),
      rollback: () => invoke("ROLLBACK_TRAFFIC", { lighthouseWeight: 100, tkeWeight: 0 }),
    },
    lifecycle: {
      observe: () => invoke("OBSERVE", { passed: true }),
      retire: () => invoke("RETIRE_LIGHTHOUSE", { retired: true }),
    },
    checkpoint: {
      load: () => clone(storedCheckpoint),
      save: checkpoint => {
        storedCheckpoint = clone(checkpoint);
        checkpoints.push(clone(checkpoint));
        record("checkpoint.save", { state: checkpoint.currentState, revision: checkpoint.revision });
      },
    },
    process: {
      afterCheckpoint: stage => {
        if (!interrupted && options.interruptAfter === stage) {
          interrupted = true;
          record("process.interrupt", { stage });
          throw new ProcessInterrupted(stage);
        }
      },
    },
    clock: {
      now: () => {
        const minute = 31 + clockTick;
        clockTick += 1;
        return `2026-07-16T09:${String(minute).padStart(2, "0")}:00Z`;
      },
    },
  };

  return {
    ports,
    trace,
    checkpoints,
    getCheckpoint: () => clone(storedCheckpoint),
  };
}
