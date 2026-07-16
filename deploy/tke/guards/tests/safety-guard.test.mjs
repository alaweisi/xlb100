import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSafetyEvidence, runSafetyGuard } from "../safety-guard.mjs";

const releaseId = "release-20260716-001";
const now = new Date("2026-07-16T08:25:00.000Z");

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixture() {
  const artifactRoot = mkdtempSync(path.join(tmpdir(), "xlb-tke-guard-"));
  const releaseRoot = path.join(artifactRoot, ".artifacts", "tke", "releases", releaseId);
  const refs = {
    restore: `.artifacts/tke/releases/${releaseId}/evidence/restore-drill.json`,
    jobs: `.artifacts/tke/releases/${releaseId}/evidence/jobs-lease.json`,
    rollback: `.artifacts/tke/releases/${releaseId}/evidence/rollback-readiness.json`,
    migration: `.artifacts/tke/releases/${releaseId}/evidence/migration.json`,
    rollbackExecution: `.artifacts/tke/releases/${releaseId}/evidence/rollback.json`,
  };
  for (const reference of Object.values(refs)) {
    writeJson(path.join(artifactRoot, reference), { synthetic: true, reference });
  }
  const manifest = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    executionMode: "gated-release",
    sourceCommit: "a".repeat(40),
    createdAt: "2026-07-16T08:00:00Z",
    owners: { release: "release-owner", data: "data-owner", onCall: "oncall-owner", cost: "cost-owner" },
    changeWindow: { startsAt: "2026-07-18T01:00:00Z", endsAt: "2026-07-18T05:00:00Z", timezone: "Asia/Shanghai" },
    imageLockFile: `.artifacts/tke/releases/${releaseId}/images.lock.json`,
    cloudBundleFile: ".artifacts/tke/production/cloud-bundle.json",
    evidenceFile: `.artifacts/tke/releases/${releaseId}/evidence.json`,
    checkpointFile: `.artifacts/tke/releases/${releaseId}/checkpoint.json`,
    trafficProvider: "clb",
  };
  const input = {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    phase: "PRE_MIGRATION",
    policy: {
      backupMaxAgeHours: 24,
      restoreDrillMaxAgeHours: 720,
      jobsObservationMaxAgeMinutes: 5,
      rollbackReviewMaxAgeHours: 24,
    },
    backup: {
      backupId: "backup-20260716-001",
      createdAt: "2026-07-16T06:00:00Z",
      verifiedAt: "2026-07-16T07:00:00Z",
      restoreDrill: { performedAt: "2026-07-15T06:00:00Z", result: "PASS", evidenceRef: refs.restore },
    },
    jobsSingleActive: {
      lighthouseState: "ACTIVE",
      tkeState: "STOPPED",
      activeSide: "LIGHTHOUSE",
      leaseBackend: "redis",
      leaseOwner: "lighthouse-jobs-release-20260716-001",
      expectedLeaseOwner: "lighthouse-jobs-release-20260716-001",
      fencingToken: 41,
      previousFencingToken: 40,
      observedAt: "2026-07-16T08:24:00Z",
      leaseExpiresAt: "2026-07-16T08:30:00Z",
      evidenceRef: refs.jobs,
    },
    migration: { plannedRunId: "migration-20260716-001", conflictingRunIds: [] },
    rollbackReadiness: { reviewedAt: "2026-07-16T08:00:00Z", result: "PASS", evidenceRef: refs.rollback },
  };
  return {
    artifactRoot,
    releaseRoot,
    refs,
    manifest,
    input,
    cleanup: () => rmSync(artifactRoot, { recursive: true, force: true }),
  };
}

function withFixture(run) {
  const value = fixture();
  try { return run(value); } finally { value.cleanup(); }
}

test("PRE_MIGRATION produces the frozen evidence contract and hash report", () => withFixture(({ artifactRoot, manifest, input }) => {
  const result = buildSafetyEvidence({ manifest, input, now, artifactRoot });
  assert.equal(result.report.guardStatus, "PASS_OFFLINE_EVIDENCE");
  assert.equal(result.report.authorityGranted, false);
  assert.equal(result.evidence.jobsSingleActive.lighthouseState, "ACTIVE");
  assert.equal(Object.keys(result.report.evidenceHashes).length, 3);
}));

test("POST_SWITCH accepts only TKE ownership with successful migration evidence", () => withFixture(({ artifactRoot, refs, manifest, input }) => {
  input.phase = "POST_SWITCH";
  input.jobsSingleActive = {
    ...input.jobsSingleActive,
    lighthouseState: "STOPPED",
    tkeState: "ACTIVE",
    activeSide: "TKE",
    leaseOwner: "tke-jobs-release-20260716-001",
    expectedLeaseOwner: "tke-jobs-release-20260716-001",
    fencingToken: 42,
    previousFencingToken: 41,
  };
  input.migration.execution = {
    runId: input.migration.plannedRunId,
    completedAt: "2026-07-16T08:15:00Z",
    result: "PASS",
    evidenceRef: refs.migration,
  };
  const result = buildSafetyEvidence({ manifest, input, now, artifactRoot });
  assert.equal(result.evidence.jobsSingleActive.tkeState, "ACTIVE");
  assert.equal(result.evidence.migration.result, "PASS");
}));

