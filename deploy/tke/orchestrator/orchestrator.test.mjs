import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";

import {
  advanceRelease,
  clearRollbackFailure,
  prepareRelease,
  resumeRelease,
  rollbackRelease,
  runRelease,
} from "./orchestrator.mjs";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const contractRoot = path.resolve(sourceRoot, "../contracts");
const temporaryRoots = [];
const fixedNow = new Date("2026-07-16T09:00:00Z");
const releaseId = "release-20260716-test";

afterEach(() => {
  while (temporaryRoots.length) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

function fixture() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "xlb-p4-"));
  temporaryRoots.push(repoRoot);
  const releaseRoot = path.join(repoRoot, ".artifacts", "tke", "releases", releaseId);
  const environmentRoot = path.join(repoRoot, ".artifacts", "tke", "production");
  const ref = name => `.artifacts/tke/releases/${releaseId}/${name}`;
  const digest = letter => `sha256:${letter.repeat(64)}`;
  const image = (name, letter) => ({
    repository: `ccr.ccs.tencentyun.com/xlb/${name}`,
    digest: digest(letter),
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
    network: { vpcId: "vpc-testsample", subnetIds: ["subnet-testsample1"] },
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
    runId: `${name}-release-run`,
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
      backupId: "backup-test-sample",
      createdAt: "2026-07-16T06:00:00Z",
      verifiedAt: "2026-07-16T07:00:00Z",
      restoreDrill: { performedAt: "2026-07-15T06:00:00Z", result: "PASS", evidenceRef: ref("evidence/restore.json") },
    },
    jobsSingleActive: {
      lighthouseState: "STOPPED",
      tkeState: "ACTIVE",
      leaseOwner: "tke-jobs",
      fencingToken: 2,
      observedAt: "2026-07-16T08:50:00Z",
      evidenceRef: ref("evidence/jobs.json"),
    },
    migration: execution("migration", "40"),
    smoke: execution("smoke", "45"),
    trafficObservations: [5, 25, 50, 100].map((weight, index) => ({
      weight,
      observedAt: `2026-07-16T08:${50 + index}:00Z`,
      result: "PASS",
      evidenceRef: ref(`evidence/traffic-${weight}.json`),
    })),
    rollback: execution("rollback", "55"),
  };
  const files = {
    manifest: path.join(releaseRoot, "release-manifest.json"),
    imageLock: path.join(releaseRoot, "images.lock.json"),
    cloudBundle: path.join(environmentRoot, "manifest.json"),
    evidence: path.join(releaseRoot, "evidence.json"),
    checkpoint: path.join(releaseRoot, "checkpoint.json"),
  };
  writeJson(files.manifest, manifest);
  writeJson(files.imageLock, imageLock);
  writeJson(files.cloudBundle, cloudBundle);
  writeJson(files.evidence, evidence);
  for (const [name, imageValue] of Object.entries(imageLock.images)) {
    writeJson(path.join(repoRoot, imageValue.sbomFile), { bomFormat: "CycloneDX", component: name });
    writeJson(path.join(repoRoot, imageValue.scanEvidenceFile), { component: name, high: 0, critical: 0 });
  }
  const cloudPayloads = {
    [cloudBundle.files.terraformVarFile]: "environment = \"production\"\n",
    [cloudBundle.files.backendConfig]: "encrypt = true\n",
    [cloudBundle.files.valuesFile]: "global:\n  environment: production\n",
  };
  for (const [reference, content] of Object.entries(cloudPayloads)) {
    const file = path.join(repoRoot, reference);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  }
  const inventoryFiles = [...Object.keys(cloudPayloads), cloudBundle.files.imageLockFile]
    .sort()
    .map(reference => ({
      file: reference,
      sha256: createHash("sha256").update(readFileSync(path.join(repoRoot, reference))).digest("hex"),
    }));
  const { bundleSha256: ignoredBundleDigest, ...cloudManifestCore } = cloudBundle;
  cloudBundle.bundleSha256 = createHash("sha256").update(JSON.stringify({
    releaseId,
    sourceCommit: manifest.sourceCommit,
    cloudBundle: cloudManifestCore,
    payloadFiles: inventoryFiles,
  })).digest("hex");
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
  const evidenceRefs = [
    evidence.backup.restoreDrill.evidenceRef,
    evidence.jobsSingleActive.evidenceRef,
    evidence.migration.evidenceRef,
    evidence.smoke.evidenceRef,
    evidence.rollback.evidenceRef,
    ...evidence.trafficObservations.map(item => item.evidenceRef),
  ];
  for (const reference of evidenceRefs) writeJson(path.join(repoRoot, reference), { result: "PASS", reference });
  return { repoRoot, contractRoot, manifestFile: files.manifest, files, ref };
}

