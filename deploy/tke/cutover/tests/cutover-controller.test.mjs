import assert from "node:assert/strict";
import test from "node:test";
import {
  CutoverController,
  buildCutoverPlan,
  createClbAdapter,
  createDnsAdapter,
  createInitialProgress,
  createMemoryProgressStore,
} from "../cutover-controller.mjs";

const releaseId = "release-20260717-001";
const hashes = Object.freeze({
  releaseManifest: "a".repeat(64),
  cloudBundle: "b".repeat(64),
  evidenceBundle: "c".repeat(64),
  checkpoint: "d".repeat(64),
});
const timestamp = "2026-07-17T01:00:00Z";
const completedThroughJobs = [
  "PREPARE",
  "IMAGES_PUBLISHED",
  "CLOUD_BUNDLE_READY",
  "SAFETY_CONTRACT_READY",
  "PLAN_INFRASTRUCTURE",
  "APPLY_INFRASTRUCTURE",
  "DEPLOY_NO_TRAFFIC",
  "VERIFY_BACKUP",
  "MIGRATE_DATA",
  "SMOKE",
  "SWITCH_JOBS",
];

function fixtures(overrides = {}) {
  const provider = overrides.provider ?? "clb";
  const request = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    trafficProvider: provider,
    files: {
      releaseManifest: `.artifacts/tke/releases/${releaseId}/release-manifest.json`,
      cloudBundle: ".artifacts/tke/production/manifest.json",
      evidenceBundle: `.artifacts/tke/releases/${releaseId}/evidence.json`,
      checkpoint: `.artifacts/tke/releases/${releaseId}/checkpoint.json`,
    },
    expectedHashes: { ...hashes },
    steps: [5, 25, 50, 100].map(weight => ({ weight, minimumObservationSeconds: 900 })),
    rollbackTargetWeight: 0,
  };
  const releaseManifest = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    executionMode: "gated-release",
    sourceCommit: "e".repeat(40),
    createdAt: timestamp,
    owners: { release: "release", data: "data", onCall: "oncall", cost: "cost" },
    changeWindow: { startsAt: "2026-07-18T01:00:00Z", endsAt: "2026-07-18T05:00:00Z", timezone: "Asia/Shanghai" },
    imageLockFile: `.artifacts/tke/releases/${releaseId}/images.lock.json`,
    cloudBundleFile: ".artifacts/tke/production/manifest.json",
    evidenceFile: `.artifacts/tke/releases/${releaseId}/evidence.json`,
    checkpointFile: `.artifacts/tke/releases/${releaseId}/checkpoint.json`,
    trafficProvider: provider,
  };
  const cloudBundle = {
    schemaVersion: 1,
    environment: "production",
    region: "ap-guangzhou",
    accountId: "100000000000",
    approvedKubeContext: "tke-production-context",
    network: { vpcId: "vpc-abc123", subnetIds: ["subnet-abc123"] },
    files: {
      terraformVarFile: ".artifacts/tke/production/production.tfvars",
      backendConfig: ".artifacts/tke/production/production.backend.hcl",
      valuesFile: ".artifacts/tke/production/values-production.yaml",
      imageLockFile: `.artifacts/tke/releases/${releaseId}/images.lock.json`,
    },
    secretReferences: { runtimeSecretName: "xlb-runtime", tlsSecretName: "xlb-tls" },
    costReview: {
      currency: "CNY",
      monthlyMin: 1,
      monthlyMax: 2,
      sourceUrl: "https://cloud.tencent.com/product/calculator",
      reviewedAt: "2026-07-17",
      owner: "cost",
    },
    bundleSha256: "f".repeat(64),
  };
  const evidenceBundle = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    updatedAt: timestamp,
    backup: {
      backupId: "backup-001",
      createdAt: timestamp,
      verifiedAt: timestamp,
      restoreDrill: {
        performedAt: timestamp,
        result: "PASS",
        evidenceRef: `.artifacts/tke/releases/${releaseId}/restore.json`,
      },
    },
    jobsSingleActive: {
      lighthouseState: "STOPPED",
      tkeState: "ACTIVE",
      leaseOwner: "tke-jobs",
      fencingToken: 2,
      observedAt: timestamp,
      evidenceRef: `.artifacts/tke/releases/${releaseId}/jobs.json`,
    },
    trafficObservations: [],
  };
  const checkpoint = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    currentState: "JOBS_SWITCHED",
    completedStages: completedThroughJobs,
    artifactHashes: {
      releaseManifest: hashes.releaseManifest,
      imageLock: "1".repeat(64),
      cloudBundle: hashes.cloudBundle,
      evidenceBundle: hashes.evidenceBundle,
    },
    updatedAt: timestamp,
    revision: 11,
  };
  return { request, releaseManifest, cloudBundle, evidenceBundle, checkpoint, actualHashes: { ...hashes } };
}

