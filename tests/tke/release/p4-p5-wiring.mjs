const p4ContextKeys = Object.freeze([
  "releaseId",
  "environment",
  "currentState",
  "targetState",
  "stage",
  "runtimeAuthorityGranted",
  "artifactPaths",
]);

export function createP4ExecutorAdapter(ports) {
  return async context => {
    for (const key of p4ContextKeys) {
      if (!(key in (context ?? {}))) throw new TypeError(`P4 executor context.${key} is required`);
    }
    const trafficMatch = /^TRAFFIC_(5|25|50|100)$/.exec(context.stage);
    let artifactsChanged = [];
    if (context.stage === "ARTIFACTS_READY") await ports.registry.inspectDigests();
    else if (context.stage === "PLAN_INFRASTRUCTURE") await ports.terraform.reviewPlan();
    else if (context.stage === "APPLY_INFRASTRUCTURE") await ports.terraform.apply();
    else if (context.stage === "DEPLOY_NO_TRAFFIC") await ports.kubernetes.deployNoTraffic();
    else if (context.stage === "VERIFY_BACKUP") await ports.backup.verify();
    else if (context.stage === "MIGRATE_DATA") {
      await ports.migration.run();
      artifactsChanged = ["evidenceBundle"];
    } else if (context.stage === "SMOKE") {
      await ports.smoke.run();
      artifactsChanged = ["evidenceBundle"];
    } else if (context.stage === "SWITCH_JOBS") {
      await ports.jobs.switchToTke();
      await ports.jobs.observeSingleActive();
      artifactsChanged = ["evidenceBundle"];
    } else if (trafficMatch) {
      const weight = Number(trafficMatch[1]);
      await ports.traffic.setWeight(weight);
      await ports.traffic.observe(weight);
      artifactsChanged = ["evidenceBundle"];
    } else if (context.stage === "OBSERVE") await ports.lifecycle.observe();
    else if (context.stage === "RETIRE_LIGHTHOUSE") await ports.lifecycle.retire();
    else throw new Error(`unsupported P4 executor stage ${context.stage}`);
    return { artifactsChanged };
  };
}

export function createP5ControllerBindings(ports, type = "clb") {
  if (!new Set(["clb", "dns"]).has(type)) throw new TypeError("P5 provider type must be clb or dns");
  let currentWeight = 0;
  let progress;
  return {
    adapter: {
      type,
      readWeights: async () => ({
        tkeWeight: currentWeight,
        lighthouseWeight: 100 - currentWeight,
        evidenceRef: `.artifacts/tke/simulation/${type}-weights-${currentWeight}.json`,
      }),
      applyWeights: async ({ toWeight }) => {
        await ports.traffic.setWeight(toWeight);
        currentWeight = toWeight;
        return {
          tkeWeight: currentWeight,
          lighthouseWeight: 100 - currentWeight,
          evidenceRef: `.artifacts/tke/simulation/${type}-weights-${currentWeight}.json`,
        };
      },
    },
    observer: {
      observe: async ({ weight, minimumObservationSeconds }) => ({
        ...await ports.traffic.observe(weight),
        durationSeconds: minimumObservationSeconds,
      }),
    },
    store: {
      load: () => progress ? structuredClone(progress) : undefined,
      compareAndSwap: (expectedRevision, value) => {
        const actualRevision = progress?.revision ?? 0;
        if (actualRevision !== expectedRevision) return false;
        progress = structuredClone(value);
        return true;
      },
    },
  };
}
