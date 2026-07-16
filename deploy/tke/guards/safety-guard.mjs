import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { validateContract, validateEvidenceSemantics } from "../../../scripts/check-tke-release-contracts.mjs";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const inputSchemaFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "guard-input.schema.json");
const forbiddenKeys = /^(?:password|passwd|secret|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKeyId|accessKeySecret|authorizations)$/i;
const placeholder = /(?:^|[-_.])(todo|tbd|changeme|placeholder|example)(?:$|[-_.])/i;
const futureClockSkewMs = 5 * 60 * 1000;

const fail = message => { throw new Error(message); };
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const sha256 = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const asTime = (value, label) => {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail(`${label} must be a valid UTC timestamp`);
  return result;
};

function scanForbidden(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanForbidden(child, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.test(key)) fail(`${location}.${key} is a forbidden credential or persisted authorization field`);
      scanForbidden(child, `${location}.${key}`);
    }
  }
}

function validateInputSchema(input) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson(inputSchemaFile));
  if (!validate(input)) {
    const details = validate.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ");
    fail(`safety guard input schema validation failed: ${details}`);
  }
  scanForbidden(input);
}

function resolveArtifact(root, reference, label) {
  if (typeof reference !== "string" || !reference.startsWith(".artifacts/tke/")) {
    fail(`${label} must remain below .artifacts/tke`);
  }
  const artifactRoot = path.resolve(root, ".artifacts", "tke");
  const resolved = path.resolve(root, reference.replaceAll("/", path.sep));
  if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
    fail(`${label} escapes the ignored artifact root`);
  }
  return resolved;
}

function requireExistingEvidence(root, reference, label, hashes) {
  const resolved = resolveArtifact(root, reference, label);
  if (!existsSync(resolved)) fail(`${label} does not exist: ${reference}`);
  hashes[reference] = sha256(resolved);
}

function assertNotFuture(time, now, label) {
  if (time > now + futureClockSkewMs) fail(`${label} is in the future`);
}

function assertFresh(time, now, maximumMs, label) {
  assertNotFuture(time, now, label);
  if (now - time > maximumMs) fail(`${label} is stale`);
}

function validateBackup(input, now, hashes, root) {
  const { backup, policy } = input;
  if (placeholder.test(backup.backupId)) fail("backup.backupId contains a placeholder");
  const createdAt = asTime(backup.createdAt, "backup.createdAt");
  const verifiedAt = asTime(backup.verifiedAt, "backup.verifiedAt");
  if (verifiedAt < createdAt) fail("backup.verifiedAt must not precede backup.createdAt");
  assertFresh(createdAt, now, policy.backupMaxAgeHours * 3_600_000, "backup.createdAt");
  assertNotFuture(verifiedAt, now, "backup.verifiedAt");

  const drillAt = asTime(backup.restoreDrill.performedAt, "backup.restoreDrill.performedAt");
  assertFresh(drillAt, now, policy.restoreDrillMaxAgeHours * 3_600_000, "backup.restoreDrill.performedAt");
  requireExistingEvidence(root, backup.restoreDrill.evidenceRef, "backup.restoreDrill.evidenceRef", hashes);
}

function validateJobs(input, now, hashes, root) {
  const jobs = input.jobsSingleActive;
  if (jobs.lighthouseState === "ACTIVE" && jobs.tkeState === "ACTIVE") {
    fail("Lighthouse and TKE jobs must never both be ACTIVE");
  }
  if (jobs.lighthouseState === "STOPPED" && jobs.tkeState === "STOPPED") {
    fail("jobs handoff evidence must identify exactly one ACTIVE side");
  }
  const expectedSide = ["PRE_MIGRATION", "POST_MIGRATION"].includes(input.phase) ? "LIGHTHOUSE"
    : input.phase === "POST_SWITCH" ? "TKE"
      : "LIGHTHOUSE";
  if (jobs.activeSide !== expectedSide) fail(`${input.phase} requires ${expectedSide} jobs to be active`);
  if (expectedSide === "LIGHTHOUSE" && (jobs.lighthouseState !== "ACTIVE" || jobs.tkeState !== "STOPPED")) {
    fail(`${input.phase} requires Lighthouse ACTIVE and TKE STOPPED`);
  }
  if (expectedSide === "TKE" && (jobs.lighthouseState !== "STOPPED" || jobs.tkeState !== "ACTIVE")) {
    fail(`${input.phase} requires Lighthouse STOPPED and TKE ACTIVE`);
  }
  if (jobs.leaseOwner !== jobs.expectedLeaseOwner) fail("jobs lease owner does not match the expected owner");
  if (jobs.fencingToken <= jobs.previousFencingToken) fail("jobs fencing token must advance monotonically");
  const observedAt = asTime(jobs.observedAt, "jobsSingleActive.observedAt");
  const expiresAt = asTime(jobs.leaseExpiresAt, "jobsSingleActive.leaseExpiresAt");
  assertFresh(observedAt, now, input.policy.jobsObservationMaxAgeMinutes * 60_000, "jobsSingleActive.observedAt");
  if (expiresAt <= now) fail("jobs lease evidence is expired");
  if (expiresAt <= observedAt) fail("jobs lease must expire after it was observed");
  requireExistingEvidence(root, jobs.evidenceRef, "jobsSingleActive.evidenceRef", hashes);
}

