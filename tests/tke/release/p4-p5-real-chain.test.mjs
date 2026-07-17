import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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

const p4ModuleFile = resolveWave2Module(
  "deploy/tke/orchestrator/orchestrator.mjs",
  "XLB_P4_ORCHESTRATOR_MODULE",
);
const p5ModuleFile = resolveWave2Module(
  "deploy/tke/cutover/cutover-controller.mjs",
  "XLB_P5_CUTOVER_MODULE",
);
const progressStoreModuleFile = resolveWave2Module(
  "deploy/tke/cutover/file-progress-store.mjs",
  "XLB_P5_PROGRESS_STORE_MODULE",
);
const runtimeModuleFile = resolveWave2Module(
  "deploy/tke/cutover/runtime.mjs",
  "XLB_P5_RUNTIME_MODULE",
);
const [p4, p5, progressStoreModule, runtimeModule] = await Promise.all([
  import(pathToFileURL(p4ModuleFile)),
  import(pathToFileURL(p5ModuleFile)),
  import(pathToFileURL(progressStoreModuleFile)),
  import(pathToFileURL(runtimeModuleFile)),
]);
let restartSequence = 0;
const reloadP4 = () => import(`${pathToFileURL(p4ModuleFile).href}?restart=${restartSequence += 1}`);
const processWorkerFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "p4-p5-process-worker.mjs");

function runWorker(operation, root, argument, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [processWorkerFile, operation, root, String(argument)], {
      env: {
        ...process.env,
        XLB_P4_ORCHESTRATOR_MODULE: p4ModuleFile,
        XLB_P5_CUTOVER_MODULE: p5ModuleFile,
        XLB_P5_PROGRESS_STORE_MODULE: progressStoreModuleFile,
        XLB_P5_RUNTIME_MODULE: runtimeModuleFile,
        ...extraEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      const result = { code, stderr, stdout, pid: child.pid };
      if (code !== 0) return resolve(result);
      try { result.payload = JSON.parse(stdout.trim()); } catch (error) { return reject(error); }
      resolve(result);
    });
  });
}

function startWorker(operation, root, argument = "", extraEnvironment = {}) {
  const child = spawn(process.execPath, [processWorkerFile, operation, root, String(argument)], {
    env: {
      ...process.env,
      XLB_P4_ORCHESTRATOR_MODULE: p4ModuleFile,
      XLB_P5_CUTOVER_MODULE: p5ModuleFile,
      XLB_P5_PROGRESS_STORE_MODULE: progressStoreModuleFile,
      XLB_P5_RUNTIME_MODULE: runtimeModuleFile,
      ...extraEnvironment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const firstLine = new Promise((resolve, reject) => {
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      pending += chunk;
      const newline = pending.indexOf("\n");
      if (newline >= 0) {
        try { resolve(JSON.parse(pending.slice(0, newline))); } catch (error) { reject(error); }
      }
    });
    child.once("error", reject);
  });
  const exited = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", reject);
  });
  return { child, firstLine, exited };
}

function processStore(root, overrides = {}) {
  return progressStoreModule.createFileProgressStore({
    artifactRoot: path.resolve(root),
    releaseId,
    planSha256: "c".repeat(64),
    lockTimeoutMs: 100,
    retryDelayMs: 5,
    ...overrides,
  });
}

const processStorePlanSha256 = "c".repeat(64);

function recoveryRequest({
  targetNonce,
  recoveryNonce,
  minimumAgeMs = 900_000,
}) {
  return {
    expectedNonce: targetNonce,
    recoveryNonce,
    minimumAgeMs,
    confirmation: `RECOVER_ABANDONED_LOCK:${releaseId}:${processStorePlanSha256}:${targetNonce}:${recoveryNonce}:${minimumAgeMs}:RECOVER`,
  };
}

