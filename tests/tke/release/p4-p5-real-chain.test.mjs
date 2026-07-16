import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const contractRoot = path.join(repoRoot, "deploy/tke/contracts");
const temporaryRoots = [];
const fixedNow = new Date("2026-07-16T09:00:00Z");
const releaseId = "release-gate2-real-chain";

const resolveWave2Module = (relative, environmentVariable) => {
  const integrated = path.join(repoRoot, relative);
  if (existsSync(integrated)) return integrated;
  const explicitlyInjected = process.env[environmentVariable];
  if (explicitlyInjected && existsSync(explicitlyInjected)) return path.resolve(explicitlyInjected);
  throw new Error(`real Wave 2 module is unavailable in this checkout: ${relative}`);
};

const [p4, p5] = await Promise.all([
  import(pathToFileURL(resolveWave2Module(
    "deploy/tke/orchestrator/orchestrator.mjs",
    "XLB_P4_ORCHESTRATOR_MODULE",
  ))),
  import(pathToFileURL(resolveWave2Module(
    "deploy/tke/cutover/cutover-controller.mjs",
    "XLB_P5_CUTOVER_MODULE",
  ))),
]);

afterEach(() => {
  while (temporaryRoots.length) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sha256File = file => sha256(readFileSync(file));
const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, jsonBytes(value));
};
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p4-p5-gate2-"));
  temporaryRoots.push(root);
  const releaseRoot = path.join(root, ".artifacts", "tke", "releases", releaseId);
  const environmentRoot = path.join(root, ".artifacts", "tke", "production");
  const ref = name => `.artifacts/tke/releases/${releaseId}/${name}`;
  const absolute = reference => path.join(root, reference.replaceAll("/", path.sep));
  const image = (name, letter) => ({
    repository: `ccr.ccs.tencentyun.com/xlb/${name}`,
    digest: `sha256:${letter.repeat(64)}`,
    sbomFile: ref(`sbom/${name}.cdx.json`),
    scanEvidenceFile: ref(`scans/${name}.json`),
  });
  const manifest = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    executionMode: "gated-release",
    sourceCommit: "a".repeat(40),
    createdAt: "2026-07-16T08:00:00Z",
    owners: { release: "release-owner", data: "data-owner", onCall: "oncall-owner", cost: "cost-owner" },
    changeWindow: { startsAt: "2026-07-18T01:00:00Z", endsAt: "2026-07-18T05:00:00Z", timezone: "Asia/Shanghai" },
    imageLockFile: ref("images.lock.json"),
    cloudBundleFile: ".artifacts/tke/production/cloud-bundle.json",
    evidenceFile: ref("evidence.json"),
    checkpointFile: ref("checkpoint.json"),
    trafficProvider: "clb",
  };
  const imageLock = {
    schemaVersion: 1,
    releaseId,
    sourceCommit: manifest.sourceCommit,
    createdAt: "2026-07-16T08:10:00Z",
    images: {
      backend: image("backend", "a"),
      customer: image("customer", "b"),
      worker: image("worker", "c"),
      admin: image("admin", "d"),
    },
  };
  const cloudBundle = {
    schemaVersion: 1,
    environment: "production",
    region: "ap-guangzhou",
    accountId: "100000000000",
    approvedKubeContext: "tke-production-reviewed-context",
    network: { vpcId: "vpc-gate2sample", subnetIds: ["subnet-gate2sample1"] },
    files: {
      terraformVarFile: ".artifacts/tke/production/production.tfvars",
      backendConfig: ".artifacts/tke/production/production.backend.hcl",
      valuesFile: ".artifacts/tke/production/values-production.yaml",
      imageLockFile: manifest.imageLockFile,
    },
    secretReferences: { runtimeSecretName: "xlb-production-runtime", tlsSecretName: "xlb-production-tls" },
    costReview: {
      currency: "CNY",
      monthlyMin: 1,
      monthlyMax: 2,
      sourceUrl: "https://cloud.tencent.com/product/calculator",
      reviewedAt: "2026-07-16",
      owner: "cost-owner",
    },
    bundleSha256: "e".repeat(64),
  };
  const execution = (name, minute) => ({
    runId: `${name}-gate2-release-run`,
    completedAt: `2026-07-16T08:${minute}:00Z`,
    result: "PASS",
    evidenceRef: ref(`evidence/${name}.json`),
  });
  const evidence = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    updatedAt: "2026-07-16T08:55:00Z",
    backup: {
      backupId: "backup-gate2-sample",
      createdAt: "2026-07-16T06:00:00Z",
      verifiedAt: "2026-07-16T07:00:00Z",
      restoreDrill: {
        performedAt: "2026-07-15T06:00:00Z",
        result: "PASS",
        evidenceRef: ref("evidence/restore.json"),
      },
    },
    jobsSingleActive: {
      lighthouseState: "STOPPED",
      tkeState: "ACTIVE",
      leaseOwner: `tke-jobs-${releaseId}`,
      fencingToken: 2,
      observedAt: "2026-07-16T08:50:00Z",
      evidenceRef: ref("evidence/jobs.json"),
    },
    migration: execution("migration", "40"),
    smoke: execution("smoke", "45"),
    trafficObservations: [],
  };
  const files = {
    manifest: path.join(releaseRoot, "release-manifest.json"),
    imageLock: path.join(releaseRoot, "images.lock.json"),
    cloudBundle: path.join(environmentRoot, "cloud-bundle.json"),
    evidence: path.join(releaseRoot, "evidence.json"),
    checkpoint: path.join(releaseRoot, "checkpoint.json"),
  };
  writeJson(files.manifest, manifest);
  writeJson(files.imageLock, imageLock);
  writeJson(files.cloudBundle, cloudBundle);
  writeJson(files.evidence, evidence);
  for (const [name, value] of Object.entries(imageLock.images)) {
    writeJson(absolute(value.sbomFile), { bomFormat: "CycloneDX", component: name });
    writeJson(absolute(value.scanEvidenceFile), { component: name, high: 0, critical: 0 });
  }
  const payloads = {
    [cloudBundle.files.terraformVarFile]: "environment = \"production\"\n",
    [cloudBundle.files.backendConfig]: "encrypt = true\n",
    [cloudBundle.files.valuesFile]: "global:\n  environment: production\n",
  };
  for (const [reference, content] of Object.entries(payloads)) {
    const file = absolute(reference);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  }
  const inventoryFiles = [...Object.keys(payloads), cloudBundle.files.imageLockFile]
    .sort()
    .map(reference => ({ file: reference, sha256: sha256File(absolute(reference)) }));
  const { bundleSha256: _ignored, ...cloudManifestCore } = cloudBundle;
  cloudBundle.bundleSha256 = sha256(JSON.stringify({
    releaseId,
    sourceCommit: manifest.sourceCommit,
    cloudBundle: cloudManifestCore,
    payloadFiles: inventoryFiles,
  }));
  writeJson(files.cloudBundle, cloudBundle);
  writeJson(path.join(environmentRoot, "bundle-files.json"), {
    schemaVersion: 1,
    releaseId,
    sourceCommit: manifest.sourceCommit,
    environment: "production",
    region: "ap-guangzhou",
    bundleSha256: cloudBundle.bundleSha256,
    files: inventoryFiles,
  });
  writeFileSync(path.join(environmentRoot, "bundle.sha256"), `${cloudBundle.bundleSha256}\n`, "utf8");
  for (const reference of [
    evidence.backup.restoreDrill.evidenceRef,
    evidence.jobsSingleActive.evidenceRef,
    evidence.migration.evidenceRef,
    evidence.smoke.evidenceRef,
  ]) writeJson(absolute(reference), { result: "PASS", reference });
  return {
    repoRoot: root,
    contractRoot,
    manifestFile: files.manifest,
    files,
    ref,
    absolute,
    clock: () => fixedNow,
  };
}