const allAuthorities = {
  terraformPlan: true,
  terraformApply: true,
  cloudDeploy: true,
  dataMigration: true,
  lighthouseRetirement: true,
};

function providerResult(input, context, { provider = "reviewed-provider", mode = "REAL", artifactsChanged = [] } = {}) {
  if (context.stage === "ARTIFACTS_READY") return { artifactsChanged };
  const evidenceRef = input.ref(`evidence/provider-${context.stage.toLowerCase().replaceAll("_", "-")}.json`);
  const evidenceFile = path.join(input.repoRoot, evidenceRef);
  writeJson(evidenceFile, { operation: context.stage, idempotencyKey: context.idempotencyKey, result: "PASS" });
  return {
    artifactsChanged,
    providerReceipt: {
      schemaVersion: 1,
      provider,
      mode,
      operation: context.stage,
      idempotencyKey: context.idempotencyKey,
      completedAt: fixedNow.toISOString(),
      result: "PASS",
      evidenceRef,
      evidenceSha256: createHash("sha256").update(readFileSync(evidenceFile)).digest("hex"),
    },
  };
}

test("prepares a schema-valid checkpoint with real artifact hashes", () => {
  const input = fixture();
  const result = prepareRelease({ ...input, now: fixedNow });
  assert.equal(result.status, "PREPARED");
  assert.equal(result.checkpoint.revision, 1);
  for (const required of ["cloudBundle", "evidenceBundle", "imageLock", "releaseManifest", "image.backend.sbom", "image.backend.scan", "cloudPayloadInventory", "evidence.jobsSingleActive"]) {
    assert.ok(result.checkpoint.artifactHashes[required], `missing hash ${required}`);
  }
  assert.equal(result.checkpoint.artifactHashes.imageLock, createHash("sha256").update(readFileSync(input.files.imageLock)).digest("hex"));
  assert.doesNotMatch(readFileSync(input.files.checkpoint, "utf8"), /authorit|approval|credential/i);
});

test("committed checkpoint example validates against the frozen schema", () => {
  const schema = JSON.parse(readFileSync(path.join(contractRoot, "checkpoint.schema.json"), "utf8"));
  const example = JSON.parse(readFileSync(path.join(sourceRoot, "checkpoint.example.json"), "utf8"));
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
});