function initialStoreProgress(overrides = {}) {
  return {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    trafficProvider: "clb",
    planSha256: "c".repeat(64),
    artifactHashes: {
      releaseManifest: "a".repeat(64),
      cloudBundle: "b".repeat(64),
      evidenceBundle: "d".repeat(64),
      checkpoint: "e".repeat(64),
    },
    initialWeight: 0,
    status: "READY",
    currentWeight: 0,
    completedWeights: [],
    observations: [],
    rollback: { status: "NOT_STARTED", transitions: [] },
    revision: 1,
    updatedAt: fixedNow.toISOString(),
    ...overrides,
  };
}

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
  const runtime = runtimeModule.createCutoverRuntime({
    plan,
    artifactRoot: input.absolute(".artifacts/tke"),
    transport,
    observer,
  });
  return { ...runtime, transport, observer };
}

function p4TrafficExecutor(input, plan, runtime, { rollback = false, targetWeight = 5 } = {}) {
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
        targetWeight,
        executionToken: { action: "ADVANCE", planSha256: plan.planSha256, releaseId, targetWeight },
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
      const observation = operation.progress.observations.find(item => item.weight === targetWeight);
      evidence.trafficObservations = [
        ...(evidence.trafficObservations ?? []).filter(item => item.weight < targetWeight),
        {
          weight: targetWeight,
          observedAt: observation.observedAt,
          result: "PASS",
          evidenceRef: observation.observationEvidenceRef,
        },
      ];
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

class PersistentTrafficTransport {
  constructor(input, file, initialWeight) {
    this.input = input;
    this.file = file;
    if (!existsSync(file)) writeJson(file, { weight: initialWeight, applies: [], completed: {} });
  }

  state() { return readJson(this.file); }

  proof(kind, weight, idempotencyKey) {
    const evidenceRef = this.input.ref(`evidence/p5-persistent-${kind}-${weight}.json`);
    writeJson(this.input.absolute(evidenceRef), { kind, weight, idempotencyKey, result: "PASS" });
    return { tkeWeight: weight, lighthouseWeight: 100 - weight, evidenceRef };
  }

  async readWeights() {
    const state = this.state();
    return this.proof("read", state.weight);
  }

  async applyWeights({ toWeight, idempotencyKey }) {
    const state = this.state();
    if (state.completed[idempotencyKey] !== undefined) {
      return this.proof("apply", state.completed[idempotencyKey], idempotencyKey);
    }
    state.applies.push({ fromWeight: state.weight, toWeight, idempotencyKey });
    state.weight = toWeight;
    state.completed[idempotencyKey] = toWeight;
    writeJson(this.file, state);
    return this.proof("apply", toWeight, idempotencyKey);
  }
}

class PersistentTrafficObserver {
  constructor(input, file, { failOnceAt, failDirection = "forward" } = {}) {
    this.input = input;
    this.file = file;
    this.failOnceAt = failOnceAt;
    this.failDirection = failDirection;
    if (!existsSync(file)) writeJson(file, { calls: [], failedKeys: [] });
  }

  state() { return readJson(this.file); }

  async observe({ direction, weight, minimumObservationSeconds }) {
    const state = this.state();
    const key = `${direction}-${weight}`;
    state.calls.push({ direction, weight, minimumObservationSeconds });
    if (direction === this.failDirection && weight === this.failOnceAt && !state.failedKeys.includes(key)) {
      state.failedKeys.push(key);
      writeJson(this.file, state);
      const error = new Error(`injected persistent ${key} timeout`);
      error.retryable = true;
      throw error;
    }
    writeJson(this.file, state);
    const evidenceRef = this.input.ref(`evidence/p5-persistent-observe-${direction}-${weight}.json`);
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

function persistentRuntime(input, plan, {
  transportFile,
  observerFile,
  failOnceAt,
  initialWeight = plan.initialWeight,
} = {}) {
  const transport = new PersistentTrafficTransport(input, transportFile, initialWeight);
  const observer = new PersistentTrafficObserver(input, observerFile, { failOnceAt });
  const runtime = runtimeModule.createCutoverRuntime({
    plan,
    artifactRoot: input.absolute(".artifacts/tke"),
    transport,
    observer,
  });
  return { ...runtime, transport, observer };
}

function persistentFiles(input, plan, name = plan.planSha256.slice(0, 12)) {
  const root = input.absolute(input.ref("progress"));
  return {
    transportFile: path.join(root, "provider-state.json"),
    observerFile: path.join(root, "observer-state.json"),
  };
}

async function advancePersistentWeight(input, weight, {
  p4Module = p4,
  plan = buildPlan(input),
  files = persistentFiles(input, plan),
  failOnceAt,
} = {}) {
  const runtime = persistentRuntime(input, plan, { ...files, failOnceAt });
  const wired = p4TrafficExecutor(input, plan, runtime, { targetWeight: weight });
  const result = await p4Module.advanceRelease({
    ...input,
    targetState: `TRAFFIC_${weight}`,
    authorities: { trafficCutover: `TRAFFIC_${weight}` },
    executor: wired.executor,
    now: fixedNow,
    clock: input.clock,
  });
  return { result, runtime, wired, plan, files };
}

function assertCommittedTrafficStep(input, step, weight) {
  assert.equal(step.result.status, `TRAFFIC_${weight}`);
  assert.equal(step.result.checkpoint.currentState, `TRAFFIC_${weight}`);
  assert.equal(step.result.checkpoint.artifactHashes.evidenceBundle, sha256File(input.files.evidence));
  assert.deepEqual(readJson(input.files.evidence).trafficObservations.map(item => item.weight),
    [5, 25, 50, 100].filter(candidate => candidate <= weight));
  assert.equal(step.runtime.observer.state().calls.at(-1).minimumObservationSeconds, 900);
  const receipt = readJson(path.join(path.dirname(input.files.manifest), "receipts", `traffic-${weight}.json`));
  assert.equal(receipt.mode, "REAL");
  assert.equal(receipt.idempotencyKey, step.wired.contexts.at(-1).idempotencyKey);
  assert.equal(receipt.fencingToken, step.wired.contexts.at(-1).fencingToken);
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

test("real P4 and P5 complete 5/25/50/100 with exact gates and reject skips", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);

  const five = await advancePersistentWeight(input, 5);
  assertCommittedTrafficStep(input, five, 5);

  await assert.rejects(
    p4.advanceRelease({
      ...input,
      targetState: "TRAFFIC_50",
      authorities: { trafficCutover: "TRAFFIC_50" },
      executor: async () => { throw new Error("skip must fail before executor"); },
      now: fixedNow,
      clock: input.clock,
    }),
    /illegal state transition TRAFFIC_5 -> TRAFFIC_50/,
  );
  const skipPlan = buildPlan(input);
  const skipFiles = persistentFiles(input, skipPlan, "skip-probe");
  const skipRuntime = persistentRuntime(input, skipPlan, skipFiles);
  await assert.rejects(
    skipRuntime.controller.advance({
      plan: skipPlan,
      evidenceSource: { bytes: readFileSync(input.files.evidence) },
      targetWeight: 50,
      executionToken: { action: "ADVANCE", planSha256: skipPlan.planSha256, releaseId, targetWeight: 50 },
    }),
    /next traffic weight must be 25/,
  );

  for (const weight of [25, 50, 100]) {
    const step = await advancePersistentWeight(input, weight);
    assertCommittedTrafficStep(input, step, weight);
  }
  const providerState = readJson(five.files.transportFile);
  assert.deepEqual(providerState.applies.map(item => item.toWeight), [5, 25, 50, 100]);
  assert.equal(readJson(input.files.checkpoint).currentState, "TRAFFIC_100");
});

test("process restart after 25 reloads disk checkpoint evidence and CAS progress before 50/100", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  const five = await advancePersistentWeight(input, 5);
  assertCommittedTrafficStep(input, five, 5);
  const twentyFive = await advancePersistentWeight(input, 25);
  assertCommittedTrafficStep(input, twentyFive, 25);

  const plan50 = buildPlan(input);
  const files50 = persistentFiles(input, plan50);
  const seededStore = progressStoreModule.createFileProgressStore({
    artifactRoot: input.absolute(".artifacts/tke"),
    releaseId,
    planSha256: plan50.planSha256,
  });
  assert.equal(seededStore.compareAndSwap(0, p5.createInitialProgress(plan50, fixedNow)), true);
  assert.deepEqual(seededStore.load().completedWeights, [5, 25]);

  const restartedP4For50 = await reloadP4();
  const fifty = await advancePersistentWeight(input, 50, {
    p4Module: restartedP4For50,
    plan: plan50,
    files: files50,
  });
  assertCommittedTrafficStep(input, fifty, 50);
  assert.ok(fifty.runtime.store.load().revision > 1);

  const restartedP4For100 = await reloadP4();
  const hundred = await advancePersistentWeight(input, 100, { p4Module: restartedP4For100 });
  assertCommittedTrafficStep(input, hundred, 100);
  const providerState = readJson(five.files.transportFile);
  assert.deepEqual(providerState.applies.map(item => item.toWeight), [5, 25, 50, 100]);
  assert.equal(new Set(providerState.applies.map(item => item.idempotencyKey)).size, 4);
});

test("50 failure resumes across instances then 100 rollback restores the full reverse prefix", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  const five = await advancePersistentWeight(input, 5);
  assertCommittedTrafficStep(input, five, 5);
  const twentyFive = await advancePersistentWeight(input, 25);
  assertCommittedTrafficStep(input, twentyFive, 25);

  const plan50 = buildPlan(input);
  const files50 = persistentFiles(input, plan50);
  const failingRuntime = persistentRuntime(input, plan50, { ...files50, failOnceAt: 50 });
  const failingWired = p4TrafficExecutor(input, plan50, failingRuntime, { targetWeight: 50 });
  const failed = await p4.advanceRelease({
    ...input,
    targetState: "TRAFFIC_50",
    authorities: { trafficCutover: "TRAFFIC_50" },
    executor: failingWired.executor,
    now: fixedNow,
    clock: input.clock,
  });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.checkpoint.failure.resumeState, "TRAFFIC_50");
  assert.equal(failingRuntime.store.load().status, "OBSERVATION_FAILED");

  const restartedP4 = await reloadP4();
  const resumedRuntime = persistentRuntime(input, plan50, { ...files50, failOnceAt: 50 });
  const resumedWired = p4TrafficExecutor(input, plan50, resumedRuntime, { targetWeight: 50 });
  const resumed = await restartedP4.resumeRelease({
    ...input,
    authorities: { trafficCutover: "TRAFFIC_50" },
    executor: resumedWired.executor,
    now: fixedNow,
    clock: input.clock,
  });
  const fifty = { result: resumed, runtime: resumedRuntime, wired: resumedWired, plan: plan50, files: files50 };
  assertCommittedTrafficStep(input, fifty, 50);
  assert.equal(failingWired.contexts[0].idempotencyKey, resumedWired.contexts[0].idempotencyKey);

  const hundred = await advancePersistentWeight(input, 100, { p4Module: await reloadP4() });
  assertCommittedTrafficStep(input, hundred, 100);
  const forwardState = readJson(five.files.transportFile);
  assert.deepEqual(forwardState.applies.map(item => item.toWeight), [5, 25, 50, 100]);
  assert.equal(forwardState.applies.filter(item => item.toWeight === 50).length, 1);

  const rollbackPlan = buildPlan(input);
  const rollbackFiles = persistentFiles(input, rollbackPlan, `rollback-${rollbackPlan.planSha256.slice(0, 12)}`);
  const rollbackRuntime = persistentRuntime(input, rollbackPlan, rollbackFiles);
  const rollbackWired = p4TrafficExecutor(input, rollbackPlan, rollbackRuntime, { rollback: true });
  const rolledBack = await (await reloadP4()).rollbackRelease({
    ...input,
    executor: rollbackWired.executor,
    now: fixedNow,
    clock: input.clock,
  });

  assert.equal(rolledBack.status, "ROLLED_BACK");
  assert.deepEqual(rollbackRuntime.store.load().rollback.transitions.map(item => [item.fromWeight, item.toWeight]), [
    [100, 50],
    [50, 25],
    [25, 5],
    [5, 0],
  ]);
  const finalProviderState = readJson(five.files.transportFile);
  assert.deepEqual(finalProviderState.applies.map(item => item.toWeight), [5, 25, 50, 100, 50, 25, 5, 0]);
  assert.equal(readJson(input.files.evidence).rollback.result, "PASS");
  assert.equal(readJson(input.files.checkpoint).currentState, "ROLLED_BACK");
});