function providerReceipt(input, context, details = {}) {
  if (context.stage === "ARTIFACTS_READY") return { artifactsChanged: [] };
  const evidenceRef = input.ref(`evidence/p4-provider-${context.stage.toLowerCase().replaceAll("_", "-")}.json`);
  const proof = {
    operation: context.stage,
    idempotencyKey: context.idempotencyKey,
    leaseOwner: context.leaseOwner,
    fencingToken: context.fencingToken,
    result: "PASS",
    ...details,
  };
  writeJson(input.absolute(evidenceRef), proof);
  return {
    artifactsChanged: details.artifactsChanged ?? [],
    providerReceipt: {
      schemaVersion: 1,
      provider: "tencent-clb",
      mode: "REAL",
      operation: context.stage,
      idempotencyKey: context.idempotencyKey,
      completedAt: fixedNow.toISOString(),
      result: "PASS",
      evidenceRef,
      evidenceSha256: sha256File(input.absolute(evidenceRef)),
      leaseOwner: context.leaseOwner,
      fencingToken: context.fencingToken,
    },
  };
}

const authoritiesThroughJobs = {
  terraformPlan: true,
  terraformApply: true,
  cloudDeploy: true,
  dataMigration: true,
};

async function prepareJobsSwitched(input) {
  const result = await p4.runRelease({
    ...input,
    targetState: "JOBS_SWITCHED",
    authorities: authoritiesThroughJobs,
    executor: context => providerReceipt(input, context),
    now: fixedNow,
    clock: input.clock,
  });
  assert.equal(result.status, "TARGET_REACHED");
  assert.equal(result.checkpoint.currentState, "JOBS_SWITCHED");
  return result.checkpoint;
}

