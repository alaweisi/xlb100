import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const timestamp = "2026-07-17T01:00:00Z";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = value => Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
const completedThroughJobs = [
  "PREPARE", "IMAGES_PUBLISHED", "CLOUD_BUNDLE_READY", "SAFETY_CONTRACT_READY",
  "PLAN_INFRASTRUCTURE", "APPLY_INFRASTRUCTURE", "DEPLOY_NO_TRAFFIC",
  "VERIFY_BACKUP", "MIGRATE_DATA", "SMOKE", "SWITCH_JOBS",
];

function fixture({ provider = "clb", minimumObservationSeconds = 900 } = {}) {
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
      currency: "CNY", monthlyMin: 1, monthlyMax: 2,
      sourceUrl: "https://cloud.tencent.com/product/calculator",
      reviewedAt: "2026-07-17", owner: "cost",
    },
    bundleSha256: "f".repeat(64),
  };
  const evidenceBundle = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    updatedAt: timestamp,
    backup: {
      backupId: "backup-001", createdAt: timestamp, verifiedAt: timestamp,
      restoreDrill: {
        performedAt: timestamp, result: "PASS",
        evidenceRef: `.artifacts/tke/releases/${releaseId}/restore.json`,
      },
    },
    jobsSingleActive: {
      lighthouseState: "STOPPED", tkeState: "ACTIVE", leaseOwner: "tke-jobs",
      fencingToken: 2, observedAt: timestamp,
      evidenceRef: `.artifacts/tke/releases/${releaseId}/jobs.json`,
    },
    trafficObservations: [],
  };
  const raw = {
    releaseManifest: bytes(releaseManifest),
    cloudBundle: bytes(cloudBundle),
    evidenceBundle: bytes(evidenceBundle),
  };
  const hashes = {
    releaseManifest: hash(raw.releaseManifest),
    cloudBundle: hash(raw.cloudBundle),
    evidenceBundle: hash(raw.evidenceBundle),
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
  raw.checkpoint = bytes(checkpoint);
  hashes.checkpoint = hash(raw.checkpoint);
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
    steps: [5, 25, 50, 100].map(weight => ({ weight, minimumObservationSeconds })),
    rollbackTargetWeight: 0,
  };
  return {
    request, releaseManifest, cloudBundle, evidenceBundle, checkpoint,
    actualHashes: { ...hashes }, raw,
  };
}

function planned(options) {
  const input = fixture(options);
  return { input, plan: buildCutoverPlan(input), evidenceSource: { bytes: input.raw.evidenceBundle } };
}

function token(plan, action, targetWeight) {
  return { releaseId: plan.releaseId, planSha256: plan.planSha256, action, targetWeight };
}

class FakeTransport {
  constructor({ initialWeight = 0, failApplyOnceAt, failReadOnce = false, traversalAt } = {}) {
    this.weight = initialWeight;
    this.failApplyOnceAt = failApplyOnceAt;
    this.failReadOnce = failReadOnce;
    this.traversalAt = traversalAt;
    this.readFailed = false;
    this.applyFailed = false;
    this.calls = [];
    this.reads = 0;
    this.completed = new Map();
  }
  evidence(weight, suffix = "read") {
    return {
      tkeWeight: weight,
      lighthouseWeight: 100 - weight,
      evidenceRef: weight === this.traversalAt
        ? ".artifacts/tke/../../escape.json"
        : `.artifacts/tke/tests/provider-${suffix}-${weight}.json`,
    };
  }
  async readWeights() {
    this.reads += 1;
    if (this.failReadOnce && !this.readFailed) {
      this.readFailed = true;
      throw new Error("injected read failure");
    }
    return this.evidence(this.weight);
  }
  async applyWeights({ toWeight, idempotencyKey }) {
    this.calls.push({ toWeight, idempotencyKey });
    if (this.completed.has(idempotencyKey)) return this.completed.get(idempotencyKey);
    if (toWeight === this.failApplyOnceAt && !this.applyFailed) {
      this.applyFailed = true;
      throw new Error("injected provider failure");
    }
    this.weight = toWeight;
    const result = this.evidence(toWeight, "apply");
    this.completed.set(idempotencyKey, result);
    return result;
  }
}