test("independent child processes persist 25/50/100 and resume a failed 50 observation", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);

  const five = await runWorker("advance", input.repoRoot, 5);
  assert.equal(five.code, 0, five.stderr);
  assert.equal(five.payload.checkpointState, "TRAFFIC_5");

  const twentyFive = await runWorker("advance", input.repoRoot, 25);
  assert.equal(twentyFive.code, 0, twentyFive.stderr);
  assert.equal(twentyFive.payload.checkpointState, "TRAFFIC_25");

  const failedFifty = await runWorker("fail", input.repoRoot, 50);
  assert.equal(failedFifty.code, 0, failedFifty.stderr);
  assert.equal(failedFifty.payload.status, "FAILED");
  assert.equal(failedFifty.payload.failure.resumeState, "TRAFFIC_50");
  assert.equal(failedFifty.payload.progress.status, "OBSERVATION_FAILED");

  const resumedFifty = await runWorker("resume", input.repoRoot, 50);
  assert.equal(resumedFifty.code, 0, resumedFifty.stderr);
  assert.equal(resumedFifty.payload.checkpointState, "TRAFFIC_50");
  assert.equal(resumedFifty.payload.progress.status, "READY");

  const hundred = await runWorker("advance", input.repoRoot, 100);
  assert.equal(hundred.code, 0, hundred.stderr);
  assert.equal(hundred.payload.checkpointState, "TRAFFIC_100");
  assert.equal(hundred.payload.progress.status, "CUTOVER_COMPLETE");

  assert.equal(new Set([five.pid, twentyFive.pid, failedFifty.pid, resumedFifty.pid, hundred.pid]).size, 5);
  assert.deepEqual(hundred.payload.provider.applies.map(item => item.toWeight), [5, 25, 50, 100]);
  assert.equal(hundred.payload.provider.applies.filter(item => item.toWeight === 50).length, 1);
  assert.ok(hundred.payload.observer.calls.every(item => item.minimumObservationSeconds === 900));
  assert.equal(failedFifty.payload.contexts[0].idempotencyKey, resumedFifty.payload.contexts[0].idempotencyKey);
  assert.ok(resumedFifty.payload.contexts[0].fencingToken > failedFifty.payload.contexts[0].fencingToken);
  assert.equal(readJson(input.files.checkpoint).artifactHashes.evidenceBundle, sha256File(input.files.evidence));
  const receipt = readJson(path.join(path.dirname(input.files.manifest), "receipts", "traffic-100.json"));
  assert.equal(receipt.mode, "REAL");
  assert.equal(receipt.fencingToken, hundred.payload.contexts[0].fencingToken);

  const rolledBack = await runWorker("rollback", input.repoRoot, 0);
  assert.equal(rolledBack.code, 0, rolledBack.stderr);
  assert.equal(rolledBack.payload.status, "ROLLED_BACK");
  assert.equal(rolledBack.payload.checkpointState, "ROLLED_BACK");
  assert.deepEqual(rolledBack.payload.progress.rollback.transitions.map(item => [item.fromWeight, item.toWeight]), [
    [100, 50],
    [50, 25],
    [25, 5],
    [5, 0],
  ]);
  assert.deepEqual(rolledBack.payload.provider.applies.map(item => item.toWeight), [5, 25, 50, 100, 50, 25, 5, 0]);
  assert.notEqual(rolledBack.pid, hundred.pid);
});

