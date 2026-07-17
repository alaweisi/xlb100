import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(sourceRoot, "../../..");
const defaultContractRoot = path.resolve(sourceRoot, "../contracts");
const providerReceiptMaxAgeMs = 15 * 60 * 1000;
const evidenceFreshness = Object.freeze({
  backupMs: 24 * 60 * 60 * 1000,
  restoreDrillMs: 30 * 24 * 60 * 60 * 1000,
  jobsMs: 15 * 60 * 1000,
  executionMs: 24 * 60 * 60 * 1000,
  trafficMs: 30 * 60 * 1000,
});

export const FORWARD_STATES = Object.freeze([
  "PREPARED",
  "ARTIFACTS_READY",
  "PLAN_REVIEWED",
  "INFRA_READY",
  "DEPLOYED_NO_TRAFFIC",
  "BACKUP_VERIFIED",
  "MIGRATED",
  "SMOKE_PASS",
  "JOBS_SWITCHED",
  "TRAFFIC_5",
  "TRAFFIC_25",
  "TRAFFIC_50",
  "TRAFFIC_100",
  "OBSERVED",
  "LIGHTHOUSE_RETIRED",
]);

export const TERMINAL_STATES = Object.freeze(["LIGHTHOUSE_RETIRED", "ROLLED_BACK"]);

const stageForState = Object.freeze({
  PLAN_REVIEWED: "PLAN_INFRASTRUCTURE",
  INFRA_READY: "APPLY_INFRASTRUCTURE",
  DEPLOYED_NO_TRAFFIC: "DEPLOY_NO_TRAFFIC",
  BACKUP_VERIFIED: "VERIFY_BACKUP",
  MIGRATED: "MIGRATE_DATA",
  SMOKE_PASS: "SMOKE",
  JOBS_SWITCHED: "SWITCH_JOBS",
  TRAFFIC_5: "TRAFFIC_5",
  TRAFFIC_25: "TRAFFIC_25",
  TRAFFIC_50: "TRAFFIC_50",
  TRAFFIC_100: "TRAFFIC_100",
  OBSERVED: "OBSERVE",
  LIGHTHOUSE_RETIRED: "RETIRE_LIGHTHOUSE",
});

const authorityForState = Object.freeze({
  PLAN_REVIEWED: "terraformPlan",
  INFRA_READY: "terraformApply",
  DEPLOYED_NO_TRAFFIC: "cloudDeploy",
  MIGRATED: "dataMigration",
  TRAFFIC_5: "trafficCutover",
  TRAFFIC_25: "trafficCutover",
  TRAFFIC_50: "trafficCutover",
  TRAFFIC_100: "trafficCutover",
  LIGHTHOUSE_RETIRED: "lighthouseRetirement",
});

export const RUNTIME_AUTHORITIES = Object.freeze([
  "terraformPlan",
  "terraformApply",
  "cloudDeploy",
  "dataMigration",
  "trafficCutover",
  "lighthouseRetirement",
]);

const artifactDefinitions = Object.freeze({
  releaseManifest: { schema: "release-manifest.schema.json" },
  imageLock: { schema: "images-lock.schema.json", manifestKey: "imageLockFile" },
  cloudBundle: { schema: "cloud-bundle.schema.json", manifestKey: "cloudBundleFile" },
  evidenceBundle: { schema: "evidence-bundle.schema.json", manifestKey: "evidenceFile" },
});

const fail = message => {
  throw new Error(message);
};
const normalize = value => value.replaceAll("\\", "/");
const jsonLine = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256Content = value => createHash("sha256").update(value).digest("hex");
const sha256File = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const readJson = (file, label) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} must contain valid JSON`);
    throw error;
  }
};

function orchestrationError(message, { code = "ORCHESTRATION_BLOCKED", retryable = false } = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function isLeaseOrFenceLoss(error) {
  return ["LEASE_LOST", "FENCING_MISMATCH"].includes(error?.code);
}

function resolveArtifact(repoRoot, reference, label, { mustExist = true } = {}) {
  if (typeof reference !== "string" || !reference.startsWith(".artifacts/tke/")) {
    fail(`${label} must remain below .artifacts/tke/`);
  }
  const artifactRoot = path.resolve(repoRoot, ".artifacts", "tke");
  const resolved = path.resolve(repoRoot, reference.replaceAll("/", path.sep));
  if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
    fail(`${label} escapes .artifacts/tke/`);
  }
  if (mustExist && !existsSync(resolved)) fail(`${label} not found: ${reference}`);
  return { absolute: resolved, relative: normalize(path.relative(repoRoot, resolved)) };
}

function requireArtifactFile(repoRoot, reference, label, hashes, hashKey) {
  const resolved = resolveArtifact(repoRoot, reference, label);
  if (readFileSync(resolved.absolute).length === 0) fail(`${label} must not be empty`);
  hashes[hashKey] = sha256File(resolved.absolute);
  return resolved;
}

function assertFreshTimestamp(value, now, maximumAgeMs, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} must be a valid timestamp`);
  if (timestamp > now.getTime() + 5 * 60 * 1000) fail(`${label} is in the future`);
  if (now.getTime() - timestamp > maximumAgeMs) fail(`${label} is stale`);
}

function asClockDate(value) {
  const result = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(result.getTime())) fail("runtime clock returned an invalid timestamp");
  return result;
}

function artifactReference(repoRoot, file, label) {
  const absolute = path.resolve(file);
  const relative = normalize(path.relative(repoRoot, absolute));
  return resolveArtifact(repoRoot, relative, label).relative;
}

function compileValidators(contractRoot) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validators = {};
  for (const [name, definition] of Object.entries(artifactDefinitions)) {
    validators[name] = ajv.compile(readJson(path.join(contractRoot, definition.schema), definition.schema));
  }
  validators.checkpoint = ajv.compile(readJson(path.join(contractRoot, "checkpoint.schema.json"), "checkpoint.schema.json"));
  return validators;
}

function assertSchema(validate, value, label) {
  if (validate(value)) return;
  const details = validate.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ");
  fail(`${label} schema validation failed: ${details}`);
}