class FakeObserver {
  constructor({ failOnceAt, duration = 900, traversalAt } = {}) {
    this.failOnceAt = failOnceAt;
    this.duration = duration;
    this.traversalAt = traversalAt;
    this.failed = new Set();
    this.calls = [];
  }
  async observe({ weight, direction }) {
    this.calls.push({ weight, direction });
    const key = `${direction}-${weight}`;
    if (weight === this.failOnceAt && !this.failed.has(key)) {
      this.failed.add(key);
      throw new Error("injected observation failure");
    }
    return {
      weight,
      result: "PASS",
      durationSeconds: this.duration,
      observedAt: timestamp,
      evidenceRef: weight === this.traversalAt
        ? ".artifacts/tke/../escape.json"
        : `.artifacts/tke/tests/observe-${direction}-${weight}.json`,
    };
  }
}

function runtime(plan, { transport, observer, store } = {}) {
  const actualTransport = transport ?? new FakeTransport({ initialWeight: plan.initialWeight });
  const actualObserver = observer ?? new FakeObserver();
  const actualStore = store ?? createMemoryProgressStore();
  return {
    transport: actualTransport,
    observer: actualObserver,
    store: actualStore,
    controller: new CutoverController({
      adapter: plan.trafficProvider === "clb" ? createClbAdapter(actualTransport) : createDnsAdapter(actualTransport),
      observer: actualObserver,
      store: actualStore,
      now: () => new Date(timestamp),
    }),
  };
}

async function advance(run, plan, evidenceSource, weight) {
  return run.controller.advance({ plan, evidenceSource, targetWeight: weight, executionToken: token(plan, "ADVANCE", weight) });
}

test("builds provider-neutral CLB and DNS plans with 900-second minimum", () => {
  for (const provider of ["clb", "dns"]) {
    const { plan } = planned({ provider });
    assert.equal(plan.trafficProvider, provider);
    assert.equal(plan.externalExecutionEnabled, false);
    assert.deepEqual(plan.steps.map(item => item.weight), [5, 25, 50, 100]);
    assert.equal(plan.rollback.minimumObservationSeconds, 900);
  }
  assert.throws(() => planned({ minimumObservationSeconds: 899 }), /must be >= 900|at least 900/);
});

test("runtime recomputes evidence SHA from original bytes and rejects stale claimed content", async () => {
  const { input, plan } = planned();
  const run = runtime(plan);
  const tampered = structuredClone(input.evidenceBundle);
  tampered.jobsSingleActive.leaseOwner = "attacker";
  await assert.rejects(advance(run, plan, { bytes: bytes(tampered) }, 5), /runtime evidence SHA-256 drift/);
  await assert.rejects(run.controller.advance({
    plan,
    evidenceSource: { bytes: input.evidenceBundle },
    targetWeight: 5,
    executionToken: token(plan, "ADVANCE", 5),
  }), /bytes must be Buffer|SHA-256 drift/);
  assert.equal(run.transport.calls.length, 0);
});

test("execution token is exactly bound and never persisted", async () => {
  const { plan, evidenceSource } = planned();
  const run = runtime(plan);
  await assert.rejects(run.controller.advance({
    plan, evidenceSource, targetWeight: 5,
    executionToken: { ...token(plan, "ADVANCE", 25) },
  }), /not bound/);
  await assert.rejects(run.controller.advance({
    plan, evidenceSource, targetWeight: 5,
    executionToken: { ...token(plan, "ADVANCE", 5), extra: true },
  }), /unexpected or missing/);
  await advance(run, plan, evidenceSource, 5);
  assert.equal(JSON.stringify(run.store.load()).includes("executionToken"), false);
});

test("forged OBSERVE pending cannot skip provider verification", async () => {
  const { plan, evidenceSource } = planned();
  const forged = createInitialProgress(plan, new Date(timestamp));
  forged.status = "OBSERVATION_PENDING";
  forged.currentWeight = 5;
  forged.pendingOperation = {
    direction: "forward", phase: "OBSERVE", fromWeight: 0, toWeight: 5,
    idempotencyKey: `${plan.releaseId}:${plan.planSha256.slice(0, 12)}:forward:0-5`,
    providerEvidenceRef: ".artifacts/tke/tests/forged.json",
  };
  const run = runtime(plan, { store: createMemoryProgressStore(forged) });
  await assert.rejects(advance(run, plan, evidenceSource, 5), /requested complementary weights/);
  assert.equal(run.observer.calls.length, 0);
});