test("child crashes on both P5/P4 commit boundaries recover without replaying provider apply", async () => {
  const input = fixture();
  await prepareJobsSwitched(input);
  for (const weight of [5, 25]) {
    const step = await runWorker("advance", input.repoRoot, weight);
    assert.equal(step.code, 0, step.stderr);
  }

  const providerCrash = await runWorker("crash-after-provider-apply", input.repoRoot, 50);
  assert.equal(providerCrash.code, 91, providerCrash.stderr);
  assert.equal(readJson(input.files.checkpoint).currentState, "TRAFFIC_25");
  let provider = readJson(input.absolute(input.ref("progress/process-provider.json")));
  assert.deepEqual(provider.applies.map(item => item.toWeight), [5, 25, 50]);
  let plan50 = readJson(input.absolute(input.ref("process-plan-50.json")));
  let progress = progressStoreModule.createFileProgressStore({
    artifactRoot: input.absolute(".artifacts/tke"), releaseId, planSha256: plan50.planSha256,
  }).load();
  assert.equal(progress.currentWeight, 25);
  assert.equal(progress.pendingOperation.phase, "APPLY");
  assert.equal(progress.pendingOperation.toWeight, 50);
  await new Promise(resolve => setTimeout(resolve, 1_050));

  const recoveredFifty = await runWorker("advance", input.repoRoot, 50);
  assert.equal(recoveredFifty.code, 0, recoveredFifty.stderr);
  assert.equal(recoveredFifty.payload.checkpointState, "TRAFFIC_50");
  provider = recoveredFifty.payload.provider;
  assert.equal(provider.applies.filter(item => item.toWeight === 50).length, 1);
  plan50 = readJson(input.absolute(input.ref("process-plan-50.json")));
  assert.equal(provider.applies.find(item => item.toWeight === 50).idempotencyKey,
    `${releaseId}:${plan50.planSha256.slice(0, 12)}:forward:25-50`);

  const progressCrash = await runWorker("crash-after-progress-commit", input.repoRoot, 100);
  assert.equal(progressCrash.code, 92, progressCrash.stderr);
  assert.equal(readJson(input.files.checkpoint).currentState, "TRAFFIC_50");
  provider = readJson(input.absolute(input.ref("progress/process-provider.json")));
  assert.deepEqual(provider.applies.map(item => item.toWeight), [5, 25, 50, 100]);
  const plan100 = readJson(input.absolute(input.ref("process-plan-100.json")));
  progress = progressStoreModule.createFileProgressStore({
    artifactRoot: input.absolute(".artifacts/tke"), releaseId, planSha256: plan100.planSha256,
  }).load();
  assert.equal(progress.currentWeight, 100);
  assert.equal(progress.status, "CUTOVER_COMPLETE");
  assert.equal(progress.pendingOperation, undefined);
  await new Promise(resolve => setTimeout(resolve, 1_050));

  const recoveredHundred = await runWorker("advance", input.repoRoot, 100);
  assert.equal(recoveredHundred.code, 0, recoveredHundred.stderr);
  assert.equal(recoveredHundred.payload.checkpointState, "TRAFFIC_100");
  assert.equal(recoveredHundred.payload.provider.applies.filter(item => item.toWeight === 100).length, 1);
  assert.equal(recoveredHundred.payload.provider.applies.find(item => item.toWeight === 100).idempotencyKey,
    `${releaseId}:${plan100.planSha256.slice(0, 12)}:forward:50-100`);
});