function buildPlan(input) {
  const releaseManifest = readJson(input.files.manifest);
  const cloudBundle = readJson(input.files.cloudBundle);
  const evidenceBundle = readJson(input.files.evidence);
  const checkpoint = readJson(input.files.checkpoint);
  const expectedHashes = {
    releaseManifest: sha256File(input.files.manifest),
    cloudBundle: sha256File(input.files.cloudBundle),
    evidenceBundle: sha256File(input.files.evidence),
    checkpoint: sha256File(input.files.checkpoint),
  };
  const request = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    trafficProvider: "clb",
    files: {
      releaseManifest: input.ref("release-manifest.json"),
      cloudBundle: ".artifacts/tke/production/cloud-bundle.json",
      evidenceBundle: input.ref("evidence.json"),
      checkpoint: input.ref("checkpoint.json"),
    },
    expectedHashes,
    steps: [5, 25, 50, 100].map(weight => ({ weight, minimumObservationSeconds: 900 })),
    rollbackTargetWeight: 0,
  };
  return p5.buildCutoverPlan({
    request,
    releaseManifest,
    cloudBundle,
    evidenceBundle,
    checkpoint,
    actualHashes: { ...expectedHashes },
  });
}

class FileTrafficTransport {
  constructor(input, initialWeight = 0) {
    this.input = input;
    this.weight = initialWeight;
    this.reads = [];
    this.applies = [];
  }

  proof(kind, weight, idempotencyKey) {
    const evidenceRef = this.input.ref(`evidence/p5-${kind}-${weight}.json`);
    writeJson(this.input.absolute(evidenceRef), { kind, weight, idempotencyKey, result: "PASS" });
    return { tkeWeight: weight, lighthouseWeight: 100 - weight, evidenceRef };
  }

  async readWeights() {
    this.reads.push(this.weight);
    return this.proof("read", this.weight);
  }

  async applyWeights({ toWeight, idempotencyKey }) {
    this.applies.push({ fromWeight: this.weight, toWeight, idempotencyKey });
    this.weight = toWeight;
    return this.proof("apply", toWeight, idempotencyKey);
  }
}

class FileTrafficObserver {
  constructor(input, { failOnce = false } = {}) {
    this.input = input;
    this.failOnce = failOnce;
    this.failed = false;
    this.calls = [];
  }

  async observe({ direction, weight, minimumObservationSeconds }) {
    this.calls.push({ direction, weight, minimumObservationSeconds });
    if (this.failOnce && !this.failed) {
      this.failed = true;
      const error = new Error("injected P5 observation timeout");
      error.retryable = true;
      throw error;
    }
    const evidenceRef = this.input.ref(`evidence/p5-observe-${direction}-${weight}.json`);
    writeJson(this.input.absolute(evidenceRef), {
      direction,
      weight,
      durationSeconds: minimumObservationSeconds,
      result: "PASS",
    });
    return {
      weight,
      result: "PASS",
      durationSeconds: minimumObservationSeconds,
      observedAt: fixedNow.toISOString(),
      evidenceRef,
    };
  }
}