test("progress schema and semantics reject forged completion and CAS conflicts", async () => {
  const { plan, evidenceSource } = planned();
  const forged = createInitialProgress(plan, new Date(timestamp));
  forged.completedWeights = [5, 50];
  forged.currentWeight = 50;
  const run = runtime(plan, { store: createMemoryProgressStore(forged) });
  await assert.rejects(advance(run, plan, evidenceSource, 25), /valid ordered prefix/);

  const backing = createMemoryProgressStore();
  const conflictStore = {
    load: backing.load,
    compareAndSwap: () => false,
  };
  const conflict = runtime(plan, { store: conflictStore });
  await assert.rejects(advance(conflict, plan, evidenceSource, 5), /CAS initialization conflict/);
});

test("899-second runtime observation is checkpointed as OBSERVATION_FAILED and resumes", async () => {
  const { plan, evidenceSource } = planned();
  const observer = new FakeObserver({ duration: 899 });
  const run = runtime(plan, { observer });
  await assert.rejects(advance(run, plan, evidenceSource, 5), /shorter than 900/);
  assert.equal(run.store.load().status, "OBSERVATION_FAILED");
  observer.duration = 900;
  await advance(run, plan, evidenceSource, 5);
  assert.equal(run.transport.calls.length, 1);
  assert.equal(run.store.load().status, "READY");
});

test("path traversal evidence is rejected and checkpointed", async () => {
  const { plan, evidenceSource } = planned();
  const providerRun = runtime(plan, { transport: new FakeTransport({ traversalAt: 5 }) });
  await assert.rejects(advance(providerRun, plan, evidenceSource, 5), /escapes or is not normalized/);
  assert.equal(providerRun.store.load().status, "APPLY_FAILED");

  const observerRun = runtime(plan, { observer: new FakeObserver({ traversalAt: 5 }) });
  await assert.rejects(advance(observerRun, plan, evidenceSource, 5), /escapes or is not normalized/);
  assert.equal(observerRun.store.load().status, "OBSERVATION_FAILED");

  const input = fixture();
  input.evidenceBundle.jobsSingleActive.evidenceRef = ".artifacts/tke/../escape.json";
  input.raw.evidenceBundle = bytes(input.evidenceBundle);
  input.request.expectedHashes.evidenceBundle = hash(input.raw.evidenceBundle);
  input.actualHashes.evidenceBundle = input.request.expectedHashes.evidenceBundle;
  input.checkpoint.artifactHashes.evidenceBundle = input.request.expectedHashes.evidenceBundle;
  assert.throws(() => buildCutoverPlan(input), /escapes or is not normalized/);
});

test("provider apply failure resumes with stable idempotency key", async () => {
  const { plan, evidenceSource } = planned();
  const run = runtime(plan, { transport: new FakeTransport({ failApplyOnceAt: 5 }) });
  await assert.rejects(advance(run, plan, evidenceSource, 5), /injected provider failure/);
  assert.equal(run.store.load().status, "APPLY_FAILED");
  const savedKey = run.store.load().pendingOperation.idempotencyKey;
  await advance(run, plan, evidenceSource, 5);
  assert.equal(run.transport.calls.length, 2);
  assert.equal(run.transport.calls[0].idempotencyKey, savedKey);
  assert.equal(run.transport.calls[1].idempotencyKey, savedKey);
});

test("provider read failure is an APPLY_FAILED checkpoint and resumes", async () => {
  const { plan, evidenceSource } = planned();
  const run = runtime(plan, { transport: new FakeTransport({ failReadOnce: true }) });
  await assert.rejects(advance(run, plan, evidenceSource, 5), /injected read failure/);
  assert.equal(run.store.load().status, "APPLY_FAILED");
  await advance(run, plan, evidenceSource, 5);
  assert.equal(run.store.load().status, "READY");
});

test("failed observation resumes without re-applying traffic", async () => {
  const { plan, evidenceSource } = planned();
  const run = runtime(plan, { observer: new FakeObserver({ failOnceAt: 5 }) });
  await assert.rejects(advance(run, plan, evidenceSource, 5), /observation failure/);
  assert.equal(run.store.load().status, "OBSERVATION_FAILED");
  await advance(run, plan, evidenceSource, 5);
  assert.equal(run.transport.calls.length, 1);
  assert.equal(run.observer.calls.length, 2);
});