test("production file store has exactly one child-process CAS winner", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-store-race-"));
  temporaryRoots.push(root);
  const outcomes = await Promise.all([
    runWorker("store-cas", root, "contender-a"),
    runWorker("store-cas", root, "contender-b"),
  ]);
  assert.ok(outcomes.every(result => result.code === 0), outcomes.map(result => result.stderr).join("\n"));
  assert.deepEqual(outcomes.map(result => result.payload.won).sort(), [false, true]);
  assert.equal(new Set(outcomes.map(result => result.pid)).size, 2);
  const persisted = processStore(root).load();
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.status, "READY");
});

test("production file store recovers only a confirmed dead child lock", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-store-lock-"));
  temporaryRoots.push(root);
  const held = startWorker("store-aged-hold", root);
  const owner = await held.firstLine;
  const minimumAgeMs = 900_000;
  const store = processStore(root);
  const request = recoveryRequest({
    targetNonce: owner.nonce,
    recoveryNonce: "1".repeat(32),
    minimumAgeMs,
  });

  assert.throws(
    () => store.recoverAbandonedLock({
      expectedNonce: request.expectedNonce,
      recoveryNonce: request.recoveryNonce,
      minimumAgeMs,
      confirmation: request.confirmation,
    }),
    /still alive; recovery denied/,
  );
  assert.throws(
    () => store.recoverAbandonedLock({
      expectedNonce: request.expectedNonce,
      recoveryNonce: request.recoveryNonce,
      minimumAgeMs,
      confirmation: `${request.confirmation}-wrong`,
    }),
    /not exactly bound/,
  );

  held.child.kill("SIGKILL");
  await held.exited;
  const recovered = store.recoverAbandonedLock(request);
  assert.equal(recovered.recoveredNonce, owner.nonce);
  assert.match(recovered.quarantined, /quarantine/);
  const cas = await runWorker("store-cas", root, "after-dead-owner");
  assert.equal(cas.code, 0, cas.stderr);
  assert.equal(cas.payload.won, true);
});