test("runs every adjacent state in order with an injected executor", async () => {
  const input = fixture();
  const calls = [];
  const trafficObservations = JSON.parse(readFileSync(input.files.evidence, "utf8")).trafficObservations;
  const executor = async context => {
    calls.push(`${context.currentState}->${context.targetState}`);
    const trafficCount = { TRAFFIC_5: 1, TRAFFIC_25: 2, TRAFFIC_50: 3, TRAFFIC_100: 4 }[context.targetState];
    if (trafficCount) {
      const evidence = JSON.parse(readFileSync(input.files.evidence, "utf8"));
      evidence.trafficObservations = trafficObservations.slice(0, trafficCount);
      writeJson(input.files.evidence, evidence);
      return providerResult(input, context, { artifactsChanged: ["evidenceBundle"] });
    }
    return providerResult(input, context);
  };
  await runRelease({ ...input, targetState: "JOBS_SWITCHED", authorities: allAuthorities, executor, now: fixedNow });
  for (const targetState of ["TRAFFIC_5", "TRAFFIC_25", "TRAFFIC_50", "TRAFFIC_100"]) {
    const step = await runRelease({ ...input, targetState, authorities: { trafficCutover: targetState }, executor, now: fixedNow });
    assert.equal(step.status, "TARGET_REACHED", step.error?.message);
    if (targetState === "TRAFFIC_5") {
      const reused = await runRelease({ ...input, targetState: "TRAFFIC_25", authorities: { trafficCutover: "TRAFFIC_5" }, executor, now: fixedNow });
      assert.equal(reused.status, "PAUSED_AUTHORITY");
      assert.equal(reused.checkpoint.currentState, "TRAFFIC_5");
    }
  }
  await runRelease({ ...input, targetState: "OBSERVED", executor, now: fixedNow });
  const result = await runRelease({ ...input, targetState: "LIGHTHOUSE_RETIRED", authorities: { lighthouseRetirement: true }, executor, now: fixedNow });
  assert.equal(result.status, "TARGET_REACHED", result.error?.message);
  assert.equal(result.checkpoint.currentState, "LIGHTHOUSE_RETIRED");
  assert.equal(calls.length, 14);
  assert.equal(calls[0], "PREPARED->ARTIFACTS_READY");
  assert.equal(calls.at(-1), "OBSERVED->LIGHTHOUSE_RETIRED");
  assert.doesNotMatch(readFileSync(input.files.checkpoint, "utf8"), /terraformPlan|trafficCutover|runtimeAuthority/i);
});

test("pauses before an authority boundary without changing the revision", async () => {
  const input = fixture();
  const result = await runRelease({ ...input, targetState: "PLAN_REVIEWED", now: fixedNow });
  assert.equal(result.status, "PAUSED_AUTHORITY");
  assert.equal(result.requiredAuthority, "terraformPlan");
  assert.equal(result.checkpoint.currentState, "ARTIFACTS_READY");
  assert.equal(result.checkpoint.revision, 2);
});

test("default offline executor never completes a fake external stage", async () => {
  const input = fixture();
  const result = await runRelease({
    ...input,
    targetState: "PLAN_REVIEWED",
    authorities: { terraformPlan: true },
    now: fixedNow,
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.checkpoint.failure.resumeState, "PLAN_REVIEWED");
  assert.equal(result.checkpoint.failure.failedStage, "PLAN_INFRASTRUCTURE");
  assert.equal(result.checkpoint.failure.retryable, false);
  assert.match(result.checkpoint.failure.message, /OFFLINE_FAKE has no provider adapter/);
});

test("rejects an illegal forward jump", async () => {
  const input = fixture();
  prepareRelease({ ...input, now: fixedNow });
  await assert.rejects(
    advanceRelease({ ...input, targetState: "INFRA_READY", authorities: allAuthorities, now: fixedNow }),
    /illegal state transition PREPARED -> INFRA_READY/,
  );
});

test("records a failure and resumes only the recorded state", async () => {
  const input = fixture();
  let failApply = true;
  const applyKeys = [];
  const executor = async context => {
    if (context.targetState === "INFRA_READY" && failApply) {
      applyKeys.push(context.idempotencyKey);
      failApply = false;
      const error = new Error("provider token=do-not-persist authority=do-not-persist");
      error.retryable = true;
      throw error;
    }
    if (context.targetState === "INFRA_READY") applyKeys.push(context.idempotencyKey);
    return providerResult(input, context);
  };
  const failed = await runRelease({ ...input, targetState: "INFRA_READY", authorities: allAuthorities, executor, now: fixedNow });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.checkpoint.failure.resumeState, "INFRA_READY");
  assert.equal(failed.checkpoint.failure.failedStage, "APPLY_INFRASTRUCTURE");
  assert.equal(failed.checkpoint.failure.retryable, true);
  assert.match(failed.checkpoint.failure.message, /token=\[REDACTED\]/);
  assert.match(failed.checkpoint.failure.message, /runtime-grant=\[REDACTED\]/);
  assert.doesNotMatch(failed.checkpoint.failure.message, /authority|approval/i);
  assert.doesNotMatch(failed.checkpoint.failure.message, /do-not-persist/);
  await assert.rejects(advanceRelease({ ...input, targetState: "INFRA_READY", authorities: allAuthorities }), /must use resumeRelease/);
  const paused = await resumeRelease({ ...input, executor, now: fixedNow });
  assert.equal(paused.status, "PAUSED_AUTHORITY");
  assert.equal(paused.checkpoint.currentState, "FAILED");
  assert.equal(JSON.parse(readFileSync(input.files.checkpoint, "utf8")).currentState, "FAILED");
  const resumed = await resumeRelease({ ...input, authorities: allAuthorities, executor, now: fixedNow });
  assert.equal(resumed.status, "INFRA_READY");
  assert.equal(resumed.checkpoint.currentState, "INFRA_READY");
  assert.equal(resumed.checkpoint.failure, undefined);
  assert.deepEqual(applyKeys, [`${releaseId}:3:INFRA_READY`, `${releaseId}:3:INFRA_READY`]);
});

