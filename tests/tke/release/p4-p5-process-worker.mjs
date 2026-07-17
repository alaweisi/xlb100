import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [operation, root, argument] = process.argv.slice(2);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const releaseId = "release-gate2-real-chain";
const fixedNow = new Date("2026-07-16T09:00:00Z");
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sha256File = file => sha256(readFileSync(file));
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, jsonBytes(value));
};

const progressStoreFile = process.env.XLB_P5_PROGRESS_STORE_MODULE
  ?? path.join(repoRoot, "deploy/tke/cutover/file-progress-store.mjs");
if (!existsSync(progressStoreFile)) throw new Error("production P5 progress store module is required");
const storeModule = await import(pathToFileURL(progressStoreFile));

const processStorePlanSha256 = "c".repeat(64);

function createProcessStore(overrides = {}) {
  return storeModule.createFileProgressStore({
    artifactRoot: path.resolve(root),
    releaseId,
    planSha256: processStorePlanSha256,
    lockTimeoutMs: 100,
    retryDelayMs: 5,
    ...overrides,
  });
}

function writePayload(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function runStoreOperation() {
  if (operation === "store-cas") {
    const contender = argument;
    const store = createProcessStore();
    const won = store.compareAndSwap(0, {
      releaseId,
      planSha256: processStorePlanSha256,
      revision: 1,
      status: "READY",
      contender,
    });
    writePayload({ won, contender, value: store.load() });
    return true;
  }
  if (operation === "store-load") {
    writePayload({ value: createProcessStore().load() });
    return true;
  }
  if (operation === "store-hold") {
    const lock = createProcessStore().acquireLock();
    writePayload({
      ready: true,
      pid: process.pid,
      nonce: lock.nonce,
      releaseId: lock.releaseId,
      planSha256: lock.planSha256,
      acquiredAt: lock.acquiredAt,
    });
    setInterval(() => {}, 60_000);
    return true;
  }
  return false;
}

function inputFromRoot() {
  const releaseRoot = path.join(root, ".artifacts", "tke", "releases", releaseId);
  const ref = name => `.artifacts/tke/releases/${releaseId}/${name}`;
  const absolute = reference => path.join(root, reference.replaceAll("/", path.sep));
  return {
    repoRoot: root,
    contractRoot: path.join(repoRoot, "deploy", "tke", "contracts"),
    manifestFile: path.join(releaseRoot, "release-manifest.json"),
    files: {
      manifest: path.join(releaseRoot, "release-manifest.json"),
      imageLock: path.join(releaseRoot, "images.lock.json"),
      cloudBundle: path.join(root, ".artifacts", "tke", "production", "cloud-bundle.json"),
      evidence: path.join(releaseRoot, "evidence.json"),
      checkpoint: path.join(releaseRoot, "checkpoint.json"),
    },
    ref,
    absolute,
    clock: () => fixedNow,
  };
}

function buildPlan(input, p5) {
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
  return p5.buildCutoverPlan({
    request: {
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
    },
    releaseManifest,
    cloudBundle,
    evidenceBundle,
    checkpoint,
    actualHashes: { ...expectedHashes },
  });
}

class DiskTransport {
  constructor(input, file, initialWeight) {
    this.input = input;
    this.file = file;
    if (!existsSync(file)) writeJson(file, { weight: initialWeight, applies: [], completed: {} });
  }
  state() { return readJson(this.file); }
  proof(kind, weight, idempotencyKey) {
    const evidenceRef = this.input.ref(`evidence/child-${kind}-${weight}.json`);
    writeJson(this.input.absolute(evidenceRef), { kind, weight, idempotencyKey, result: "PASS" });
    return { tkeWeight: weight, lighthouseWeight: 100 - weight, evidenceRef };
  }
  async readWeights() {
    return this.proof("read", this.state().weight);
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
    if (operation === "crash-after-provider-apply" && toWeight === Number(argument)) process.exit(91);
    return this.proof("apply", toWeight, idempotencyKey);
  }
}

class DiskObserver {
  constructor(input, file, failOnceAt) {
    this.input = input;
    this.file = file;
    this.failOnceAt = failOnceAt;
    if (!existsSync(file)) writeJson(file, { calls: [], failedWeights: [] });
  }
  async observe({ direction, weight, minimumObservationSeconds }) {
    const state = readJson(this.file);
    state.calls.push({ direction, weight, minimumObservationSeconds, pid: process.pid });
    if (weight === this.failOnceAt && !state.failedWeights.includes(weight)) {
      state.failedWeights.push(weight);
      writeJson(this.file, state);
      const error = new Error(`injected child-process observation failure at ${weight}`);
      error.retryable = true;
      throw error;
    }
    writeJson(this.file, state);
    const evidenceRef = this.input.ref(`evidence/child-observe-${direction}-${weight}.json`);
    writeJson(this.input.absolute(evidenceRef), { direction, weight, durationSeconds: minimumObservationSeconds, result: "PASS" });
    return { weight, result: "PASS", durationSeconds: minimumObservationSeconds, observedAt: fixedNow.toISOString(), evidenceRef };
  }
}

function providerReceipt(input, context, artifactsChanged = []) {
  const evidenceRef = input.ref(`evidence/child-p4-${context.stage.toLowerCase().replaceAll("_", "-")}.json`);
  writeJson(input.absolute(evidenceRef), {
    operation: context.stage,
    idempotencyKey: context.idempotencyKey,
    leaseOwner: context.leaseOwner,
    fencingToken: context.fencingToken,
    result: "PASS",
  });
  return {
    artifactsChanged,
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

async function runP4P5() {
  const p4File = process.env.XLB_P4_ORCHESTRATOR_MODULE;
  const p5File = process.env.XLB_P5_CUTOVER_MODULE;
  if (!p4File || !p5File) throw new Error("P4 and P5 module paths are required");
  const [p4, p5] = await Promise.all([import(pathToFileURL(p4File)), import(pathToFileURL(p5File))]);
  const input = inputFromRoot();
  const rollback = operation === "rollback";
  const targetWeight = rollback ? 0 : Number(argument);
  const planFile = input.absolute(input.ref(rollback ? "process-plan-rollback.json" : `process-plan-${targetWeight}.json`));
  const plan = existsSync(planFile) ? readJson(planFile) : buildPlan(input, p5);
  if (!existsSync(planFile)) writeJson(planFile, plan);
  const transportFile = input.absolute(input.ref("progress/process-provider.json"));
  const observerFile = input.absolute(input.ref("progress/process-observer.json"));
  const store = storeModule.createFileProgressStore({
    artifactRoot: input.absolute(".artifacts/tke"),
    releaseId,
    planSha256: plan.planSha256,
  });
  const transport = new DiskTransport(input, transportFile, plan.initialWeight);
  const observer = new DiskObserver(input, observerFile, operation === "fail" ? targetWeight : undefined);
  const controller = new p5.CutoverController({ adapter: p5.createClbAdapter(transport), observer, store, now: input.clock });
  const contexts = [];
  const executor = async context => {
    contexts.push(structuredClone(context));
    const evidenceBytes = readFileSync(input.files.evidence);
    if (sha256(evidenceBytes) !== plan.artifactHashes.evidenceBundle) throw new Error("child evidence hash drift");
    const cutover = rollback
      ? await controller.rollback({
        plan,
        evidenceSource: { bytes: evidenceBytes },
        executionToken: { action: "ROLLBACK_TRAFFIC", planSha256: plan.planSha256, releaseId, targetWeight: 0 },
      })
      : await controller.advance({
        plan,
        evidenceSource: { bytes: evidenceBytes },
        targetWeight,
        executionToken: { action: "ADVANCE", planSha256: plan.planSha256, releaseId, targetWeight },
      });
    if (operation === "crash-after-progress-commit") process.exit(92);
    const evidence = JSON.parse(evidenceBytes.toString("utf8"));
    if (rollback) {
      const transition = cutover.progress.rollback.transitions.at(-1);
      evidence.rollback = {
        runId: `rollback-${releaseId}`,
        completedAt: fixedNow.toISOString(),
        result: "PASS",
        evidenceRef: transition?.observationEvidenceRef ?? input.ref("evidence/child-rollback-zero.json"),
      };
      if (!transition) writeJson(input.absolute(evidence.rollback.evidenceRef), { result: "PASS" });
    } else {
      const observation = cutover.progress.observations.find(item => item.weight === targetWeight);
      evidence.trafficObservations = [
        ...(evidence.trafficObservations ?? []).filter(item => item.weight < targetWeight),
        { weight: targetWeight, observedAt: observation.observedAt, result: "PASS", evidenceRef: observation.observationEvidenceRef },
      ];
    }
    evidence.updatedAt = fixedNow.toISOString();
    writeJson(input.files.evidence, evidence);
    return providerReceipt(input, context, ["evidenceBundle"]);
  };
  const options = {
    ...input,
    authorities: { trafficCutover: `TRAFFIC_${targetWeight}` },
    executor,
    now: fixedNow,
    clock: input.clock,
    leaseDurationMs: operation.startsWith("crash-") ? 1_000 : 30_000,
    leaseHeartbeat: !operation.startsWith("crash-"),
  };
  const result = rollback
    ? await p4.rollbackRelease(options)
    : operation === "resume"
      ? await p4.resumeRelease(options)
      : await p4.advanceRelease({ ...options, targetState: `TRAFFIC_${targetWeight}` });
  writePayload({
    status: result.status,
    checkpointState: result.checkpoint.currentState,
    failure: result.checkpoint.failure,
    contexts,
    progress: store.load(),
    provider: readJson(transportFile),
    observer: readJson(observerFile),
  });
}

try {
  if (!await runStoreOperation()) await runP4P5();
} catch (error) {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