test("two child recoverers produce one winner and an exact replay cannot isolate a new owner", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-recover-race-"));
  temporaryRoots.push(root);
  const held = startWorker("store-aged-hold", root);
  const owner = await held.firstLine;
  held.child.kill("SIGKILL");
  await held.exited;

  const minimumAgeMs = 900_000;
  const recovery = recoveryRequest({
    targetNonce: owner.nonce,
    recoveryNonce: "2".repeat(32),
    minimumAgeMs,
  });
  const outcomes = await Promise.all([
    runWorker("store-recover", root, JSON.stringify(recovery)),
    runWorker("store-recover", root, JSON.stringify(recovery)),
  ]);
  assert.equal(outcomes.filter(result => result.code === 0).length, 1, outcomes.map(result => result.stderr).join("\n"));
  assert.equal(outcomes.filter(result => result.code !== 0).length, 1);

  const newOwner = startWorker("store-hold", root);
  try {
    const newIdentity = await newOwner.firstLine;
    assert.notEqual(newIdentity.nonce, owner.nonce);
    const replayed = processStore(root).recoverAbandonedLock(recovery);
    assert.equal(replayed.recoveredNonce, owner.nonce);
    assert.equal(newOwner.child.exitCode, null);
  } finally {
    if (newOwner.child.exitCode === null) newOwner.child.kill("SIGKILL");
    await newOwner.exited;
  }
});

