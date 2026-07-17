import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoots = [];
const releaseId = "release-gate2-real-chain";
const processStorePlanSha256 = "c".repeat(64);
const processWorkerFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "p4-p5-process-worker.mjs");

const resolveCandidateModule = (relative, environmentVariable) => {
  const explicitlyInjected = process.env[environmentVariable];
  if (explicitlyInjected) {
    const resolved = path.resolve(explicitlyInjected);
    if (!existsSync(resolved)) throw new Error(`${environmentVariable} does not exist: ${resolved}`);
    return resolved;
  }
  const integrated = path.join(repoRoot, relative);
  if (existsSync(integrated)) return integrated;
  throw new Error(`P5 candidate module is unavailable: ${relative}`);
};

const progressStoreModuleFile = resolveCandidateModule(
  "deploy/tke/cutover/file-progress-store.mjs",
  "XLB_P5_PROGRESS_STORE_MODULE",
);
const runtimeModuleFile = resolveCandidateModule(
  "deploy/tke/cutover/runtime.mjs",
  "XLB_P5_RUNTIME_MODULE",
);
const [progressStoreModule, runtimeModule] = await Promise.all([
  import(pathToFileURL(progressStoreModuleFile)),
  import(pathToFileURL(runtimeModuleFile)),
]);

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

const runtimePlan = environment => Object.freeze({
  releaseId: `release-p5-runtime-${environment}`,
  environment,
  trafficProvider: "clb",
  planSha256: "a".repeat(64),
});

const transport = {
  readWeights: async () => ({
    tkeWeight: 0,
    lighthouseWeight: 100,
    evidenceRef: ".artifacts/tke/tests/read.json",
  }),
  applyWeights: async () => ({
    tkeWeight: 5,
    lighthouseWeight: 95,
    evidenceRef: ".artifacts/tke/tests/apply.json",
  }),
};
const observer = { observe: async () => ({}) };

const readJson = file => JSON.parse(readFileSync(file, "utf8"));

function runWorker(operation, root, argument, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [processWorkerFile, operation, root, String(argument)], {
      env: {
        ...process.env,
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
    child.once("error", reject);
    child.once("close", code => {
      const result = { code, stderr, stdout, pid: child.pid };
      if (code === 0) {
        try { result.payload = JSON.parse(stdout.trim()); } catch (error) { return reject(error); }
      }
      resolve(result);
    });
  });
}

function startWorker(operation, root, argument = "") {
  const child = spawn(process.execPath, [processWorkerFile, operation, root, String(argument)], {
    env: {
      ...process.env,
      XLB_P5_PROGRESS_STORE_MODULE: progressStoreModuleFile,
      XLB_P5_RUNTIME_MODULE: runtimeModuleFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const firstLine = new Promise((resolve, reject) => {
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      pending += chunk;
      const newline = pending.indexOf("\n");
      if (newline >= 0) resolve(JSON.parse(pending.slice(0, newline)));
    });
    child.once("error", reject);
  });
  const exited = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", reject);
  });
  return { child, firstLine, exited };
}

function processStore(root) {
  return progressStoreModule.createFileProgressStore({
    artifactRoot: path.resolve(root),
    releaseId,
    planSha256: processStorePlanSha256,
    lockTimeoutMs: 100,
    retryDelayMs: 5,
  });
}

function recoveryRequest(targetNonce, recoveryNonce) {
  const minimumAgeMs = 900_000;
  return {
    expectedNonce: targetNonce,
    recoveryNonce,
    minimumAgeMs,
    confirmation: `RECOVER_ABANDONED_LOCK:${releaseId}:${processStorePlanSha256}:${targetNonce}:${recoveryNonce}:${minimumAgeMs}:RECOVER`,
  };
}

