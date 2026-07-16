import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(sourceRoot, "../../..");
const defaultContractRoot = path.resolve(sourceRoot, "../contracts");

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
const sha256File = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const readJson = (file, label) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} must contain valid JSON`);
    throw error;
  }
};

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
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:^|\W)AKID[A-Za-z0-9]{12,}(?:$|\W)|\bbearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:password|secret|token|credential)\s*[=:]\s*\S+/i.test(value)) {
    fail(`${label} ${location} contains credential-like material`);
  }
}

function assertCrossContractConsistency(bundle) {
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
}

function assertEvidenceForState(state, evidence) {
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("BACKUP_VERIFIED")) {
    if (evidence.backup.restoreDrill.result !== "PASS") fail(`${state} requires passing backup restore evidence`);
  }
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("MIGRATED")) {
    if (evidence.migration?.result !== "PASS") fail(`${state} requires passing migration evidence`);
  }
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("SMOKE_PASS")) {
    if (evidence.smoke?.result !== "PASS") fail(`${state} requires passing smoke evidence`);
  }
  if (FORWARD_STATES.indexOf(state) >= FORWARD_STATES.indexOf("JOBS_SWITCHED")) {
    if (evidence.jobsSingleActive.lighthouseState !== "STOPPED" || evidence.jobsSingleActive.tkeState !== "ACTIVE") {
      fail(`${state} requires Lighthouse jobs STOPPED and TKE jobs ACTIVE`);
    }
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
  }
}

export function loadReleaseBundle({ repoRoot = defaultRepoRoot, contractRoot = defaultContractRoot, manifestFile }) {
  const validators = compileValidators(contractRoot);
  const manifestRef = artifactReference(repoRoot, manifestFile, "manifestFile");
  const paths = { releaseManifest: resolveArtifact(repoRoot, manifestRef, "manifestFile") };
  const manifest = readJson(paths.releaseManifest.absolute, "release manifest");
  assertSchema(validators.releaseManifest, manifest, "release manifest");
  assertNoSensitiveMaterial(manifest, "release manifest");
  const values = { releaseManifest: manifest };
  for (const [name, definition] of Object.entries(artifactDefinitions)) {
    if (name === "releaseManifest") continue;
    paths[name] = resolveArtifact(repoRoot, manifest[definition.manifestKey], `release manifest ${definition.manifestKey}`);
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
  assertCrossContractConsistency(bundle);
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
    const expectedFailedStage = checkpoint.failure.resumeState === "ARTIFACTS_READY"
      ? "IMAGES_PUBLISHED"
      : stageForState[checkpoint.failure.resumeState];
    if (checkpoint.failure.failedStage !== expectedFailedStage) {
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

function readCheckpoint(bundle) {
  const corrected = resolveArtifact(bundle.repoRoot, bundle.manifest.checkpointFile, "release manifest checkpointFile", { mustExist: false });
  if (!existsSync(corrected.absolute)) return { checkpoint: undefined, checkpointPath: corrected };
  const checkpoint = readJson(corrected.absolute, "checkpoint");
  assertSchema(bundle.validators.checkpoint, checkpoint, "checkpoint");
  assertCheckpointSafe(checkpoint);
  assertCheckpointIdentity(checkpoint, bundle);
  assertCheckpointSemantics(checkpoint);
  return { checkpoint, checkpointPath: corrected };
}

function atomicWriteCheckpoint(file, checkpoint, expectedRevision) {
  assertCheckpointSafe(checkpoint);
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
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

const isoNow = now => {
  const result = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(result.getTime())) fail("now must be a valid timestamp");
  return result.toISOString();
};

export function prepareRelease({ repoRoot = defaultRepoRoot, contractRoot = defaultContractRoot, manifestFile, now = new Date() }) {
  const bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
  const { checkpoint, checkpointPath } = readCheckpoint(bundle);
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
  assertSchema(bundle.validators.checkpoint, created, "checkpoint");
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
    .replace(/(password|secret|token|credential)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1900);
  return `${stage} failed: ${redacted}`;
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
    if (granted !== true && granted !== false) fail(`runtime authority ${name} must be boolean`);
  }
}

function validateExecutorResult(result) {
  if (result === undefined) return [];
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("executor result must be an object");
  const changed = result.artifactsChanged ?? [];
  if (!Array.isArray(changed) || changed.some(name => name !== "evidenceBundle") || new Set(changed).size !== changed.length) {
    fail("executor may declare only evidenceBundle in artifactsChanged");
  }
  return changed;
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
}) {
  const expected = nextForwardState(checkpoint.currentState);
  if (targetState !== expected) fail(`illegal state transition ${checkpoint.currentState} -> ${targetState}; expected ${expected ?? "no successor"}`);
  const bundleBefore = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
  assertHashes(checkpoint, bundleBefore);
  const requiredAuthority = authorityForState[targetState];
  if (requiredAuthority && authorities[requiredAuthority] !== true) {
    return { status: "PAUSED_AUTHORITY", requiredAuthority, checkpoint };
  }
  const stage = targetState === "ARTIFACTS_READY" ? "ARTIFACTS_READY" : stageForState[targetState];
  try {
    const executorResult = await executor({
      releaseId: checkpoint.releaseId,
      environment: checkpoint.environment,
      currentState: checkpoint.currentState,
      targetState,
      stage,
      runtimeAuthorityGranted: requiredAuthority ? true : false,
      artifactPaths: Object.fromEntries(Object.entries(bundleBefore.paths).map(([name, item]) => [name, item.relative])),
    });
    const declaredChanges = validateExecutorResult(executorResult);
    const bundleAfter = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
    const changed = Object.keys(bundleBefore.hashes).filter(name => bundleBefore.hashes[name] !== bundleAfter.hashes[name]);
    if (changed.some(name => !declaredChanges.includes(name)) || declaredChanges.some(name => !changed.includes(name))) {
      fail(`executor artifact changes differ from declaration; changed=${changed.join(",") || "none"}, declared=${declaredChanges.join(",") || "none"}`);
    }
    assertEvidenceForState(targetState, bundleAfter.evidenceBundle);
    const updated = {
      ...checkpoint,
      currentState: targetState,
      completedStages: [...checkpoint.completedStages, ...completedStagesForState(targetState)],
      artifactHashes: bundleAfter.hashes,
      updatedAt: isoNow(now),
      revision: checkpoint.revision + 1,
    };
    delete updated.failure;
    assertSchema(bundleAfter.validators.checkpoint, updated, "checkpoint");
    assertCheckpointSemantics(updated);
    atomicWriteCheckpoint(checkpointFile, updated, checkpoint.revision);
    return { status: targetState, checkpoint: updated };
  } catch (error) {
    const failed = {
      ...checkpoint,
      currentState: "FAILED",
      updatedAt: isoNow(now),
      revision: checkpoint.revision + 1,
      failure: {
        failedStage: stage === "ARTIFACTS_READY" ? "IMAGES_PUBLISHED" : stage,
        failedAt: isoNow(now),
        message: failureMessage(stage, error),
        retryable: true,
        resumeState: targetState,
      },
    };
    assertSchema(bundleBefore.validators.checkpoint, failed, "checkpoint");
    assertCheckpointSemantics(failed);
    atomicWriteCheckpoint(checkpointFile, failed, checkpoint.revision);
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
}) {
  validateAuthorities(authorities);
  const bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
  const { checkpoint, checkpointPath } = readCheckpoint(bundle);
  if (!checkpoint) fail("release is not prepared");
  if (checkpoint.currentState === targetState) {
    assertHashes(checkpoint, bundle);
    return { status: "ALREADY_AT_TARGET", checkpoint };
  }
  if (checkpoint.currentState === "FAILED") fail("FAILED release must use resumeRelease");
  if (TERMINAL_STATES.includes(checkpoint.currentState)) fail(`${checkpoint.currentState} is terminal; use a new release ID`);
  return executeOne({ repoRoot, contractRoot, manifestFile, checkpoint, checkpointFile: checkpointPath.absolute, targetState, authorities, executor, now });
}

export async function resumeRelease({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  authorities = {},
  executor = offlineExecutor,
  now = new Date(),
}) {
  validateAuthorities(authorities);
  const bundle = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
  const { checkpoint, checkpointPath } = readCheckpoint(bundle);
  if (!checkpoint) fail("release is not prepared");
  if (checkpoint.currentState !== "FAILED" || !checkpoint.failure) fail("resume requires a FAILED checkpoint");
  if (!checkpoint.failure.retryable) fail("failed stage is not retryable");
  assertHashes(checkpoint, bundle);
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
  });
}

export async function rollbackRelease({
  repoRoot = defaultRepoRoot,
  contractRoot = defaultContractRoot,
  manifestFile,
  executor = offlineExecutor,
  now = new Date(),
}) {
  const bundleBefore = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
  const { checkpoint, checkpointPath } = readCheckpoint(bundleBefore);
  if (!checkpoint) fail("release is not prepared");
  const stateIndex = FORWARD_STATES.indexOf(checkpoint.currentState);
  const first = FORWARD_STATES.indexOf("DEPLOYED_NO_TRAFFIC");
  const last = FORWARD_STATES.indexOf("OBSERVED");
  if (stateIndex < first || stateIndex > last) fail(`rollback is not legal from ${checkpoint.currentState}`);
  assertHashes(checkpoint, bundleBefore);
  try {
    const result = await executor({
      releaseId: checkpoint.releaseId,
      environment: checkpoint.environment,
      currentState: checkpoint.currentState,
      targetState: "ROLLED_BACK",
      stage: "ROLLBACK",
      runtimeAuthorityGranted: false,
      artifactPaths: Object.fromEntries(Object.entries(bundleBefore.paths).map(([name, item]) => [name, item.relative])),
    });
    const declaredChanges = validateExecutorResult(result);
    const bundleAfter = loadReleaseBundle({ repoRoot, contractRoot, manifestFile });
    const changed = Object.keys(bundleBefore.hashes).filter(name => bundleBefore.hashes[name] !== bundleAfter.hashes[name]);
    if (changed.some(name => !declaredChanges.includes(name)) || declaredChanges.some(name => !changed.includes(name))) {
      fail("rollback artifact changes differ from executor declaration");
    }
    if (bundleAfter.evidenceBundle.rollback?.result !== "PASS") fail("rollback requires passing rollback evidence");
    const rolledBack = {
      ...checkpoint,
      currentState: "ROLLED_BACK",
      completedStages: [...checkpoint.completedStages, "ROLLBACK"],
      artifactHashes: bundleAfter.hashes,
      updatedAt: isoNow(now),
      revision: checkpoint.revision + 1,
    };
    assertSchema(bundleAfter.validators.checkpoint, rolledBack, "checkpoint");
    assertCheckpointSemantics(rolledBack);
    atomicWriteCheckpoint(checkpointPath.absolute, rolledBack, checkpoint.revision);
    return { status: "ROLLED_BACK", checkpoint: rolledBack };
  } catch (error) {
    return { status: "FAILED", checkpoint, error };
  }
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
}) {
  if (!FORWARD_STATES.includes(targetState)) fail(`unknown forward target state: ${targetState}`);
  validateAuthorities(authorities);
  let prepared = prepareRelease({ repoRoot, contractRoot, manifestFile, now });
  let checkpoint = prepared.checkpoint;
  if (checkpoint.currentState === "FAILED") {
    if (!resume) return { status: "PAUSED_FAILED", checkpoint };
    const resumed = await resumeRelease({ repoRoot, contractRoot, manifestFile, authorities, executor, now });
    if (resumed.status === "FAILED" || resumed.status === "PAUSED_AUTHORITY") return resumed;
    checkpoint = resumed.checkpoint;
  }
  const targetIndex = FORWARD_STATES.indexOf(targetState);
  const currentIndex = FORWARD_STATES.indexOf(checkpoint.currentState);
  if (currentIndex > targetIndex) fail(`target ${targetState} is behind current state ${checkpoint.currentState}`);
  while (checkpoint.currentState !== targetState) {
    const next = nextForwardState(checkpoint.currentState);
    const result = await advanceRelease({ repoRoot, contractRoot, manifestFile, targetState: next, authorities, executor, now });
    if (result.status === "FAILED" || result.status === "PAUSED_AUTHORITY") return result;
    checkpoint = result.checkpoint;
  }
  return { status: "TARGET_REACHED", checkpoint };
}