function p5Runtime(input, plan, { initialWeight = plan.initialWeight, failOnce = false } = {}) {
  const transport = new FileTrafficTransport(input, initialWeight);
  const observer = new FileTrafficObserver(input, { failOnce });
  const store = p5.createMemoryProgressStore();
  const controller = new p5.CutoverController({
    adapter: p5.createClbAdapter(transport),
    observer,
    store,
    now: input.clock,
  });
  return { controller, transport, observer, store };
}

function p4TrafficExecutor(input, plan, runtime, { rollback = false } = {}) {
  const contexts = [];
  const executor = async context => {
    contexts.push(structuredClone(context));
    const evidenceBytes = readFileSync(input.files.evidence);
    assert.equal(sha256(evidenceBytes), plan.artifactHashes.evidenceBundle);
    const operation = rollback
      ? await runtime.controller.rollback({
        plan,
        evidenceSource: { bytes: evidenceBytes },
        executionToken: { action: "ROLLBACK_TRAFFIC", planSha256: plan.planSha256, releaseId, targetWeight: 0 },
      })
      : await runtime.controller.advance({
        plan,
        evidenceSource: { bytes: evidenceBytes },
        targetWeight: 5,
        executionToken: { action: "ADVANCE", planSha256: plan.planSha256, releaseId, targetWeight: 5 },
      });
    const evidence = JSON.parse(evidenceBytes.toString("utf8"));
    if (rollback) {
      const transition = operation.progress.rollback.transitions.at(-1);
      evidence.rollback = {
        runId: `rollback-${releaseId}`,
        completedAt: fixedNow.toISOString(),
        result: "PASS",
        evidenceRef: transition?.observationEvidenceRef ?? input.ref("evidence/p5-rollback-zero.json"),
      };
      if (!transition) writeJson(input.absolute(evidence.rollback.evidenceRef), { result: "PASS" });
    } else {
      const observation = operation.progress.observations.find(item => item.weight === 5);
      evidence.trafficObservations = [{
        weight: 5,
        observedAt: observation.observedAt,
        result: "PASS",
        evidenceRef: observation.observationEvidenceRef,
      }];
    }
    evidence.updatedAt = fixedNow.toISOString();
    writeJson(input.files.evidence, evidence);
    return providerReceipt(input, context, {
      artifactsChanged: ["evidenceBundle"],
      p5PlanSha256: plan.planSha256,
      p5ProgressRevision: operation.progress.revision,
      p5Idempotent: operation.idempotent,
    });
  };
  return { executor, contexts };
}

test("real P4 TRAFFIC_5 executor runs real P5, updates evidence hash, and commits a REAL receipt", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  const plan = buildPlan(input);
  const runtime = p5Runtime(input, plan);
  const wired = p4TrafficExecutor(input, plan, runtime);
  const previousEvidenceHash = sha256File(input.files.evidence);

  const result = await p4.advanceRelease({
    ...input,
    targetState: "TRAFFIC_5",
    authorities: { trafficCutover: "TRAFFIC_5" },
    executor: wired.executor,
    now: fixedNow,
    clock: input.clock,
  });

  assert.equal(result.status, "TRAFFIC_5");
  assert.equal(result.checkpoint.currentState, "TRAFFIC_5");
  assert.notEqual(result.checkpoint.artifactHashes.evidenceBundle, previousEvidenceHash);
  assert.equal(result.checkpoint.artifactHashes.evidenceBundle, sha256File(input.files.evidence));
  assert.deepEqual(readJson(input.files.evidence).trafficObservations.map(item => item.weight), [5]);
  assert.deepEqual(runtime.transport.reads, [0, 5]);
  assert.equal(runtime.transport.applies.length, 1);
  assert.match(runtime.transport.applies[0].idempotencyKey, /:forward:0-5$/);
  assert.equal(runtime.observer.calls[0].minimumObservationSeconds, 900);
  const receipt = readJson(path.join(path.dirname(input.files.manifest), "receipts", "traffic-5.json"));
  assert.equal(receipt.mode, "REAL");
  assert.equal(receipt.idempotencyKey, wired.contexts[0].idempotencyKey);
  assert.equal(receipt.fencingToken, wired.contexts[0].fencingToken);
  assert.ok(receipt.fencingToken > 0);
});