test("blocks Lighthouse and TKE double-active evidence", () => withFixture(({ artifactRoot, manifest, input }) => {
  input.jobsSingleActive.tkeState = "ACTIVE";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /never both be ACTIVE/);
}));

test("blocks expired Redis lease and stale observations", () => withFixture(({ artifactRoot, manifest, input }) => {
  input.jobsSingleActive.leaseExpiresAt = "2026-07-16T08:24:59Z";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /lease evidence is expired/);
  input.jobsSingleActive.leaseExpiresAt = "2026-07-16T08:30:00Z";
  input.jobsSingleActive.observedAt = "2026-07-16T08:00:00Z";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /observedAt is stale/);
}));

test("blocks wrong lease owner and non-advancing fencing token", () => withFixture(({ artifactRoot, manifest, input }) => {
  input.jobsSingleActive.leaseOwner = "unexpected-owner";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /lease owner/);
  input.jobsSingleActive.leaseOwner = input.jobsSingleActive.expectedLeaseOwner;
  input.jobsSingleActive.fencingToken = input.jobsSingleActive.previousFencingToken;
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /advance monotonically/);
}));

test("blocks stale backup, stale restore drill, and missing evidence files", () => withFixture(({ artifactRoot, manifest, input }) => {
  input.backup.createdAt = "2026-07-14T06:00:00Z";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /backup.createdAt is stale/);
  input.backup.createdAt = "2026-07-16T06:00:00Z";
  input.backup.restoreDrill.performedAt = "2026-05-01T06:00:00Z";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /restoreDrill.performedAt is stale/);
  input.backup.restoreDrill.performedAt = "2026-07-15T06:00:00Z";
  input.backup.restoreDrill.evidenceRef = `.artifacts/tke/releases/${releaseId}/evidence/missing.json`;
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /does not exist/);
}));

test("blocks reused or mismatched migration run IDs", () => withFixture(({ artifactRoot, refs, manifest, input }) => {
  input.migration.conflictingRunIds = [input.migration.plannedRunId];
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /already present/);
  input.migration.conflictingRunIds = [];
  input.phase = "POST_MIGRATION";
  input.migration.execution = {
    runId: "migration-another-run",
    completedAt: "2026-07-16T08:15:00Z",
    result: "PASS",
    evidenceRef: refs.migration,
  };
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /differs from plannedRunId/);
}));

test("POST_ROLLBACK requires successful rollback execution and Lighthouse fencing", () => withFixture(({ artifactRoot, refs, manifest, input }) => {
  input.phase = "POST_ROLLBACK";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /requires rollback execution/);
  input.rollbackReadiness.execution = {
    runId: "rollback-20260716-001",
    completedAt: "2026-07-16T08:20:00Z",
    result: "PASS",
    evidenceRef: refs.rollbackExecution,
  };
  const result = buildSafetyEvidence({ manifest, input, now, artifactRoot });
  assert.equal(result.evidence.rollback.result, "PASS");
}));

test("blocks credential fields and cross-release drift", () => withFixture(({ artifactRoot, manifest, input }) => {
  input.jobsSingleActive.password = "forbidden";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /schema validation failed|credential/);
  delete input.jobsSingleActive.password;
  input.releaseId = "release-20260716-002";
  assert.throws(() => buildSafetyEvidence({ manifest, input, now, artifactRoot }), /does not match release manifest/);
}));

test("CLI runner writes evidence only to the manifest path and keeps authority false", () => withFixture(({ artifactRoot, releaseRoot, manifest, input }) => {
  const manifestFile = path.join(releaseRoot, "release-manifest.json");
  const inputFile = path.join(releaseRoot, "guard-input.json");
  const outputFile = path.join(releaseRoot, "evidence.json");
  const reportFile = path.join(releaseRoot, "guard-report.json");
  writeJson(manifestFile, manifest);
  writeJson(inputFile, input);
  runSafetyGuard({ manifestFile, inputFile, outputFile, reportFile, now, artifactRoot });
  assert.equal(JSON.parse(readFileSync(outputFile, "utf8")).releaseId, releaseId);
  assert.equal(JSON.parse(readFileSync(reportFile, "utf8")).authorityGranted, false);
  assert.throws(() => runSafetyGuard({
    manifestFile,
    inputFile,
    outputFile: path.join(releaseRoot, "wrong.json"),
    reportFile,
    now,
    artifactRoot,
  }), /must equal releaseManifest.evidenceFile/);
}));