test("blocks stale resume when a source artifact changes", async () => {
  const input = fixture();
  await runRelease({ ...input, targetState: "ARTIFACTS_READY", now: fixedNow });
  const evidence = JSON.parse(readFileSync(input.files.evidence, "utf8"));
  evidence.updatedAt = "2026-07-16T08:56:00Z";
  writeJson(input.files.evidence, evidence);
  await assert.rejects(
    advanceRelease({ ...input, targetState: "PLAN_REVIEWED", authorities: allAuthorities, now: fixedNow }),
    /evidenceBundle hash drift detected/,
  );
});

test("blocks a concurrent checkpoint revision change", async () => {
  const input = fixture();
  await runRelease({ ...input, targetState: "ARTIFACTS_READY", now: fixedNow });
  const executor = async context => {
    const checkpoint = JSON.parse(readFileSync(input.files.checkpoint, "utf8"));
    checkpoint.revision += 1;
    writeJson(input.files.checkpoint, checkpoint);
    return providerResult(input, context);
  };
  await assert.rejects(
    advanceRelease({ ...input, targetState: "PLAN_REVIEWED", authorities: { terraformPlan: true }, executor, now: fixedNow }),
    /checkpoint revision changed/,
  );
});

test("rejects a schema-valid checkpoint with an illegal completed-stage prefix", async () => {
  const input = fixture();
  await runRelease({ ...input, targetState: "ARTIFACTS_READY", now: fixedNow });
  const checkpoint = JSON.parse(readFileSync(input.files.checkpoint, "utf8"));
  checkpoint.currentState = "INFRA_READY";
  writeJson(input.files.checkpoint, checkpoint);
  await assert.rejects(
    advanceRelease({ ...input, targetState: "DEPLOYED_NO_TRAFFIC", authorities: allAuthorities, now: fixedNow }),
    /completedStages are not the exact legal prefix/,
  );
});

test("is idempotent when already at the requested state", async () => {
  const input = fixture();
  let calls = 0;
  const executor = async () => { calls += 1; return { artifactsChanged: [] }; };
  await runRelease({ ...input, targetState: "ARTIFACTS_READY", executor, now: fixedNow });
  const again = await advanceRelease({ ...input, targetState: "ARTIFACTS_READY", executor, now: fixedNow });
  assert.equal(again.status, "ALREADY_AT_TARGET");
  assert.equal(again.checkpoint.revision, 2);
  assert.equal(calls, 1);
});