test("P5 failure becomes P4 FAILED and resume keeps both P4 and P5 idempotency keys", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  const plan = buildPlan(input);
  const runtime = p5Runtime(input, plan, { failOnce: true });
  const wired = p4TrafficExecutor(input, plan, runtime);
  const authorities = { trafficCutover: "TRAFFIC_5" };

  const failed = await p4.advanceRelease({
    ...input,
    targetState: "TRAFFIC_5",
    authorities,
    executor: wired.executor,
    now: fixedNow,
    clock: input.clock,
  });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.checkpoint.failure.resumeState, "TRAFFIC_5");
  assert.equal(failed.checkpoint.failure.retryable, true);
  assert.equal(runtime.transport.applies.length, 1);
  const p5PendingKey = runtime.store.load().pendingOperation.idempotencyKey;
  assert.equal(p5PendingKey, runtime.transport.applies[0].idempotencyKey);

  const resumed = await p4.resumeRelease({
    ...input,
    authorities,
    executor: wired.executor,
    now: fixedNow,
    clock: input.clock,
  });
  assert.equal(resumed.status, "TRAFFIC_5");
  assert.equal(runtime.transport.applies.length, 1);
  assert.equal(wired.contexts[0].idempotencyKey, wired.contexts[1].idempotencyKey);
  assert.equal(runtime.observer.calls.length, 2);
  assert.equal(runtime.store.load().completedWeights.at(-1), 5);
});

test("external traffic drift read fails P5 and leaves P4 FAILED without applying weights", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  const plan = buildPlan(input);
  const runtime = p5Runtime(input, plan, { initialWeight: 25 });
  const wired = p4TrafficExecutor(input, plan, runtime);

  const result = await p4.advanceRelease({
    ...input,
    targetState: "TRAFFIC_5",
    authorities: { trafficCutover: "TRAFFIC_5" },
    executor: wired.executor,
    now: fixedNow,
    clock: input.clock,
  });

  assert.equal(result.status, "FAILED");
  assert.match(result.checkpoint.failure.message, /traffic provider weight drift/);
  assert.equal(runtime.transport.applies.length, 0);
  assert.deepEqual(readJson(input.files.evidence).trafficObservations, []);
});

test("real P5 traffic rollback drives P4 rollback latch and retry recovery", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  const forwardPlan = buildPlan(input);
  const forwardRuntime = p5Runtime(input, forwardPlan);
  const forward = p4TrafficExecutor(input, forwardPlan, forwardRuntime);
  await p4.advanceRelease({
    ...input,
    targetState: "TRAFFIC_5",
    authorities: { trafficCutover: "TRAFFIC_5" },
    executor: forward.executor,
    now: fixedNow,
    clock: input.clock,
  });

  const rollbackPlan = buildPlan(input);
  const rollbackRuntime = p5Runtime(input, rollbackPlan, { initialWeight: 5, failOnce: true });
  const rollback = p4TrafficExecutor(input, rollbackPlan, rollbackRuntime, { rollback: true });
  const first = await p4.rollbackRelease({
    ...input,
    executor: rollback.executor,
    now: fixedNow,
    clock: input.clock,
  });
  assert.equal(first.status, "ROLLBACK_FAILED");
  const rollbackPendingKey = rollbackRuntime.store.load().pendingOperation.idempotencyKey;
  assert.equal(rollbackPendingKey, rollbackRuntime.transport.applies[0].idempotencyKey);
  const latchFile = `${input.files.checkpoint}.rollback-failed.json`;
  assert.equal(readJson(latchFile).status, "ROLLBACK_FAILED");
  await assert.rejects(
    p4.advanceRelease({
      ...input,
      targetState: "TRAFFIC_25",
      authorities: { trafficCutover: "TRAFFIC_25" },
      executor: forward.executor,
      now: fixedNow,
      clock: input.clock,
    }),
    /rollback-failed latch blocks forward and resume/,
  );

  const recovered = await p4.rollbackRelease({
    ...input,
    executor: rollback.executor,
    now: fixedNow,
    clock: input.clock,
  });
  assert.equal(recovered.status, "ROLLED_BACK");
  assert.equal(existsSync(latchFile), false);
  assert.equal(rollbackRuntime.transport.applies.length, 1);
  assert.equal(rollbackRuntime.observer.calls.length, 2);
  assert.equal(readJson(input.files.evidence).rollback.result, "PASS");
  assert.equal(readJson(input.files.checkpoint).currentState, "ROLLED_BACK");
});