test("a recovered stale owner is fenced before it can write after a new owner starts", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-stale-owner-"));
  temporaryRoots.push(root);
  const stale = startWorker("store-stale-owner", root);
  const oldIdentity = await stale.firstLine;
  const minimumAgeMs = 900_000;
  const request = recoveryRequest({
    targetNonce: oldIdentity.nonce,
    recoveryNonce: "3".repeat(32),
    minimumAgeMs,
  });
  const store = processStore(root);
  const recovered = store.recoverAbandonedLock(request);
  assert.equal(recovered.recoveredNonce, oldIdentity.nonce);

  const replacement = startWorker("store-hold", root);
  const replacementIdentity = await replacement.firstLine;
  assert.notEqual(replacementIdentity.nonce, oldIdentity.nonce);
  writeFileSync(path.join(root, "resume-old-owner"), "resume\n", "utf8");
  const staleExit = await stale.exited;
  assert.notEqual(staleExit.code, 0);
  assert.equal(existsSync(path.join(root, "old-owner-write.json")), false);
  assert.equal(replacement.child.exitCode, null);
  replacement.child.kill("SIGKILL");
  await replacement.exited;
});

test("lock recovery confirmation cannot be replayed with a lower minimum age", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-recover-age-"));
  temporaryRoots.push(root);
  const held = startWorker("store-aged-hold", root);
  const owner = await held.firstLine;
  held.child.kill("SIGKILL");
  await held.exited;
  const approvedAgeMs = 1_800_000;
  const request = recoveryRequest({
    targetNonce: owner.nonce,
    recoveryNonce: "4".repeat(32),
    minimumAgeMs: approvedAgeMs,
  });
  const store = processStore(root);
  assert.throws(
    () => store.recoverAbandonedLock({
      expectedNonce: request.expectedNonce,
      recoveryNonce: request.recoveryNonce,
      minimumAgeMs: 900_000,
      confirmation: request.confirmation,
    }),
    /confirmation|bound/i,
  );
  const recovered = store.recoverAbandonedLock(request);
  assert.equal(recovered.recoveredNonce, owner.nonce);
});