test("allows evidence-backed rollback only in the frozen rollback range", async () => {
  const beforeDeploy = fixture();
  const beforeExecutor = async context => providerResult(beforeDeploy, context);
  await runRelease({ ...beforeDeploy, targetState: "INFRA_READY", authorities: allAuthorities, executor: beforeExecutor, now: fixedNow });
  await assert.rejects(rollbackRelease({ ...beforeDeploy, now: fixedNow }), /rollback is not legal from INFRA_READY/);

  const deployed = fixture();
  const deployedExecutor = async context => providerResult(deployed, context);
  await runRelease({ ...deployed, targetState: "DEPLOYED_NO_TRAFFIC", authorities: allAuthorities, executor: deployedExecutor, now: fixedNow });
  const rolledBack = await rollbackRelease({ ...deployed, executor: deployedExecutor, now: fixedNow });
  assert.equal(rolledBack.status, "ROLLED_BACK");
  assert.equal(rolledBack.checkpoint.completedStages.at(-1), "ROLLBACK");
  await assert.rejects(
    advanceRelease({ ...deployed, targetState: "BACKUP_VERIFIED", authorities: allAuthorities }),
    /ROLLED_BACK is terminal/,
  );
});

test("fails closed when an executor mutates an undeclared artifact", async () => {
  const input = fixture();
  const executor = async () => {
    const evidence = JSON.parse(readFileSync(input.files.evidence, "utf8"));
    evidence.updatedAt = "2026-07-16T08:57:00Z";
    writeJson(input.files.evidence, evidence);
    return { artifactsChanged: [] };
  };
  const result = await runRelease({ ...input, targetState: "ARTIFACTS_READY", executor, now: fixedNow });
  assert.equal(result.status, "FAILED");
  assert.match(result.checkpoint.failure.message, /executor artifact changes differ from declaration/);
});

test("rejects unknown and non-boolean runtime authority input", async () => {
  const input = fixture();
  await assert.rejects(
    runRelease({ ...input, targetState: "ARTIFACTS_READY", authorities: { deployEverything: true } }),
    /unknown runtime authority/,
  );
  await assert.rejects(
    runRelease({ ...input, targetState: "ARTIFACTS_READY", authorities: { cloudDeploy: "yes" } }),
    /must be boolean/,
  );
  await assert.rejects(
    runRelease({ ...input, targetState: "ARTIFACTS_READY", authorities: { trafficCutover: true } }),
    /must name exactly one traffic state/,
  );
});

test("rejects credential-like material even when an artifact remains schema-valid", () => {
  const input = fixture();
  const manifest = JSON.parse(readFileSync(input.files.manifest, "utf8"));
  manifest.owners.release = "token=credential-like-value";
  writeJson(input.files.manifest, manifest);
  assert.throws(() => prepareRelease({ ...input, now: fixedNow }), /contains credential-like material/);
});

test("requires every SBOM, scan, cloud payload, and evidence reference", () => {
  const input = fixture();
  unlinkSync(path.join(input.repoRoot, input.ref("sbom/backend.cdx.json")));
  assert.throws(() => prepareRelease({ ...input, now: fixedNow }), /backend SBOM not found/);
});

test("rejects mock provider receipts outside explicit simulation", async () => {
  const input = fixture();
  const executor = async context => providerResult(input, context, { provider: "mock-provider", mode: "SIMULATION" });
  const result = await runRelease({ ...input, targetState: "PLAN_REVIEWED", authorities: { terraformPlan: true }, executor, now: fixedNow });
  assert.equal(result.status, "FAILED");
  assert.match(result.checkpoint.failure.message, /refuses mock, no-op, offline, or fake/);

  const simulationInput = fixture();
  const simulationExecutor = async context => providerResult(simulationInput, context, { provider: "mock-provider", mode: "SIMULATION" });
  const simulated = await runRelease({
    ...simulationInput,
    targetState: "PLAN_REVIEWED",
    authorities: { terraformPlan: true },
    executor: simulationExecutor,
    now: fixedNow,
    simulation: true,
  });
  assert.equal(simulated.status, "TARGET_REACHED");
});