function makePlan(overrides) {
  return buildCutoverPlan(fixtures(overrides));
}

class FakeTransport {
  constructor({ initialWeight = 0, failApplyOnceAt } = {}) {
    this.weight = initialWeight;
    this.failApplyOnceAt = failApplyOnceAt;
    this.failed = false;
    this.calls = [];
    this.completed = new Map();
  }

  evidence(weight, suffix = "read") {
    return {
      tkeWeight: weight,
      lighthouseWeight: 100 - weight,
      evidenceRef: `.artifacts/tke/tests/provider-${suffix}-${weight}.json`,
    };
  }

  async readWeights() { return this.evidence(this.weight); }

  async applyWeights({ toWeight, idempotencyKey }) {
    this.calls.push({ toWeight, idempotencyKey });
    if (this.completed.has(idempotencyKey)) return this.completed.get(idempotencyKey);
    if (toWeight === this.failApplyOnceAt && !this.failed) {
      this.failed = true;
      throw new Error("injected provider failure");
    }
    this.weight = toWeight;
    const result = this.evidence(toWeight, "apply");
    this.completed.set(idempotencyKey, result);
    return result;
  }
}

class FakeObserver {
  constructor({ failOnceAt, rollbackFailOnceAt } = {}) {
    this.failOnceAt = failOnceAt;
    this.rollbackFailOnceAt = rollbackFailOnceAt;
    this.failed = new Set();
    this.calls = [];
  }

  async observe({ weight, direction, minimumObservationSeconds }) {
    this.calls.push({ weight, direction });
    const key = `${direction}-${weight}`;
    const shouldFail = direction === "forward" ? weight === this.failOnceAt : weight === this.rollbackFailOnceAt;
    if (shouldFail && !this.failed.has(key)) {
      this.failed.add(key);
      throw new Error("injected observation failure");
    }
    return {
      weight,
      result: "PASS",
      durationSeconds: minimumObservationSeconds,
      observedAt: timestamp,
      evidenceRef: `.artifacts/tke/tests/observe-${direction}-${weight}.json`,
    };
  }
}

function makeController({ plan, transport = new FakeTransport({ initialWeight: plan.initialWeight }), observer = new FakeObserver(), store } = {}) {
  const progressStore = store ?? createMemoryProgressStore();
  return {
    transport,
    observer,
    store: progressStore,
    controller: new CutoverController({
      adapter: plan.trafficProvider === "clb" ? createClbAdapter(transport) : createDnsAdapter(transport),
      observer,
      store: progressStore,
      now: () => new Date(timestamp),
    }),
  };
}

test("builds an offline CLB or DNS plan with external execution disabled", () => {
  for (const provider of ["clb", "dns"]) {
    const plan = makePlan({ provider });
    assert.equal(plan.trafficProvider, provider);
    assert.equal(plan.externalExecutionEnabled, false);
    assert.deepEqual(plan.steps.map(step => step.weight), [5, 25, 50, 100]);
    assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  }
});

test("rejects skipped traffic levels and artifact hash drift", () => {
  const skipped = fixtures();
  skipped.request.steps = [5, 50, 25, 100].map(weight => ({ weight, minimumObservationSeconds: 900 }));
  assert.throws(() => buildCutoverPlan(skipped), /exactly 5\/25\/50\/100/);

  const drifted = fixtures();
  drifted.actualHashes.evidenceBundle = "9".repeat(64);
  assert.throws(() => buildCutoverPlan(drifted), /evidenceBundle SHA-256 drift/);
});

test("rejects forward cutover unless TKE Jobs is the sole active side", () => {
  const input = fixtures();
  input.evidenceBundle.jobsSingleActive = {
    ...input.evidenceBundle.jobsSingleActive,
    lighthouseState: "ACTIVE",
    tkeState: "STOPPED",
    leaseOwner: "lighthouse-jobs",
  };
  assert.throws(() => buildCutoverPlan(input), /requires Lighthouse Jobs STOPPED and TKE Jobs ACTIVE/);
});

test("advances 5/25/50/100, records observation evidence, and is idempotent", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan });
  for (const weight of [5, 25, 50, 100]) {
    const result = await runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: weight, confirmed: true });
    assert.equal(result.progress.currentWeight, weight);
  }
  const duplicate = await runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 100, confirmed: true });
  assert.equal(duplicate.idempotent, true);
  assert.equal(runtime.transport.calls.length, 4);
  assert.equal(runtime.store.load().status, "CUTOVER_COMPLETE");
  assert.deepEqual(runtime.store.load().observations.map(item => item.weight), [5, 25, 50, 100]);
  assert.equal(JSON.stringify(runtime.store.load()).includes("confirmed"), false);
});