test("quarantine junction cannot redirect orphan files outside the artifact root", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-junction-root-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-junction-outside-"));
  temporaryRoots.push(root, outside);
  const store = processStore(root);
  const storeDirectory = path.dirname(store.file);
  const quarantine = path.join(storeDirectory, "quarantine");
  symlinkSync(outside, quarantine, "junction");
  writeJson(path.join(storeDirectory, `${"c".repeat(64)}.tmp-junction-probe`), {
    releaseId,
    planSha256: "c".repeat(64),
    revision: 99,
  });
  assert.throws(
    () => store.compareAndSwap(0, initialStoreProgress()),
    /junction|reparse|symbolic|quarantine/i,
  );
  assert.deepEqual(readdirSync(outside), []);
});

test("production file store rejects authorization material at any recursive depth", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-recursive-auth-"));
  temporaryRoots.push(root);
  const store = processStore(root);
  assert.throws(
    () => store.compareAndSwap(0, {
      releaseId,
      planSha256: "c".repeat(64),
      revision: 1,
      status: "READY",
      metadata: { harmless: [{ nested: { trafficAuthorization: "TRAFFIC_100" } }] },
    }),
    /forbidden|authorization/i,
  );
  assert.equal(store.load(), undefined);
});

test("production file store fails closed on corrupt main and never promotes orphan temp", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-p5-store-corrupt-"));
  temporaryRoots.push(root);
  const store = processStore(root);
  mkdirSync(path.dirname(store.file), { recursive: true });
  writeFileSync(store.file, "{not-json", "utf8");
  const orphan = path.join(path.dirname(store.file), `${"c".repeat(64)}.tmp-orphan`);
  writeJson(orphan, {
    releaseId,
    planSha256: "c".repeat(64),
    revision: 99,
    status: "READY",
  });

  const load = await runWorker("store-load", root, "");
  assert.notEqual(load.code, 0);
  assert.match(load.stderr, /corrupt JSON; refusing temp-file recovery/);
  assert.equal(readFileSync(store.file, "utf8"), "{not-json");

  const cas = await runWorker("store-cas", root, "must-not-win");
  assert.notEqual(cas.code, 0);
  assert.match(cas.stderr, /corrupt JSON/);
  assert.equal(readFileSync(store.file, "utf8"), "{not-json");
  const quarantined = readdirSync(path.join(path.dirname(store.file), "quarantine"));
  assert.equal(quarantined.length, 1);
  assert.match(quarantined[0], /\.tmp-orphan\.orphan-/);
});