test("serializes two runners with a release-level lease and stable idempotency key", async () => {
  const input = fixture();
  await runRelease({ ...input, targetState: "ARTIFACTS_READY", now: fixedNow });
  let enteredResolve;
  let finishResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const finish = new Promise(resolve => { finishResolve = resolve; });
  let observedKey;
  const executor = async context => {
    observedKey = context.idempotencyKey;
    enteredResolve();
    await finish;
    return providerResult(input, context);
  };
  const first = advanceRelease({
    ...input,
    targetState: "PLAN_REVIEWED",
    authorities: { terraformPlan: true },
    executor,
    now: fixedNow,
  });
  await entered;
  await assert.rejects(
    advanceRelease({ ...input, targetState: "PLAN_REVIEWED", authorities: { terraformPlan: true }, executor, now: fixedNow }),
    /another runner holds the release lease/,
  );
  finishResolve();
  const completed = await first;
  assert.equal(completed.status, "PLAN_REVIEWED");
  assert.equal(observedKey, `${releaseId}:2:PLAN_REVIEWED`);
});

test("persists rollback failure latch and blocks forward/resume until rollback retry", async () => {
  const input = fixture();
  const executor = async context => providerResult(input, context);
  await runRelease({ ...input, targetState: "DEPLOYED_NO_TRAFFIC", authorities: allAuthorities, executor, now: fixedNow });
  const failedRollback = await rollbackRelease({
    ...input,
    executor: async () => { const error = new Error("temporary rollback timeout"); error.retryable = true; throw error; },
    now: fixedNow,
  });
  assert.equal(failedRollback.status, "ROLLBACK_FAILED");
  assert.equal(JSON.parse(readFileSync(`${input.files.checkpoint}.rollback-failed.json`, "utf8")).status, "ROLLBACK_FAILED");
  await assert.rejects(
    advanceRelease({ ...input, targetState: "BACKUP_VERIFIED", executor, now: fixedNow }),
    /rollback-failed latch blocks forward and resume/,
  );
  await assert.rejects(resumeRelease({ ...input, executor, now: fixedNow }), /rollback-failed latch blocks forward and resume/);
  const retried = await rollbackRelease({ ...input, executor, now: fixedNow });
  assert.equal(retried.status, "ROLLED_BACK");
  assert.equal(rmSync(`${input.files.checkpoint}.rollback-failed.json`, { force: true }), undefined);
});

test("requires release-scoped confirmation for manual rollback-latch handling", async () => {
  const input = fixture();
  const executor = async context => providerResult(input, context);
  await runRelease({ ...input, targetState: "DEPLOYED_NO_TRAFFIC", authorities: allAuthorities, executor, now: fixedNow });
  await rollbackRelease({ ...input, executor: async () => { throw new Error("nonretryable rollback failure"); }, now: fixedNow });
  await assert.rejects(clearRollbackFailure({ ...input, confirmation: "yes" }), /explicit release-scoped/);
  const cleared = await clearRollbackFailure({ ...input, confirmation: `ACKNOWLEDGE-ROLLBACK-FAILURE:${releaseId}` });
  assert.equal(cleared.status, "ROLLBACK_LATCH_CLEARED");
});

test("rejects stale stage evidence before committing the state", async () => {
  const input = fixture();
  const evidence = JSON.parse(readFileSync(input.files.evidence, "utf8"));
  evidence.jobsSingleActive.observedAt = "2026-07-16T07:00:00Z";
  writeJson(input.files.evidence, evidence);
  const executor = async context => providerResult(input, context);
  const result = await runRelease({ ...input, targetState: "JOBS_SWITCHED", authorities: allAuthorities, executor, now: fixedNow });
  assert.equal(result.status, "FAILED");
  assert.match(result.checkpoint.failure.message, /jobsSingleActive\.observedAt is stale/);
});