test("requires transient confirmation and rejects a skipped runtime target", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan });
  await assert.rejects(runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5 }), /transient runtime confirmation/);
  await assert.rejects(runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 25, confirmed: true }), /next traffic weight must be 5/);
  assert.equal(runtime.transport.calls.length, 0);
});

test("resumes a failed observation without applying the traffic weight twice", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan, observer: new FakeObserver({ failOnceAt: 5 }) });
  await assert.rejects(runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5, confirmed: true }), /observation failure/);
  assert.equal(runtime.store.load().currentWeight, 5);
  const resumed = await runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5, confirmed: true });
  assert.equal(resumed.progress.status, "READY");
  assert.equal(runtime.transport.calls.length, 1);
  assert.equal(runtime.observer.calls.length, 2);
});

test("retries a provider failure with the same idempotency key", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan, transport: new FakeTransport({ failApplyOnceAt: 5 }) });
  await assert.rejects(runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5, confirmed: true }), /provider failure/);
  await runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5, confirmed: true });
  assert.equal(runtime.transport.calls.length, 2);
  assert.equal(runtime.transport.calls[0].idempotencyKey, runtime.transport.calls[1].idempotencyKey);
});

test("rolls traffic back in reverse order with evidence and resumes observation failure", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan, observer: new FakeObserver({ rollbackFailOnceAt: 25 }) });
  for (const weight of [5, 25, 50]) {
    await runtime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: weight, confirmed: true });
  }
  await assert.rejects(runtime.controller.rollback({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, confirmed: true }), /observation failure/);
  assert.equal(runtime.store.load().currentWeight, 25);
  const result = await runtime.controller.rollback({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, confirmed: true });
  assert.equal(result.progress.status, "ROLLED_BACK");
  assert.deepEqual(result.progress.rollback.transitions.map(item => [item.fromWeight, item.toWeight]), [[50, 25], [25, 5], [5, 0]]);
  assert.equal(result.progress.rollback.jobsHandoffRequired, true);
  const duplicate = await runtime.controller.rollback({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, confirmed: true });
  assert.equal(duplicate.idempotent, true);
});

test("detects plan and progress drift before touching the provider", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const tamperedPlan = structuredClone(plan);
  tamperedPlan.steps[0].minimumObservationSeconds = 60;
  const runtime = makeController({ plan });
  await assert.rejects(runtime.controller.advance({ plan: tamperedPlan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5, confirmed: true }), /plan hash drift/);

  const progress = createInitialProgress(plan, new Date(timestamp));
  progress.artifactHashes.cloudBundle = "9".repeat(64);
  const driftStore = createMemoryProgressStore(progress);
  const driftRuntime = makeController({ plan, store: driftStore });
  await assert.rejects(driftRuntime.controller.advance({ plan, evidenceBundle, evidenceSha256: hashes.evidenceBundle, targetWeight: 5, confirmed: true }), /artifact hash drift/);
  assert.equal(runtime.transport.calls.length, 0);
  assert.equal(driftRuntime.transport.calls.length, 0);
});

test("adapters require an injected transport and persisted decisions are rejected", () => {
  assert.throws(() => createClbAdapter(), /explicitly injected transport/);
  const input = fixtures();
  input.request.confirmed = true;
  assert.throws(() => buildCutoverPlan(input), /additional properties|persisted execution decision/);
});

test("rejects runtime evidence hash and identity drift before touching the provider", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan });
  await assert.rejects(runtime.controller.advance({
    plan,
    evidenceBundle,
    evidenceSha256: "9".repeat(64),
    targetWeight: 5,
    confirmed: true,
  }), /runtime evidence SHA-256 drift/);
  const wrongRelease = { ...evidenceBundle, releaseId: "release-20260717-999" };
  await assert.rejects(runtime.controller.advance({
    plan,
    evidenceBundle: wrongRelease,
    evidenceSha256: hashes.evidenceBundle,
    targetWeight: 5,
    confirmed: true,
  }), /runtime evidence releaseId drift/);
  assert.equal(runtime.transport.calls.length, 0);
});

test("rollback from zero is an idempotent no-provider transition", async () => {
  const plan = makePlan();
  const evidenceBundle = fixtures().evidenceBundle;
  const runtime = makeController({ plan });
  const result = await runtime.controller.rollback({
    plan,
    evidenceBundle,
    evidenceSha256: hashes.evidenceBundle,
    confirmed: true,
  });
  assert.equal(result.progress.status, "ROLLED_BACK");
  assert.equal(runtime.transport.calls.length, 0);
  assert.deepEqual(result.progress.rollback.transitions, []);
});