function assertNoSensitiveMaterial(value, label, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoSensitiveMaterial(child, label, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:password|passwd|secret|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKey|accessKeyId|accessKeySecret|authority|authorities|approval|approvals)$/i.test(key)) {
        fail(`${label} ${location}.${key} is forbidden sensitive or persisted authority material`);
      }
      assertNoSensitiveMaterial(child, label, `${location}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:^|\W)AKID[A-Za-z0-9]{12,}(?:$|\W)|\bbearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:password|secret|token|credential)\s*[=:]\s*(?!\[REDACTED\])\S+/i.test(value)) {
    fail(`${label} ${location} contains credential-like material`);
  }
}

function assertCrossContractConsistency(bundle, simulation) {
  const { manifest, imageLock, cloudBundle, evidenceBundle } = bundle;
  if (imageLock.releaseId !== manifest.releaseId) fail("image lock releaseId drifted from release manifest");
  if (imageLock.sourceCommit !== manifest.sourceCommit) fail("image lock sourceCommit drifted from release manifest");
  if (cloudBundle.environment !== manifest.environment) fail("cloud bundle environment drifted from release manifest");
  if (evidenceBundle.releaseId !== manifest.releaseId) fail("evidence releaseId drifted from release manifest");
  if (evidenceBundle.environment !== manifest.environment) fail("evidence environment drifted from release manifest");
  if (cloudBundle.files.imageLockFile !== manifest.imageLockFile) fail("cloud bundle image lock reference drifted from release manifest");
  if (Date.parse(manifest.changeWindow.endsAt) <= Date.parse(manifest.changeWindow.startsAt)) {
    fail("release change window must end after it starts");
  }
  const releasePrefix = simulation
    ? `.artifacts/tke/simulations/${manifest.releaseId}/`
    : `.artifacts/tke/releases/${manifest.releaseId}/`;
  for (const [label, reference] of [
    ["imageLockFile", manifest.imageLockFile],
    ["evidenceFile", manifest.evidenceFile],
    ["checkpointFile", manifest.checkpointFile],
  ]) {
    if (!reference.startsWith(releasePrefix)) fail(`release manifest ${label} must stay within its release ID directory`);
  }
  for (const [component, image] of Object.entries(imageLock.images)) {
    if (!image.sbomFile.startsWith(releasePrefix) || !image.scanEvidenceFile.startsWith(releasePrefix)) {
      fail(`${component} SBOM and scan evidence must stay within the release ID directory`);
    }
  }
  for (const [label, reference] of collectEvidenceReferences(evidenceBundle)) {
    if (!reference.startsWith(releasePrefix)) fail(`${label} evidence must stay within the release ID directory`);
  }
}

function collectEvidenceReferences(evidence) {
  const entries = [
    ["backup.restoreDrill", evidence.backup.restoreDrill.evidenceRef],
    ["jobsSingleActive", evidence.jobsSingleActive.evidenceRef],
  ];
  for (const name of ["migration", "smoke", "rollback"]) {
    if (evidence[name]?.evidenceRef) entries.push([name, evidence[name].evidenceRef]);
  }
  for (const observation of evidence.trafficObservations ?? []) {
    entries.push([`traffic.${observation.weight}`, observation.evidenceRef]);
  }
  return entries;
}

const artifactFailureStages = new Set(["IMAGES_PUBLISHED", "CLOUD_BUNDLE_READY", "SAFETY_CONTRACT_READY"]);

function artifactStage(stage, callback) {
  try {
    return callback();
  } catch (error) {
    error.failedStage = stage;
    throw error;
  }
}

function validatePayloadFiles(bundle, repoRoot) {
  const hashes = bundle.hashes;
  artifactStage("IMAGES_PUBLISHED", () => {
    for (const [component, image] of Object.entries(bundle.imageLock.images)) {
      const sbom = requireArtifactFile(repoRoot, image.sbomFile, `${component} SBOM`, hashes, `image.${component}.sbom`);
      const scan = requireArtifactFile(repoRoot, image.scanEvidenceFile, `${component} scan evidence`, hashes, `image.${component}.scan`);
      readJson(sbom.absolute, `${component} SBOM`);
      readJson(scan.absolute, `${component} scan evidence`);
    }
  });

  artifactStage("CLOUD_BUNDLE_READY", () => {
  const cloudDirectory = path.dirname(bundle.paths.cloudBundle.absolute);
  const inventoryFile = path.join(cloudDirectory, "bundle-files.json");
  const digestFile = path.join(cloudDirectory, "bundle.sha256");
  if (!existsSync(inventoryFile) || !existsSync(digestFile)) fail("cloud bundle payload inventory or bundle.sha256 is missing");
  const inventory = readJson(inventoryFile, "cloud bundle payload inventory");
  if (inventory.releaseId !== bundle.manifest.releaseId || inventory.sourceCommit !== bundle.manifest.sourceCommit) {
    fail("cloud bundle payload inventory drifted from release identity");
  }
  if (inventory.environment !== bundle.manifest.environment || inventory.bundleSha256 !== bundle.cloudBundle.bundleSha256) {
    fail("cloud bundle payload inventory drifted from cloud bundle");
  }
  if (!Array.isArray(inventory.files) || inventory.files.length < 4) fail("cloud bundle payload inventory is incomplete");
  const expectedPayloads = new Set([
    bundle.cloudBundle.files.terraformVarFile,
    bundle.cloudBundle.files.backendConfig,
    bundle.cloudBundle.files.valuesFile,
    bundle.cloudBundle.files.imageLockFile,
  ]);
  for (const item of inventory.files) {
    if (!item || typeof item.file !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) {
      fail("cloud bundle payload inventory contains an invalid entry");
    }
    const resolved = requireArtifactFile(repoRoot, item.file, `cloud payload ${item.file}`, hashes, `cloudPayload.${item.file}`);
    if (sha256File(resolved.absolute) !== item.sha256) fail(`cloud payload hash mismatch: ${item.file}`);
    expectedPayloads.delete(item.file);
  }
  if (expectedPayloads.size) fail(`cloud bundle payload inventory is missing: ${[...expectedPayloads].join(", ")}`);
  const { bundleSha256: ignoredBundleDigest, ...cloudManifestCore } = bundle.cloudBundle;
  const computedBundleDigest = sha256Content(JSON.stringify({
    releaseId: bundle.manifest.releaseId,
    sourceCommit: bundle.manifest.sourceCommit,
    cloudBundle: cloudManifestCore,
    payloadFiles: inventory.files,
  }));
  if (computedBundleDigest !== bundle.cloudBundle.bundleSha256) fail("cloud bundle semantic digest mismatch");
  if (readFileSync(digestFile, "utf8").trim() !== bundle.cloudBundle.bundleSha256) fail("bundle.sha256 drifted from cloud bundle");
  hashes.cloudPayloadInventory = sha256File(inventoryFile);
  hashes.cloudPayloadDigest = sha256File(digestFile);
  });

  artifactStage("SAFETY_CONTRACT_READY", () => {
  for (const [label, reference] of collectEvidenceReferences(bundle.evidenceBundle)) {
    requireArtifactFile(repoRoot, reference, `${label} evidenceRef`, hashes, `evidence.${label}`);
  }
  });

  const receiptDirectory = path.join(path.dirname(bundle.paths.releaseManifest.absolute), "receipts");
  if (!existsSync(receiptDirectory)) return;
  for (const name of readdirSync(receiptDirectory).filter(item => item.endsWith(".json")).sort()) {
    const receiptFile = path.join(receiptDirectory, name);
    const receipt = readJson(receiptFile, `provider receipt ${name}`);
    assertNoSensitiveMaterial(receipt, `provider receipt ${name}`);
    hashes[`providerReceipt.${name}`] = sha256File(receiptFile);
    if (receipt.evidenceRef) {
      requireArtifactFile(repoRoot, receipt.evidenceRef, `provider receipt ${name} evidenceRef`, hashes, `providerEvidence.${name}`);
    }
  }
}

function assertEvidenceForState(state, evidence, now) {
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("BACKUP_VERIFIED")) {
    if (evidence.backup.restoreDrill.result !== "PASS") fail(`${state} requires passing backup restore evidence`);
    assertFreshTimestamp(evidence.backup.verifiedAt, now, evidenceFreshness.backupMs, "backup.verifiedAt");
    assertFreshTimestamp(evidence.backup.restoreDrill.performedAt, now, evidenceFreshness.restoreDrillMs, "backup.restoreDrill.performedAt");
    assertFreshTimestamp(evidence.updatedAt, now, evidenceFreshness.backupMs, "evidence.updatedAt");
  }
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("MIGRATED")) {
    if (evidence.migration?.result !== "PASS") fail(`${state} requires passing migration evidence`);
    assertFreshTimestamp(evidence.migration.completedAt, now, evidenceFreshness.executionMs, "migration.completedAt");
  }
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("SMOKE_PASS")) {
    if (evidence.smoke?.result !== "PASS") fail(`${state} requires passing smoke evidence`);
    assertFreshTimestamp(evidence.smoke.completedAt, now, evidenceFreshness.executionMs, "smoke.completedAt");
  }
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("JOBS_SWITCHED")) {
    if (evidence.jobsSingleActive.lighthouseState !== "STOPPED" || evidence.jobsSingleActive.tkeState !== "ACTIVE") {
      fail(`${state} requires Lighthouse jobs STOPPED and TKE jobs ACTIVE`);
    }
    assertFreshTimestamp(evidence.jobsSingleActive.observedAt, now, evidenceFreshness.jobsMs, "jobsSingleActive.observedAt");
  }
  const expectedTraffic = {
    TRAFFIC_5: [5],
    TRAFFIC_25: [5, 25],
    TRAFFIC_50: [5, 25, 50],
    TRAFFIC_100: [5, 25, 50, 100],
    OBSERVED: [5, 25, 50, 100],
    LIGHTHOUSE_RETIRED: [5, 25, 50, 100],
  }[state];
  if (expectedTraffic) {
    const actual = evidence.trafficObservations ?? [];
    if (actual.length !== expectedTraffic.length || actual.some((item, index) => item.weight !== expectedTraffic[index] || item.result !== "PASS")) {
      fail(`${state} requires ordered passing traffic observations ${expectedTraffic.join("/")}`);
    }
    for (const observation of actual) {
      assertFreshTimestamp(observation.observedAt, now, evidenceFreshness.trafficMs, `traffic.${observation.weight}.observedAt`);
    }
  }
}

export function loadReleaseBundle({ repoRoot = defaultRepoRoot, contractRoot = defaultContractRoot, manifestFile, simulation = false, verifyPayloads = true }) {
  const validators = compileValidators(contractRoot);
  const manifestRef = artifactReference(repoRoot, manifestFile, "manifestFile");
  const paths = { releaseManifest: resolveArtifact(repoRoot, manifestRef, "manifestFile") };
  const manifest = readJson(paths.releaseManifest.absolute, "release manifest");
  assertSchema(validators.releaseManifest, manifest, "release manifest");
  assertNoSensitiveMaterial(manifest, "release manifest");
  const values = { releaseManifest: manifest };
  for (const [name, definition] of Object.entries(artifactDefinitions)) {
    if (name === "releaseManifest") continue;
    paths[name] = name === "cloudBundle"
      ? resolveArtifact(repoRoot, manifest[definition.manifestKey], "release manifest cloudBundleFile")
      : resolveArtifact(repoRoot, manifest[definition.manifestKey], `release manifest ${definition.manifestKey}`);
    values[name] = readJson(paths[name].absolute, name);
    assertSchema(validators[name], values[name], name);
    assertNoSensitiveMaterial(values[name], name);
  }
  const bundle = {
    repoRoot,
    manifest,
    imageLock: values.imageLock,
    cloudBundle: values.cloudBundle,
    evidenceBundle: values.evidenceBundle,
    paths,
    hashes: Object.fromEntries(Object.entries(paths).map(([name, item]) => [name, sha256File(item.absolute)])),
    validators,
  };
  const manifestRelative = paths.releaseManifest.relative;
  if (simulation) {
    const expected = `.artifacts/tke/simulations/${manifest.releaseId}/simulation-manifest.json`;
    if (manifestRelative !== expected) fail(`simulation manifest must be stored at ${expected}`);
    if (manifest.environment === "production") fail("production gated-release manifest cannot enter simulation");
    const markerFile = path.join(path.dirname(paths.releaseManifest.absolute), "simulation.json");
    const marker = readJson(markerFile, "simulation marker");
    if (marker?.schemaVersion !== 1 || marker?.simulation !== true || marker?.releaseId !== manifest.releaseId) {
      fail("simulation marker must persist simulation=true for the same release ID");
    }
    bundle.hashes["simulation=true"] = sha256File(markerFile);
  } else if (manifestRelative.startsWith(".artifacts/tke/simulations/")) {
    fail("simulation manifest cannot be used by a real release operation");
  }
  assertCrossContractConsistency(bundle, simulation);
  if (verifyPayloads) validatePayloadFiles(bundle, repoRoot);
  return bundle;
}

function assertCheckpointSafe(checkpoint) {
  const serialized = JSON.stringify(checkpoint);
  if (/"(?:authority|authorities|approval|approvals|credential|credentials|password|secret|token)"\s*:/i.test(serialized)) {
    fail("checkpoint must not persist runtime authority, approval, credential, or secret material");
  }
}

function assertCheckpointIdentity(checkpoint, bundle) {
  if (checkpoint.releaseId !== bundle.manifest.releaseId) fail("checkpoint releaseId drifted from release manifest");
  if (checkpoint.environment !== bundle.manifest.environment) fail("checkpoint environment drifted from release manifest");
}

function requiredStagesThrough(state) {
  const index = FORWARD_STATES.indexOf(state);
  if (index < 0) fail(`cannot derive stages for non-forward state ${state}`);
  const stages = ["PREPARE"];
  for (const forwardState of FORWARD_STATES.slice(1, index + 1)) {
    stages.push(...completedStagesForState(forwardState));
  }
  return stages;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertCheckpointSemantics(checkpoint) {
  if (FORWARD_STATES.includes(checkpoint.currentState)) {
    const expected = requiredStagesThrough(checkpoint.currentState);
    if (!sameArray(checkpoint.completedStages, expected)) {
      fail(`${checkpoint.currentState} checkpoint completedStages are not the exact legal prefix`);
    }
    if (checkpoint.failure) fail("forward checkpoint must not retain failure metadata");
    return;
  }
  if (checkpoint.currentState === "FAILED") {
    if (!checkpoint.failure) fail("FAILED checkpoint requires failure metadata");
    const resumeIndex = FORWARD_STATES.indexOf(checkpoint.failure.resumeState);
    if (resumeIndex < 1) fail("FAILED checkpoint resumeState has no legal predecessor");
    const predecessor = FORWARD_STATES[resumeIndex - 1];
    if (!sameArray(checkpoint.completedStages, requiredStagesThrough(predecessor))) {
      fail("FAILED checkpoint completedStages do not match the recorded resumeState predecessor");
    }
    const validFailedStages = checkpoint.failure.resumeState === "ARTIFACTS_READY"
      ? artifactFailureStages
      : new Set([stageForState[checkpoint.failure.resumeState]]);
    if (!validFailedStages.has(checkpoint.failure.failedStage)) {
      fail("FAILED checkpoint failedStage does not match resumeState");
    }
    return;
  }
  if (checkpoint.currentState === "ROLLED_BACK") {
    if (checkpoint.failure) fail("ROLLED_BACK checkpoint must not retain failure metadata");
    if (checkpoint.completedStages.at(-1) !== "ROLLBACK") fail("ROLLED_BACK checkpoint must end with ROLLBACK");
    const beforeRollback = checkpoint.completedStages.slice(0, -1);
    const eligible = FORWARD_STATES.slice(
      FORWARD_STATES.indexOf("DEPLOYED_NO_TRAFFIC"),
      FORWARD_STATES.indexOf("OBSERVED") + 1,
    );
    if (!eligible.some(state => sameArray(beforeRollback, requiredStagesThrough(state)))) {
      fail("ROLLED_BACK checkpoint does not originate from a legal rollback state");
    }
    return;
  }
  fail(`unsupported checkpoint state: ${checkpoint.currentState}`);
}

function assertHashes(checkpoint, bundle) {
  for (const [name, expected] of Object.entries(checkpoint.artifactHashes)) {
    if (!(name in bundle.hashes)) fail(`checkpoint contains unknown artifact hash: ${name}`);
    if (bundle.hashes[name] !== expected) fail(`${name} hash drift detected; stale resume is blocked`);
  }
  for (const name of Object.keys(bundle.hashes)) {
    if (!(name in checkpoint.artifactHashes)) fail(`checkpoint is missing ${name} hash`);
  }
}

function assertCheckpointSchema(validate, checkpoint, simulation) {
  assertSchema(validate, checkpoint, "checkpoint");
  if (simulation && !checkpoint.artifactHashes["simulation=true"]) {
    fail("simulation checkpoint must persist the simulation=true marker hash");
  }
  if (!simulation && checkpoint.artifactHashes["simulation=true"]) {
    fail("simulation checkpoint cannot be used by a real release operation");
  }
}

function readCheckpoint(bundle, simulation = false) {
  const corrected = resolveArtifact(bundle.repoRoot, bundle.manifest.checkpointFile, "release manifest checkpointFile", { mustExist: false });
  if (!existsSync(corrected.absolute)) return { checkpoint: undefined, checkpointPath: corrected };
  const checkpoint = readJson(corrected.absolute, "checkpoint");
  assertCheckpointSchema(bundle.validators.checkpoint, checkpoint, simulation);
  assertCheckpointSafe(checkpoint);
  assertCheckpointIdentity(checkpoint, bundle);
  assertCheckpointSemantics(checkpoint);
  return { checkpoint, checkpointPath: corrected };
}

function atomicWriteCheckpoint(file, checkpoint, expectedRevision, assertCommitOwner = () => {}) {
  assertCheckpointSafe(checkpoint);
  assertCommitOwner();
  if (existsSync(file)) {
    const disk = readJson(file, "checkpoint");
    if (disk.revision !== expectedRevision) fail(`checkpoint revision changed from ${expectedRevision} to ${disk.revision}; concurrent or stale write blocked`);
  } else if (expectedRevision !== 0) {
    fail("checkpoint disappeared before update; stale write blocked");
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, jsonLine(checkpoint), "utf8");
    assertCommitOwner();
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function atomicWriteJsonFile(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, jsonLine(value), "utf8");
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function leasePaths(checkpointFile) {
  const directory = `${checkpointFile}.release-lease`;
  return {
    directory,
    record: path.join(directory, "lease.json"),
    fence: `${checkpointFile}.release-fence.json`,
    commitGuard: `${checkpointFile}.release-commit-guard`,
  };
}

function withLeaseCommitGuard(paths, callback, guardOwner = {}) {
  const guardId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const recordFile = path.join(paths.commitGuard, "guard.json");
  const host = hostname();
  try {
    mkdirSync(paths.commitGuard);
    writeFileSync(recordFile, jsonLine({ schemaVersion: 1, guardId, hostname: host, processId: process.pid, ...guardOwner }), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw orchestrationError("release lease commit guard is held by another runner", { code: "RELEASE_LOCKED", retryable: true });
    }
    throw error;
  }
  const assertGuardOwned = () => {
    const current = readJson(recordFile, "release lease commit guard");
    if (current.guardId !== guardId || current.hostname !== host || current.processId !== process.pid) {
      throw orchestrationError("release lease commit guard ownership changed", { code: "LEASE_LOST" });
    }
  };
  try {
    assertGuardOwned();
    return callback(assertGuardOwned);
  } finally {
    try {
      const current = readJson(recordFile, "release lease commit guard");
      if (current.guardId === guardId) rmSync(paths.commitGuard, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function recoverExpiredCommitGuard(paths, expectedLease) {
  if (!existsSync(paths.commitGuard)) return;
  const guard = readJson(path.join(paths.commitGuard, "guard.json"), "release lease commit guard");
  const currentLease = readJson(paths.record, "release lease");
  if (currentLease.leaseId !== expectedLease.leaseId || currentLease.fencingToken !== expectedLease.fencingToken) {
    throw orchestrationError("release lease changed while recovering commit guard", { code: "RELEASE_LOCKED", retryable: true });
  }
  if (Date.parse(currentLease.expiresAt) > Date.now()) {
    throw orchestrationError("active release lease still owns the commit guard", { code: "RELEASE_LOCKED", retryable: true });
  }
  if (guard.hostname !== hostname() || !Number.isInteger(guard.processId) || guard.processId < 1) {
    throw orchestrationError("expired release commit guard owner cannot be proven dead on this host", { code: "RELEASE_LOCKED", retryable: true });
  }
  try {
    process.kill(guard.processId, 0);
    throw orchestrationError("expired release commit guard owner is still alive", { code: "RELEASE_LOCKED", retryable: true });
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  const quarantine = `${paths.commitGuard}.stale-${process.pid}-${Date.now()}`;
  renameSync(paths.commitGuard, quarantine);
  rmSync(quarantine, { recursive: true, force: true });
}

function recoverOrphanedCommitGuard(paths) {
  if (!existsSync(paths.commitGuard)) return;
  const guard = readJson(path.join(paths.commitGuard, "guard.json"), "orphaned release lease commit guard");
  if (guard.hostname !== hostname() || !Number.isInteger(guard.processId) || guard.processId < 1) {
    throw orchestrationError("orphaned release commit guard owner cannot be proven dead on this host", { code: "RELEASE_LOCKED", retryable: true });
  }
  try {
    process.kill(guard.processId, 0);
    throw orchestrationError("orphaned release commit guard owner is still alive", { code: "RELEASE_LOCKED", retryable: true });
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  const quarantine = `${paths.commitGuard}.orphaned-${process.pid}-${Date.now()}`;
  renameSync(paths.commitGuard, quarantine);
  rmSync(quarantine, { recursive: true, force: true });
}

function acquireReleaseLease(checkpointFile, releaseId, leaseDurationMs = 30_000, heartbeatEnabled = true) {
  const paths = leasePaths(checkpointFile);
  const create = (previousToken, heldGuardAssert) => {
    mkdirSync(paths.directory);
    try {
      if (heldGuardAssert) heldGuardAssert();
      else recoverOrphanedCommitGuard(paths);
    } catch (error) {
      rmSync(paths.directory, { recursive: true, force: true });
      throw error;
    }
    const leaseId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const owner = `runner-${process.pid}-${leaseId.slice(-8)}`;
    const fenceRecord = existsSync(paths.fence) ? readJson(paths.fence, "release fence") : undefined;
    if (fenceRecord && (fenceRecord.releaseId !== releaseId || !Number.isInteger(fenceRecord.lastFencingToken))) {
      throw orchestrationError("release fence record is invalid", { code: "FENCE_INVALID" });
    }
    const fencingToken = Math.max(previousToken ?? 0, fenceRecord?.lastFencingToken ?? 0) + 1;
    heldGuardAssert?.();
    atomicWriteJsonFile(paths.fence, { schemaVersion: 1, releaseId, lastFencingToken: fencingToken });
    heldGuardAssert?.();
    const record = () => ({
      schemaVersion: 1, releaseId, leaseId, owner, fencingToken, processId: process.pid,
      expiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
    });
    writeFileSync(paths.record, jsonLine(record()), { encoding: "utf8", flag: "wx" });
    let heartbeatError;
    const assertOwned = () => {
      if (heartbeatError) throw heartbeatError;
      let current;
      let fence;
      try {
        current = readJson(paths.record, "release lease");
        fence = readJson(paths.fence, "release fence");
      } catch {
        throw orchestrationError("release lease ownership record disappeared or became unreadable", { code: "LEASE_LOST" });
      }
      if (current.leaseId !== leaseId || current.owner !== owner || current.fencingToken !== fencingToken) {
        throw orchestrationError("release lease ownership changed", { code: "LEASE_LOST" });
      }
      if (fence.releaseId !== releaseId || fence.lastFencingToken !== fencingToken) {
        throw orchestrationError("release fencing token is no longer current", { code: "LEASE_LOST" });
      }
      if (Date.parse(current.expiresAt) <= Date.now()) throw orchestrationError("release lease expired", { code: "LEASE_LOST" });
      return current;
    };
    const renewWithinGuard = (assertGuardOwned = () => {}) => {
      assertGuardOwned();
      assertOwned();
      const temporary = path.join(paths.directory, `lease.${leaseId}.tmp`);
      try {
        writeFileSync(temporary, jsonLine(record()), { encoding: "utf8", flag: "wx" });
        assertGuardOwned();
        assertOwned();
        renameSync(temporary, paths.record);
        assertGuardOwned();
        assertOwned();
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
    };
    const guardOwner = { releaseId, leaseId, owner, fencingToken };
    const renew = () => withLeaseCommitGuard(paths, assertGuardOwned => renewWithinGuard(assertGuardOwned), guardOwner);
    const heartbeat = heartbeatEnabled ? setInterval(() => {
      try { renew(); } catch (error) { heartbeatError = error; }
    }, Math.max(10, Math.floor(leaseDurationMs / 3))) : undefined;
    heartbeat?.unref();
    return {
      leaseId,
      owner,
      fencingToken,
      assertOwned,
      renew,
      commit(callback) {
        return withLeaseCommitGuard(paths, assertGuardOwned => {
          const assertCommitOwned = () => {
            assertGuardOwned();
            assertOwned();
          };
          renewWithinGuard(assertGuardOwned);
          assertCommitOwned();
          return callback({ assertOwned: assertCommitOwned, renew: () => renewWithinGuard(assertGuardOwned) });
        }, guardOwner);
      },
      release() {
        if (heartbeat) clearInterval(heartbeat);
        try {
          assertOwned();
          rmSync(paths.directory, { recursive: true, force: true });
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      },
    };
  };
  try {
    return create();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  let existing;
  try {
    existing = readJson(paths.record, "release lease");
  } catch {
    throw orchestrationError("release is locked and its lease record cannot be verified", { code: "RELEASE_LOCKED", retryable: true });
  }
  if (existing.releaseId !== releaseId) fail("release lease identity drift detected");
  if (typeof existing.leaseId !== "string" || typeof existing.owner !== "string" || !Number.isInteger(existing.fencingToken) || existing.fencingToken < 1) {
    fail("release lease owner or fencing token is invalid");
  }
  if (Date.parse(existing.expiresAt) > Date.now()) {
    throw orchestrationError("another runner holds the release lease", { code: "RELEASE_LOCKED", retryable: true });
  }
  const quarantine = `${paths.directory}.stale-${process.pid}-${Date.now()}`;
  try {
    recoverExpiredCommitGuard(paths, existing);
    return withLeaseCommitGuard(paths, assertGuardOwned => {
      assertGuardOwned();
      const current = readJson(paths.record, "release lease");
      if (current.leaseId !== existing.leaseId || current.fencingToken !== existing.fencingToken) {
        throw orchestrationError("stale release lease takeover lost a race", { code: "RELEASE_LOCKED", retryable: true });
      }
      if (Date.parse(current.expiresAt) > Date.now()) {
        throw orchestrationError("another runner renewed the release lease", { code: "RELEASE_LOCKED", retryable: true });
      }
      renameSync(paths.directory, quarantine);
      assertGuardOwned();
      rmSync(quarantine, { recursive: true, force: true });
      quarantineStalePendingReceipts(checkpointFile, current.leaseId);
      assertGuardOwned();
      return create(current.fencingToken, assertGuardOwned);
    }, { releaseId, takeoverOfLeaseId: existing.leaseId, takeoverOfFencingToken: existing.fencingToken });
  } catch {
    throw orchestrationError("stale release lease takeover lost a race", { code: "RELEASE_LOCKED", retryable: true });
  }
}

async function withReleaseLease(checkpointFile, releaseId, callback, leaseDurationMs, heartbeatEnabled) {
  const lease = acquireReleaseLease(checkpointFile, releaseId, leaseDurationMs, heartbeatEnabled);
  try {
    return await callback(lease);
  } finally {
    lease.release();
  }
}

function rollbackLatchFile(checkpointFile) {
  return `${checkpointFile}.rollback-failed.json`;
}

function readRollbackLatch(checkpointFile) {
  const file = rollbackLatchFile(checkpointFile);
  if (!existsSync(file)) return undefined;
  const latch = readJson(file, "rollback-failed latch");
  if (latch?.schemaVersion !== 1 || latch?.status !== "ROLLBACK_FAILED" || !FORWARD_STATES.includes(latch?.rollbackFromState)) {
    fail("rollback-failed latch is invalid");
  }
  assertNoSensitiveMaterial(latch, "rollback-failed latch");
  return latch;
}

function assertNoRollbackLatch(checkpointFile) {
  const latch = readRollbackLatch(checkpointFile);
  if (latch) fail("rollback-failed latch blocks forward and resume operations; retry rollback or perform explicit manual handling");
}

const isoNow = now => {
  const result = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(result.getTime())) fail("now must be a valid timestamp");
  return result.toISOString();
};

export function prepareRelease({ repoRoot = defaultRepoRoot, contractRoot = defaultContractRoot, manifestFile, now = new Date(), simulation = false }) {
  const bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
  const { checkpoint, checkpointPath } = readCheckpoint(bundle, simulation);
  if (checkpoint) {
    assertHashes(checkpoint, bundle);
    return { status: "ALREADY_PREPARED", checkpoint, checkpointFile: checkpointPath.absolute };
  }
  const created = {
    schemaVersion: 1,
    releaseId: bundle.manifest.releaseId,
    environment: bundle.manifest.environment,
    currentState: "PREPARED",
    completedStages: ["PREPARE"],
    artifactHashes: bundle.hashes,
    updatedAt: isoNow(now),
    revision: 1,
  };
  assertCheckpointSchema(bundle.validators.checkpoint, created, simulation);
  assertCheckpointSemantics(created);
  atomicWriteCheckpoint(checkpointPath.absolute, created, 0);
  return { status: "PREPARED", checkpoint: created, checkpointFile: checkpointPath.absolute };
}

function nextForwardState(currentState) {
  const index = FORWARD_STATES.indexOf(currentState);
  if (index < 0 || index === FORWARD_STATES.length - 1) return undefined;
  return FORWARD_STATES[index + 1];
}

function completedStagesForState(state) {
  if (state === "ARTIFACTS_READY") return ["IMAGES_PUBLISHED", "CLOUD_BUNDLE_READY", "SAFETY_CONTRACT_READY"];
  return [stageForState[state]];
}

function failureMessage(stage, error) {
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = raw
    .replace(/(?:bearer\s+)[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(password|secret|token|credential|authority|approval)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(?:authority|approval)s?\b/gi, "runtime-grant")
    .slice(0, 1900);
  return `${stage} failed: ${redacted}`;
}

function classifyRetryable(error) {
  if (typeof error?.retryable === "boolean") return error.retryable;
  if (["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "RELEASE_LOCKED"].includes(error?.code)) return true;
  return /\b(?:timeout|timed out|temporar|try again|connection reset|rate limit)\b/i.test(error?.message ?? "");
}

export async function offlineExecutor({ stage, targetState }) {
  if (targetState === "ARTIFACTS_READY") {
    return { mode: "OFFLINE_FAKE", stage, targetState, artifactsChanged: [] };
  }
  fail(`OFFLINE_FAKE has no provider adapter for ${stage}; no external action was executed`);
}

function validateAuthorities(authorities) {
  for (const [name, granted] of Object.entries(authorities)) {
    if (!RUNTIME_AUTHORITIES.includes(name)) fail(`unknown runtime authority: ${name}`);
    if (name === "trafficCutover") {
      if (granted !== false && !["TRAFFIC_5", "TRAFFIC_25", "TRAFFIC_50", "TRAFFIC_100"].includes(granted)) {
        fail("trafficCutover runtime grant must name exactly one traffic state");
      }
    } else if (granted !== true && granted !== false) fail(`runtime grant ${name} must be boolean`);
  }
}

function validateSimulationHooks(simulation, persistenceHook, commitHook) {
  if ((persistenceHook !== undefined && typeof persistenceHook !== "function") || (commitHook !== undefined && typeof commitHook !== "function")) {
    fail("orchestration hooks must be functions");
  }
  if (!simulation && (persistenceHook !== undefined || commitHook !== undefined)) {
    fail("persistenceHook and commitHook are simulation/test-only and are forbidden for real releases");
  }
}

function hasRuntimeGrant(authorities, required, targetState) {
  return required === "trafficCutover"
    ? authorities.trafficCutover === targetState
    : authorities[required] === true;
}

function providerIdempotencyKey(checkpoint, targetState, operationRevision = checkpoint.revision) {
  return `${checkpoint.releaseId}:${operationRevision}:${targetState}`;
}

function validateProviderReceipt({ receipt, checkpoint, targetState, stage, repoRoot, receiptNow, simulation, operationRevision, lease }) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) fail(`${stage} requires a provider receipt`);
  const allowed = ["schemaVersion", "provider", "mode", "simulation", "operation", "idempotencyKey", "completedAt", "result", "evidenceRef", "evidenceSha256", "leaseOwner", "fencingToken"];
  if (Object.keys(receipt).some(key => !allowed.includes(key))) fail(`${stage} provider receipt contains an unsupported field`);
  if (receipt.schemaVersion !== 1 || receipt.operation !== stage || receipt.result !== "PASS") fail(`${stage} provider receipt does not match the completed operation`);
  if (receipt.idempotencyKey !== providerIdempotencyKey(checkpoint, targetState, operationRevision)) fail(`${stage} provider receipt idempotency key mismatch`);
  if (receipt.leaseOwner !== lease.owner || receipt.fencingToken !== lease.fencingToken) {
    throw orchestrationError(`${stage} provider receipt lease owner or fencing token mismatch`, { code: "FENCING_MISMATCH" });
  }
  if (!/^[a-z][a-z0-9.-]{1,63}$/.test(receipt.provider ?? "")) fail(`${stage} provider receipt provider is invalid`);
  const fakeProvider = /(?:^|[.-])(?:mock|noop|no-op|offline|fake)(?:$|[.-])/i.test(receipt.provider);
  if (simulation) {
    if (receipt.mode !== "SIMULATION" || receipt.simulation !== true) fail(`${stage} simulation receipt must persist simulation=true`);
  } else if (receipt.mode !== "REAL" || receipt.simulation === true || fakeProvider) {
    fail(`${stage} refuses mock, no-op, offline, or fake provider receipt outside simulation`);
  }
  assertFreshTimestamp(receipt.completedAt, receiptNow, providerReceiptMaxAgeMs, `${stage} provider receipt completedAt`);
  if (!/^[a-f0-9]{64}$/.test(receipt.evidenceSha256 ?? "")) fail(`${stage} provider receipt evidenceSha256 is invalid`);
  const receiptPrefix = simulation
    ? `.artifacts/tke/simulations/${checkpoint.releaseId}/`
    : `.artifacts/tke/releases/${checkpoint.releaseId}/`;
  if (!receipt.evidenceRef?.startsWith(receiptPrefix)) {
    fail(`${stage} provider evidenceRef must stay within the release ID directory`);
  }
  const evidence = resolveArtifact(repoRoot, receipt.evidenceRef, `${stage} provider evidenceRef`);
  if (sha256File(evidence.absolute) !== receipt.evidenceSha256) fail(`${stage} provider receipt evidence hash mismatch`);
  assertNoSensitiveMaterial(receipt, `${stage} provider receipt`);
  return receipt;
}

function providerReceiptFile(bundle, stage) {
  return path.join(path.dirname(bundle.paths.releaseManifest.absolute), "receipts", `${stage.toLowerCase().replaceAll("_", "-")}.json`);
}

function providerReceiptHashEntries(bundle, stage, receipt) {
  const file = providerReceiptFile(bundle, stage);
  const name = path.basename(file);
  return {
    [`providerReceipt.${name}`]: sha256Content(jsonLine(receipt)),
    [`providerEvidence.${name}`]: receipt.evidenceSha256,
  };
}

function prepareProviderReceipt(bundle, stage, receipt, lease) {
  if (!receipt) return undefined;
  const file = providerReceiptFile(bundle, stage);
  const pendingDirectory = path.join(path.dirname(file), ".pending");
  mkdirSync(pendingDirectory, { recursive: true });
  const pending = path.join(pendingDirectory, `${path.basename(file)}.${lease.leaseId}.${Date.now()}.pending`);
  writeFileSync(pending, jsonLine(receipt), { encoding: "utf8", flag: "wx" });
  return { file, pending, receipt };
}

function cleanupPendingReceipt(preparedReceipt) {
  if (preparedReceipt?.pending && existsSync(preparedReceipt.pending)) unlinkSync(preparedReceipt.pending);
}

function quarantineStalePendingReceipts(checkpointFile, staleLeaseId) {
  const receiptDirectory = path.join(path.dirname(checkpointFile), "receipts");
  const pendingDirectory = path.join(receiptDirectory, ".pending");
  if (!existsSync(pendingDirectory)) return;
  const matches = readdirSync(pendingDirectory).filter(name => name.includes(`.${staleLeaseId}.`) && name.endsWith(".pending"));
  if (!matches.length) return;
  const quarantineDirectory = path.join(receiptDirectory, "quarantine");
  mkdirSync(quarantineDirectory, { recursive: true });
  for (const name of matches) renameSync(path.join(pendingDirectory, name), path.join(quarantineDirectory, `${name}.stale`));
}

function quarantineUncommittedDurableReceipts(bundle, checkpoint, lease) {
  const receiptDirectory = path.join(path.dirname(bundle.paths.releaseManifest.absolute), "receipts");
  if (!existsSync(receiptDirectory)) return false;
  const stale = readdirSync(receiptDirectory).filter(name => name.endsWith(".json")).filter(name => {
    if (checkpoint.artifactHashes[`providerReceipt.${name}`]) return false;
    const receipt = readJson(path.join(receiptDirectory, name), `uncommitted provider receipt ${name}`);
    if (!Number.isInteger(receipt.fencingToken) || receipt.fencingToken >= lease.fencingToken) {
      fail(`uncommitted provider receipt ${name} is not owned by an older fencing token`);
    }
    return true;
  });
  if (!stale.length) return false;
  lease.commit(leaseGuard => {
    const quarantineDirectory = path.join(receiptDirectory, "quarantine");
    mkdirSync(quarantineDirectory, { recursive: true });
    for (const name of stale) {
      leaseGuard.assertOwned();
      const file = path.join(receiptDirectory, name);
      const receipt = readJson(file, `uncommitted provider receipt ${name}`);
      if (receipt.fencingToken >= lease.fencingToken) fail(`uncommitted provider receipt ${name} fencing token changed during quarantine`);
      renameSync(file, path.join(quarantineDirectory, `${name}.fence-${receipt.fencingToken}.${Date.now()}.json`));
      leaseGuard.assertOwned();
    }
  });
  return true;
}

function commitProviderReceipt(preparedReceipt, stage, leaseGuard) {
  if (!preparedReceipt) return;
  const { file, pending, receipt } = preparedReceipt;
  leaseGuard.assertOwned();
  if (existsSync(file)) {
    const current = readJson(file, `${stage} provider receipt`);
    if (JSON.stringify(current) === JSON.stringify(receipt)) {
      cleanupPendingReceipt(preparedReceipt);
      leaseGuard.assertOwned();
      return;
    }
    if (!Number.isInteger(current.fencingToken) || current.fencingToken >= receipt.fencingToken) {
      fail(`${stage} provider receipt conflicts with an existing idempotent receipt`);
    }
    const quarantineDirectory = path.join(path.dirname(file), "quarantine");
    mkdirSync(quarantineDirectory, { recursive: true });
    renameSync(file, path.join(quarantineDirectory, `${path.basename(file)}.fence-${current.fencingToken}.${Date.now()}.json`));
    leaseGuard.assertOwned();
  }
  renameSync(pending, file);
  leaseGuard.assertOwned();
}

async function pulseReleaseLease(lease) {
  lease.renew();
  await new Promise(resolve => setImmediate(resolve));
  lease.renew();
}

function validateExecutorResult(result, receiptContext) {
  if (result === undefined) fail(`${receiptContext.stage} executor result is required`);
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("executor result must be an object");
  const changed = result.artifactsChanged ?? [];
  if (!Array.isArray(changed) || changed.some(name => name !== "evidenceBundle") || new Set(changed).size !== changed.length) {
    fail("executor may declare only evidenceBundle in artifactsChanged");
  }
  const receipt = receiptContext.stage === "ARTIFACTS_READY"
    ? undefined
    : validateProviderReceipt({ receipt: result.providerReceipt, ...receiptContext });
  return { changed, receipt };
}

function assertDeclaredArtifactChanges(beforeHashes, afterHashes, declaredChanges, label) {
  const keys = new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)]);
  const changed = [...keys].filter(name => beforeHashes[name] !== afterHashes[name]);
  const allowed = name => declaredChanges.includes(name)
    || (declaredChanges.includes("evidenceBundle") && name.startsWith("evidence."));
  if (changed.some(name => !allowed(name)) || declaredChanges.some(name => !changed.includes(name))) {
    fail(`${label} artifact changes differ from declaration; changed=${changed.join(",") || "none"}, declared=${declaredChanges.join(",") || "none"}`);
  }
}

async function executeOne({
  repoRoot,
  contractRoot,
  manifestFile,
  checkpoint,
  checkpointFile,
  targetState,
  authorities,
  executor,
  now,
  simulation,
  pausedCheckpoint = checkpoint,
  operationRevision = checkpoint.revision,
  lease,
  clock,
  persistenceHook = async () => {},
  commitHook = () => {},
}) {
  const expected = nextForwardState(checkpoint.currentState);
  if (targetState !== expected) fail(`illegal state transition ${checkpoint.currentState} -> ${targetState}; expected ${expected ?? "no successor"}`);
  const requiredAuthority = authorityForState[targetState];
  if (requiredAuthority && !hasRuntimeGrant(authorities, requiredAuthority, targetState)) {
    return { status: "PAUSED_AUTHORITY", requiredAuthority, checkpoint: pausedCheckpoint };
  }
  const stage = targetState === "ARTIFACTS_READY" ? "ARTIFACTS_READY" : stageForState[targetState];
  let bundleBefore;
  let receiptNow;
  let preparedReceipt;
  try {
    bundleBefore = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
    assertHashes(checkpoint, bundleBefore);
    lease.assertOwned();
    const executorResult = await executor({
      releaseId: checkpoint.releaseId,
      environment: checkpoint.environment,
      currentState: checkpoint.currentState,
      targetState,
      stage,
      idempotencyKey: providerIdempotencyKey(checkpoint, targetState, operationRevision),
      runtimeAuthorityGranted: requiredAuthority ? true : false,
      leaseOwner: lease.owner,
      fencingToken: lease.fencingToken,
      artifactPaths: Object.fromEntries(Object.entries(bundleBefore.paths).map(([name, item]) => [name, item.relative])),
    });
    lease.assertOwned();
    await persistenceHook("forward-after-executor-assert", { stage, targetState, lease });
    await pulseReleaseLease(lease);
    receiptNow = asClockDate(clock());
    const validatedResult = validateExecutorResult(executorResult, {
      checkpoint,
      targetState,
      stage,
      repoRoot,
      receiptNow,
      simulation,
      operationRevision,
      lease,
    });
    await pulseReleaseLease(lease);
    const declaredChanges = validatedResult.changed;
    const bundleAfter = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
    await pulseReleaseLease(lease);
    assertDeclaredArtifactChanges(bundleBefore.hashes, bundleAfter.hashes, declaredChanges, "executor");
    assertEvidenceForState(targetState, bundleAfter.evidenceBundle, receiptNow);
    await persistenceHook("forward-before-receipt-write", { stage, targetState, lease });
    await pulseReleaseLease(lease);
    preparedReceipt = prepareProviderReceipt(bundleAfter, stage, validatedResult.receipt, lease);
    lease.assertOwned();
    if (preparedReceipt) {
      await persistenceHook("forward-after-pending-receipt-write-before-commit", { stage, targetState, lease, pendingReceipt: preparedReceipt.pending });
      await pulseReleaseLease(lease);
    }
    const finalHashes = validatedResult.receipt
      ? { ...bundleAfter.hashes, ...providerReceiptHashEntries(bundleAfter, stage, validatedResult.receipt) }
      : bundleAfter.hashes;
    const updated = {
      ...checkpoint,
      currentState: targetState,
      completedStages: [...checkpoint.completedStages, ...completedStagesForState(targetState)],
      artifactHashes: finalHashes,
      updatedAt: receiptNow.toISOString(),
      revision: checkpoint.revision + 1,
    };
    delete updated.failure;
    assertCheckpointSchema(bundleAfter.validators.checkpoint, updated, simulation);
    assertCheckpointSemantics(updated);
    lease.commit(leaseGuard => {
      leaseGuard.assertOwned();
      commitHook("forward-commit-guard-acquired", { stage, targetState, lease });
      leaseGuard.assertOwned();
      commitProviderReceipt(preparedReceipt, stage, leaseGuard);
      leaseGuard.assertOwned();
      commitHook("forward-after-durable-receipt-before-checkpoint", { stage, targetState, lease, receiptFile: preparedReceipt?.file });
      leaseGuard.assertOwned();
      atomicWriteCheckpoint(checkpointFile, updated, checkpoint.revision, leaseGuard.assertOwned);
      leaseGuard.assertOwned();
    });
    return { status: targetState, checkpoint: updated };
  } catch (error) {
    cleanupPendingReceipt(preparedReceipt);
    if (isLeaseOrFenceLoss(error)) throw error;
    const failureNow = receiptNow ?? asClockDate(clock());
    const failed = {
      ...checkpoint,
      currentState: "FAILED",
      updatedAt: failureNow.toISOString(),
      revision: checkpoint.revision + 1,
      failure: {
        failedStage: stage === "ARTIFACTS_READY" ? (error.failedStage ?? "IMAGES_PUBLISHED") : stage,
        failedAt: failureNow.toISOString(),
        message: failureMessage(stage, error),
        retryable: classifyRetryable(error),
        resumeState: targetState,
      },
    };
    assertCheckpointSchema((bundleBefore?.validators ?? compileValidators(contractRoot)).checkpoint, failed, simulation);
    assertCheckpointSemantics(failed);
    lease.commit(leaseGuard => atomicWriteCheckpoint(checkpointFile, failed, checkpoint.revision, leaseGuard.assertOwned));
    return { status: "FAILED", checkpoint: failed, error };
  }
}

export async function advanceRelease({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  targetState,
  authorities = {},
  executor = offlineExecutor,
  now = new Date(),
  simulation = false,
  clock = () => new Date(),
  leaseDurationMs = 30_000,
  leaseHeartbeat = true,
  persistenceHook,
  commitHook,
}) {
  validateSimulationHooks(simulation, persistenceHook, commitHook);
  validateAuthorities(authorities);
  const initialBundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation, verifyPayloads: false });
  const initial = readCheckpoint(initialBundle, simulation);
  if (!initial.checkpoint) fail("release is not prepared");
  return withReleaseLease(initial.checkpointPath.absolute, initial.checkpoint.releaseId, async lease => {
    let bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation, verifyPayloads: false });
    const { checkpoint, checkpointPath } = readCheckpoint(bundle, simulation);
    if (!checkpoint) fail("release is not prepared");
    if (quarantineUncommittedDurableReceipts(bundle, checkpoint, lease)) {
      bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation, verifyPayloads: false });
    }
    assertNoRollbackLatch(checkpointPath.absolute);
    if (checkpoint.currentState === targetState) {
      const verified = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
      assertHashes(checkpoint, verified);
      return { status: "ALREADY_AT_TARGET", checkpoint };
    }
    if (checkpoint.currentState === "FAILED") fail("FAILED release must use resumeRelease");
    if (TERMINAL_STATES.includes(checkpoint.currentState)) fail(`${checkpoint.currentState} is terminal; use a new release ID`);
    return executeOne({ repoRoot, contractRoot, manifestFile, checkpoint, checkpointFile: checkpointPath.absolute, targetState, authorities, executor, now, simulation, lease, clock, persistenceHook, commitHook });
  }, leaseDurationMs, leaseHeartbeat);
}

export async function resumeRelease({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  authorities = {},
  executor = offlineExecutor,
  now = new Date(),
  simulation = false,
  clock = () => new Date(),
  leaseDurationMs = 30_000,
  leaseHeartbeat = true,
  persistenceHook,
  commitHook,
}) {
  validateSimulationHooks(simulation, persistenceHook, commitHook);
  validateAuthorities(authorities);
  const initialBundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
  const initial = readCheckpoint(initialBundle, simulation);
  if (!initial.checkpoint) fail("release is not prepared");
  return withReleaseLease(initial.checkpointPath.absolute, initial.checkpoint.releaseId, async lease => {
    let bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
    const { checkpoint, checkpointPath } = readCheckpoint(bundle, simulation);
    if (!checkpoint) fail("release is not prepared");
    if (quarantineUncommittedDurableReceipts(bundle, checkpoint, lease)) {
      bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
    }
    assertNoRollbackLatch(checkpointPath.absolute);
    if (checkpoint.currentState !== "FAILED" || !checkpoint.failure) fail("resume requires a FAILED checkpoint");
    if (!checkpoint.failure.retryable) fail("failed stage is not retryable");
    assertHashes(checkpoint, bundle);
    const requiredAuthority = authorityForState[checkpoint.failure.resumeState];
    if (requiredAuthority && !hasRuntimeGrant(authorities, requiredAuthority, checkpoint.failure.resumeState)) {
      return { status: "PAUSED_AUTHORITY", requiredAuthority, checkpoint };
    }
    const synthetic = { ...checkpoint, currentState: FORWARD_STATES[FORWARD_STATES.indexOf(checkpoint.failure.resumeState) - 1] };
    delete synthetic.failure;
    return executeOne({
      repoRoot,
      contractRoot,
      manifestFile,
      checkpoint: synthetic,
      checkpointFile: checkpointPath.absolute,
      targetState: checkpoint.failure.resumeState,
      authorities,
      executor,
      now,
      simulation,
      pausedCheckpoint: checkpoint,
      operationRevision: checkpoint.revision - 1,
      lease,
      clock,
      persistenceHook,
      commitHook,
    });
  }, leaseDurationMs, leaseHeartbeat);
}

export async function rollbackRelease({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  executor = offlineExecutor,
  now = new Date(),
  simulation = false,
  clock = () => new Date(),
  leaseDurationMs = 30_000,
  leaseHeartbeat = true,
  persistenceHook,
  commitHook,
}) {
  validateSimulationHooks(simulation, persistenceHook, commitHook);
  persistenceHook ??= async () => {};
  commitHook ??= () => {};
  const initialBundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
  const initial = readCheckpoint(initialBundle, simulation);
  if (!initial.checkpoint) fail("release is not prepared");
  return withReleaseLease(initial.checkpointPath.absolute, initial.checkpoint.releaseId, async lease => {
    let bundleBefore = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
    const { checkpoint, checkpointPath } = readCheckpoint(bundleBefore, simulation);
    if (!checkpoint) fail("release is not prepared");
    if (quarantineUncommittedDurableReceipts(bundleBefore, checkpoint, lease)) {
      bundleBefore = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
    }
    const existingLatch = readRollbackLatch(checkpointPath.absolute);
    const rollbackFromState = existingLatch?.rollbackFromState ?? checkpoint.currentState;
    if (existingLatch && rollbackFromState !== checkpoint.currentState) fail("rollback-failed latch state drifted from checkpoint");
    const stateIndex = FORWARD_STATES.indexOf(rollbackFromState);
    const first = FORWARD_STATES.indexOf("DEPLOYED_NO_TRAFFIC");
    const last = FORWARD_STATES.indexOf("OBSERVED");
    if (stateIndex < first || stateIndex > last) fail(`rollback is not legal from ${rollbackFromState}`);
    assertHashes(checkpoint, bundleBefore);
    const idempotencyKey = providerIdempotencyKey(checkpoint, "ROLLED_BACK");
    let receiptNow;
    let preparedReceipt;
    try {
      const result = await executor({
        releaseId: checkpoint.releaseId,
        environment: checkpoint.environment,
        currentState: checkpoint.currentState,
        targetState: "ROLLED_BACK",
        stage: "ROLLBACK",
        idempotencyKey,
        runtimeAuthorityGranted: false,
        leaseOwner: lease.owner,
        fencingToken: lease.fencingToken,
        artifactPaths: Object.fromEntries(Object.entries(bundleBefore.paths).map(([name, item]) => [name, item.relative])),
      });
      lease.assertOwned();
      await persistenceHook("rollback-after-executor-assert", { stage: "ROLLBACK", targetState: "ROLLED_BACK", lease });
      await pulseReleaseLease(lease);
      receiptNow = asClockDate(clock());
      const validatedResult = validateExecutorResult(result, {
        checkpoint,
        targetState: "ROLLED_BACK",
        stage: "ROLLBACK",
        repoRoot,
        receiptNow,
        simulation,
        lease,
      });
      await pulseReleaseLease(lease);
      const bundleAfter = loadReleaseBundle({ repoRoot, contractRoot, manifestFile, simulation });
      await pulseReleaseLease(lease);
      assertDeclaredArtifactChanges(bundleBefore.hashes, bundleAfter.hashes, validatedResult.changed, "rollback executor");
      if (bundleAfter.evidenceBundle.rollback?.result !== "PASS") fail("rollback requires passing rollback evidence");
      assertFreshTimestamp(bundleAfter.evidenceBundle.rollback.completedAt, receiptNow, evidenceFreshness.executionMs, "rollback.completedAt");
      await persistenceHook("rollback-before-receipt-write", { stage: "ROLLBACK", targetState: "ROLLED_BACK", lease });
      await pulseReleaseLease(lease);
      preparedReceipt = prepareProviderReceipt(bundleAfter, "ROLLBACK", validatedResult.receipt, lease);
      lease.assertOwned();
      await persistenceHook("rollback-after-pending-receipt-write-before-commit", { stage: "ROLLBACK", targetState: "ROLLED_BACK", lease, pendingReceipt: preparedReceipt.pending });
      await pulseReleaseLease(lease);
      const finalHashes = { ...bundleAfter.hashes, ...providerReceiptHashEntries(bundleAfter, "ROLLBACK", validatedResult.receipt) };
      const rolledBack = {
        ...checkpoint,
        currentState: "ROLLED_BACK",
        completedStages: [...checkpoint.completedStages, "ROLLBACK"],
        artifactHashes: finalHashes,
        updatedAt: receiptNow.toISOString(),
        revision: checkpoint.revision + 1,
      };
      assertCheckpointSchema(bundleAfter.validators.checkpoint, rolledBack, simulation);
      assertCheckpointSemantics(rolledBack);
      lease.commit(leaseGuard => {
        leaseGuard.assertOwned();
        commitHook("rollback-commit-guard-acquired", { stage: "ROLLBACK", targetState: "ROLLED_BACK", lease });
        leaseGuard.assertOwned();
        commitProviderReceipt(preparedReceipt, "ROLLBACK", leaseGuard);
        leaseGuard.assertOwned();
        commitHook("rollback-after-durable-receipt-before-checkpoint", { stage: "ROLLBACK", targetState: "ROLLED_BACK", lease, receiptFile: preparedReceipt.file });
        leaseGuard.assertOwned();
        atomicWriteCheckpoint(checkpointPath.absolute, rolledBack, checkpoint.revision, leaseGuard.assertOwned);
        leaseGuard.assertOwned();
        if (existingLatch) unlinkSync(rollbackLatchFile(checkpointPath.absolute));
        leaseGuard.assertOwned();
      });
      return { status: "ROLLED_BACK", checkpoint: rolledBack };
    } catch (error) {
      cleanupPendingReceipt(preparedReceipt);
      if (isLeaseOrFenceLoss(error)) throw error;
      const failureNow = receiptNow ?? asClockDate(clock());
      const latch = {
        schemaVersion: 1,
        status: "ROLLBACK_FAILED",
        releaseId: checkpoint.releaseId,
        rollbackFromState,
        failedStage: "ROLLBACK",
        failedAt: failureNow.toISOString(),
        retryable: classifyRetryable(error),
        message: failureMessage("ROLLBACK", error),
        idempotencyKey,
      };
      assertNoSensitiveMaterial(latch, "rollback-failed latch");
      lease.commit(leaseGuard => {
        leaseGuard.assertOwned();
        atomicWriteJsonFile(rollbackLatchFile(checkpointPath.absolute), latch);
        leaseGuard.assertOwned();
      });
      return { status: "ROLLBACK_FAILED", checkpoint, latch, error };
    }
  }, leaseDurationMs, leaseHeartbeat);
}

export async function clearRollbackFailure({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  confirmation,
}) {
  const initialBundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
  const initial = readCheckpoint(initialBundle);
  if (!initial.checkpoint) fail("release is not prepared");
  return withReleaseLease(initial.checkpointPath.absolute, initial.checkpoint.releaseId, async () => {
    const bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
    const { checkpoint, checkpointPath } = readCheckpoint(bundle);
    if (!checkpoint) fail("release is not prepared");
    const latch = readRollbackLatch(checkpointPath.absolute);
    if (!latch) return { status: "NO_ROLLBACK_LATCH", checkpoint };
    if (confirmation !== `ACKNOWLEDGE-ROLLBACK-FAILURE:${checkpoint.releaseId}`) {
      fail("explicit release-scoped manual handling confirmation is required");
    }
    unlinkSync(rollbackLatchFile(checkpointPath.absolute));
    return { status: "ROLLBACK_LATCH_CLEARED", checkpoint };
  });
}

export async function runRelease({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  targetState,
  authorities = {},
  executor = offlineExecutor,
  now = new Date(),
  resume = false,
  simulation = false,
  clock = () => new Date(),
  leaseDurationMs = 30_000,
  leaseHeartbeat = true,
  persistenceHook,
  commitHook,
}) {
  validateSimulationHooks(simulation, persistenceHook, commitHook);
  if (!FORWARD_STATES.includes(targetState)) fail(`unknown forward target state: ${targetState}`);
  validateAuthorities(authorities);
  let prepared = prepareRelease({ repoRoot, contractRoot, manifestFile, now, simulation });
  let checkpoint = prepared.checkpoint;
  if (checkpoint.currentState === "FAILED") {
    if (!resume) return { status: "PAUSED_FAILED", checkpoint };
    const resumed = await resumeRelease({ repoRoot, contractRoot, manifestFile, authorities, executor, now, simulation, clock, leaseDurationMs, leaseHeartbeat, persistenceHook, commitHook });
    if (resumed.status === "FAILED" || resumed.status === "PAUSED_AUTHORITY") return resumed;
    checkpoint = resumed.checkpoint;
  }
  const targetIndex = FORWARD_STATES.indexOf(targetState);
  const currentIndex = FORWARD_STATES.indexOf(checkpoint.currentState);
  if (currentIndex > targetIndex) fail(`target ${targetState} is behind current state ${checkpoint.currentState}`);
  while (checkpoint.currentState !== targetState) {
    const next = nextForwardState(checkpoint.currentState);
    const result = await advanceRelease({ repoRoot, contractRoot, manifestFile, targetState: next, authorities, executor, now, simulation, clock, leaseDurationMs, leaseHeartbeat, persistenceHook, commitHook });
    if (result.status === "FAILED" || result.status === "PAUSED_AUTHORITY") return result;
    checkpoint = result.checkpoint;
  }
  return { status: "TARGET_REACHED", checkpoint };
}