function validateMigration(input, now, hashes, root) {
  const migration = input.migration;
  if (migration.conflictingRunIds.includes(migration.plannedRunId)) {
    fail("migration plannedRunId is already present in conflictingRunIds");
  }
  const executionRequired = ["POST_MIGRATION", "POST_SWITCH"].includes(input.phase);
  if (executionRequired && !migration.execution) fail(`${input.phase} requires migration execution evidence`);
  if (!migration.execution) return;
  if (migration.execution.runId !== migration.plannedRunId) fail("migration execution runId differs from plannedRunId");
  assertNotFuture(asTime(migration.execution.completedAt, "migration.execution.completedAt"), now, "migration.execution.completedAt");
  requireExistingEvidence(root, migration.execution.evidenceRef, "migration.execution.evidenceRef", hashes);
}

function validateRollback(input, now, hashes, root) {
  const rollback = input.rollbackReadiness;
  assertFresh(
    asTime(rollback.reviewedAt, "rollbackReadiness.reviewedAt"),
    now,
    input.policy.rollbackReviewMaxAgeHours * 3_600_000,
    "rollbackReadiness.reviewedAt",
  );
  requireExistingEvidence(root, rollback.evidenceRef, "rollbackReadiness.evidenceRef", hashes);
  if (input.phase === "POST_ROLLBACK" && !rollback.execution) fail("POST_ROLLBACK requires rollback execution evidence");
  if (!rollback.execution) return;
  assertNotFuture(asTime(rollback.execution.completedAt, "rollbackReadiness.execution.completedAt"), now, "rollbackReadiness.execution.completedAt");
  requireExistingEvidence(root, rollback.execution.evidenceRef, "rollbackReadiness.execution.evidenceRef", hashes);
}

export function buildSafetyEvidence({ manifest, input, now = new Date(), artifactRoot = defaultRepoRoot }) {
  validateContract("releaseManifest", manifest);
  validateInputSchema(input);
  if (input.releaseId !== manifest.releaseId) fail("guard input releaseId does not match release manifest");
  if (input.environment !== manifest.environment) fail("guard input environment does not match release manifest");
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) fail("guard evaluation time is invalid");
  const hashes = {};
  validateBackup(input, nowMs, hashes, artifactRoot);
  validateJobs(input, nowMs, hashes, artifactRoot);
  validateMigration(input, nowMs, hashes, artifactRoot);
  validateRollback(input, nowMs, hashes, artifactRoot);

  const evidence = {
    schemaVersion: 1,
    releaseId: input.releaseId,
    environment: input.environment,
    updatedAt: now.toISOString(),
    backup: input.backup,
    jobsSingleActive: {
      lighthouseState: input.jobsSingleActive.lighthouseState,
      tkeState: input.jobsSingleActive.tkeState,
      leaseOwner: input.jobsSingleActive.leaseOwner,
      fencingToken: input.jobsSingleActive.fencingToken,
      observedAt: input.jobsSingleActive.observedAt,
      evidenceRef: input.jobsSingleActive.evidenceRef,
    },
    ...(input.migration.execution ? { migration: input.migration.execution } : {}),
    ...(input.rollbackReadiness.execution ? { rollback: input.rollbackReadiness.execution } : {}),
    trafficObservations: [],
  };
  validateEvidenceSemantics(evidence);
  return {
    evidence,
    report: {
      schemaVersion: 1,
      guardStatus: "PASS_OFFLINE_EVIDENCE",
      releaseId: input.releaseId,
      environment: input.environment,
      phase: input.phase,
      evaluatedAt: now.toISOString(),
      checks: {
        backupFresh: true,
        restoreDrillPassed: true,
        jobsExactlyOneActive: true,
        redisLeaseFresh: true,
        fencingTokenAdvanced: true,
        migrationRunIdUnique: true,
        migrationEvidencePassed: input.migration.execution !== undefined,
        rollbackEvidencePassed: true,
      },
      evidenceHashes: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))),
      authorityGranted: false,
    },
  };
}

function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) fail("arguments must be --name value pairs");
    values[name.slice(2)] = value;
  }
  for (const required of ["manifest", "input", "output", "report"]) {
    if (!values[required]) fail(`missing --${required}`);
  }
  return values;
}

export function runSafetyGuard({ manifestFile, inputFile, outputFile, reportFile, now = new Date(), artifactRoot = defaultRepoRoot }) {
  for (const [label, file] of Object.entries({ manifestFile, inputFile, outputFile, reportFile })) {
    resolveArtifact(artifactRoot, path.relative(artifactRoot, path.resolve(file)).replaceAll(path.sep, "/"), label);
  }
  const manifest = readJson(manifestFile);
  const expectedOutput = resolveArtifact(artifactRoot, manifest.evidenceFile, "releaseManifest.evidenceFile");
  if (path.resolve(outputFile) !== expectedOutput) fail("--output must equal releaseManifest.evidenceFile");
  const result = buildSafetyEvidence({ manifest, input: readJson(inputFile), now, artifactRoot });
  atomicWriteJson(outputFile, result.evidence);
  atomicWriteJson(reportFile, result.report);
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const resolve = value => path.resolve(defaultRepoRoot, value);
    const result = runSafetyGuard({
      manifestFile: resolve(args.manifest),
      inputFile: resolve(args.input),
      outputFile: resolve(args.output),
      reportFile: resolve(args.report),
      now: args.now ? new Date(args.now) : new Date(),
    });
    console.log(`tke-safety-guard: ${result.report.guardStatus} for ${result.report.releaseId} (${result.report.phase}); no external authority granted`);
  } catch (error) {
    console.error(`tke-safety-guard: BLOCKED - ${error.message}`);
    process.exitCode = 1;
  }
}
