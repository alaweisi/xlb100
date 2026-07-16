import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";

import {
  advanceRelease,
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
    cloudBundle: path.join(environmentRoot, "cloud-bundle.json"),
    evidence: path.join(releaseRoot, "evidence.json"),
    checkpoint: path.join(releaseRoot, "checkpoint.json"),
  };
  writeJson(files.manifest, manifest);
  writeJson(files.imageLock, imageLock);
  writeJson(files.cloudBundle, cloudBundle);
  writeJson(files.evidence, evidence);
  return { repoRoot, contractRoot, manifestFile: files.manifest, files };
}

const allAuthorities = {
  terraformPlan: true,
  terraformApply: true,
  cloudDeploy: true,
  dataMigration: true,
  trafficCutover: true,
  lighthouseRetirement: true,
};

test("prepares a schema-valid checkpoint with real artifact hashes", () => {
  const input = fixture();
  const result = prepareRelease({ ...input, now: fixedNow });
  assert.equal(result.status, "PREPARED");
  assert.equal(result.checkpoint.revision, 1);
  assert.deepEqual(Object.keys(result.checkpoint.artifactHashes).sort(), ["cloudBundle", "evidenceBundle", "imageLock", "releaseManifest"]);
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
      return { artifactsChanged: ["evidenceBundle"] };
    }
    return { artifactsChanged: [] };
  };
  const result = await runRelease({ ...input, targetState: "LIGHTHOUSE_RETIRED", authorities: allAuthorities, executor, now: fixedNow });
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
  const executor = async context => {
    if (context.targetState === "INFRA_READY" && failApply) {
      failApply = false;
      throw new Error("provider token=do-not-persist");
    }
    return { artifactsChanged: [] };
  };
  const failed = await runRelease({ ...input, targetState: "INFRA_READY", authorities: allAuthorities, executor, now: fixedNow });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.checkpoint.failure.resumeState, "INFRA_READY");
  assert.match(failed.checkpoint.failure.message, /token=\[REDACTED\]/);
  assert.doesNotMatch(failed.checkpoint.failure.message, /do-not-persist/);
  await assert.rejects(advanceRelease({ ...input, targetState: "INFRA_READY", authorities: allAuthorities }), /must use resumeRelease/);
  const resumed = await resumeRelease({ ...input, authorities: allAuthorities, executor, now: fixedNow });
  assert.equal(resumed.status, "INFRA_READY");
  assert.equal(resumed.checkpoint.currentState, "INFRA_READY");
  assert.equal(resumed.checkpoint.failure, undefined);
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
  const executor = async () => {
    const checkpoint = JSON.parse(readFileSync(input.files.checkpoint, "utf8"));
    checkpoint.revision += 1;
    writeJson(input.files.checkpoint, checkpoint);
    return { artifactsChanged: [] };
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
  const executor = async () => ({ artifactsChanged: [] });
  const beforeDeploy = fixture();
  await runRelease({ ...beforeDeploy, targetState: "INFRA_READY", authorities: allAuthorities, executor, now: fixedNow });
  await assert.rejects(rollbackRelease({ ...beforeDeploy, now: fixedNow }), /rollback is not legal from INFRA_READY/);

  const deployed = fixture();
  await runRelease({ ...deployed, targetState: "DEPLOYED_NO_TRAFFIC", authorities: allAuthorities, executor, now: fixedNow });
  const rolledBack = await rollbackRelease({ ...deployed, executor, now: fixedNow });
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
});

test("rejects credential-like material even when an artifact remains schema-valid", () => {
  const input = fixture();
  const manifest = JSON.parse(readFileSync(input.files.manifest, "utf8"));
  manifest.owners.release = "token=credential-like-value";
  writeJson(input.files.manifest, manifest);
  assert.throws(() => prepareRelease({ ...input, now: fixedNow }), /contains credential-like material/);
});