test("completed idempotent call re-reads provider and detects external drift", async () => {
  const { plan, evidenceSource } = planned();
  const run = runtime(plan);
  await advance(run, plan, evidenceSource, 5);
  run.transport.weight = 25;
  await assert.rejects(advance(run, plan, evidenceSource, 5), /requested complementary weights/);
  assert.ok(run.transport.reads >= 3);
});

test("success staircase and rollback produce traffic-only reverse evidence", async () => {
  const { plan, evidenceSource } = planned();
  const run = runtime(plan);
  for (const weight of [5, 25, 50, 100]) await advance(run, plan, evidenceSource, weight);
  assert.equal(run.store.load().status, "CUTOVER_COMPLETE");
  const result = await run.controller.rollback({
    plan,
    evidenceSource,
    executionToken: token(plan, "ROLLBACK_TRAFFIC", 0),
  });
  assert.equal(result.progress.status, "TRAFFIC_ROLLED_BACK");
  assert.notEqual(result.progress.status, "ROLLED_BACK");
  assert.deepEqual(result.progress.rollback.transitions.map(item => [item.fromWeight, item.toWeight]), [
    [100, 50], [50, 25], [25, 5], [5, 0],
  ]);
  assert.ok(result.progress.rollback.transitions.every(item => item.durationSeconds >= 900));
  assert.equal(result.progress.rollback.jobsHandoffRequired, true);
});

test("rollback observation failure resumes at the same reverse transition", async () => {
  const { plan, evidenceSource } = planned();
  const observer = new FakeObserver();
  const run = runtime(plan, { observer });
  for (const weight of [5, 25, 50]) await advance(run, plan, evidenceSource, weight);
  observer.failOnceAt = 25;
  await assert.rejects(run.controller.rollback({
    plan, evidenceSource, executionToken: token(plan, "ROLLBACK_TRAFFIC", 0),
  }), /observation failure/);
  assert.equal(run.store.load().status, "ROLLBACK_OBSERVATION_FAILED");
  const callsBefore = run.transport.calls.length;
  await run.controller.rollback({
    plan, evidenceSource, executionToken: token(plan, "ROLLBACK_TRAFFIC", 0),
  });
  assert.equal(run.store.load().status, "TRAFFIC_ROLLED_BACK");
  assert.equal(run.transport.calls.length, callsBefore + 2);
});

test("rollback provider failure resumes with the same idempotency key", async () => {
  const { plan, evidenceSource } = planned();
  const transport = new FakeTransport();
  const run = runtime(plan, { transport });
  for (const weight of [5, 25]) await advance(run, plan, evidenceSource, weight);
  transport.failApplyOnceAt = 5;
  const rollbackToken = token(plan, "ROLLBACK_TRAFFIC", 0);
  await assert.rejects(run.controller.rollback({ plan, evidenceSource, executionToken: rollbackToken }), /provider failure/);
  assert.equal(run.store.load().status, "ROLLBACK_APPLY_FAILED");
  const savedKey = run.store.load().pendingOperation.idempotencyKey;
  await run.controller.rollback({ plan, evidenceSource, executionToken: rollbackToken });
  const rollbackCalls = transport.calls.filter(call => call.idempotencyKey.includes(":rollback:"));
  assert.equal(rollbackCalls[0].idempotencyKey, savedKey);
  assert.equal(rollbackCalls[1].idempotencyKey, savedKey);
  assert.equal(run.store.load().status, "TRAFFIC_ROLLED_BACK");
});

test("adapters still require explicit injection and plans reject hash/step drift", () => {
  assert.throws(() => createClbAdapter(), /explicitly injected transport/);
  const skipped = fixture();
  skipped.request.steps = [5, 50, 25, 100].map(weight => ({ weight, minimumObservationSeconds: 900 }));
  assert.throws(() => buildCutoverPlan(skipped), /exactly 5\/25\/50\/100/);
  const drifted = fixture();
  drifted.actualHashes.cloudBundle = "9".repeat(64);
  assert.throws(() => buildCutoverPlan(drifted), /cloudBundle SHA-256 drift/);
});