test("production and staging plans cannot relabel themselves as simulation to select memory progress", () => {
  for (const environment of ["production", "staging"]) {
    const artifactRoot = mkdtempSync(path.join(os.tmpdir(), `xlb-p5-runtime-${environment}-`));
    temporaryRoots.push(artifactRoot);
    assert.throws(
      () => runtimeModule.createCutoverRuntime({
        plan: runtimePlan(environment),
        artifactRoot,
        transport,
        observer,
        mode: "simulation",
        storeType: "memory",
      }),
      /production|staging|simulation|mode|storeType|memory|file store/i,
    );
  }
});

test("the product progress-store module exposes no constructor that can lower the recovery age floor", () => {
  assert.equal(
    Object.hasOwn(progressStoreModule, "createFileProgressStoreForTest"),
    false,
    "test-only floor override must live outside the product module",
  );
});

for (const [index, crashStage] of [
  "after-claim-owner",
  "after-target-quarantine",
  "before-claim-release",
].entries()) {
  test(`a second child resumes the exact recovery claim after ${crashStage} crash without isolating a new owner`, async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), `xlb-p5-recovery-claim-${index}-`));
    temporaryRoots.push(root);
    const stale = startWorker("store-stale-owner", root);
    let replacement;
    try {
      const target = await stale.firstLine;
      const request = recoveryRequest(target.nonce, String(index + 5).repeat(32));
      const crashed = await runWorker("store-recover", root, JSON.stringify(request), {
        XLB_FILE_STORE_RECOVERY_CRASH_AT: crashStage,
      });
      assert.notEqual(crashed.code, 0, "the recovery fixture must terminate at the requested crash stage");

      const store = processStore(root);
      const claimDirectory = store.recoveryClaimDirectory ?? store.recoveryMutexDirectory;
      assert.equal(typeof claimDirectory, "string", "the product store must expose its release/plan-scoped recovery claim path");
      assert.equal(existsSync(claimDirectory), true, "a killed recovery child must leave a controlled claim to resume");
      const claimOwnerFile = path.join(claimDirectory, "owner.json");
      const claimOwner = readJson(claimOwnerFile);
      assert.equal(claimOwner.recoveryNonce ?? claimOwner.nonce, request.recoveryNonce);
      // Model expiry of the independently owned recovery claim without
      // weakening the production clock or its immutable fifteen-minute floor.
      writeFileSync(claimOwnerFile, `${JSON.stringify({
        ...claimOwner,
        acquiredAt: "2026-07-16T00:00:00Z",
      }, null, 2)}\n`, "utf8");

      const targetAlreadyQuarantined = crashStage !== "after-claim-owner";
      assert.equal(existsSync(store.lockDirectory), !targetAlreadyQuarantined);
      if (targetAlreadyQuarantined) {
        replacement = startWorker("store-hold", root);
        const replacementIdentity = await replacement.firstLine;
        assert.notEqual(replacementIdentity.nonce, target.nonce);
      }

      const resumed = await runWorker("store-recover", root, JSON.stringify(request));
      assert.equal(resumed.code, 0, resumed.stderr);
      assert.equal(resumed.payload.recoveredNonce, target.nonce);
      assert.equal(existsSync(claimDirectory), false, "successful recovery must release its claim");

      if (!replacement) {
        replacement = startWorker("store-hold", root);
        const replacementIdentity = await replacement.firstLine;
        assert.notEqual(replacementIdentity.nonce, target.nonce);
      }
      assert.equal(replacement.child.exitCode, null, "resumed recovery must not isolate the replacement owner");

      writeFileSync(path.join(root, "resume-old-owner"), "resume\n", "utf8");
      const staleExit = await stale.exited;
      assert.notEqual(staleExit.code, 0, "the recovered target owner must remain fenced");
      assert.equal(existsSync(path.join(root, "old-owner-write.json")), false);
    } finally {
      for (const worker of [stale, replacement].filter(Boolean)) {
        if (worker.child.exitCode === null) worker.child.kill("SIGKILL");
      }
      await Promise.all([stale, replacement].filter(Boolean).map(worker => worker.exited.catch(() => {})));
    }
  });
}
