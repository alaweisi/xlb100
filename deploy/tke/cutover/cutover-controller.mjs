import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import {
  validateCheckpointSemantics,
  validateContract,
  validateEvidenceSemantics,
} from "../../../scripts/check-tke-release-contracts.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(moduleDirectory, "../../..");
const requestSchemaFile = path.join(moduleDirectory, "cutover-request.schema.json");
const progressSchemaFile = path.join(moduleDirectory, "cutover-progress.schema.json");
const trafficWeights = Object.freeze([5, 25, 50, 100]);
const providerTypes = new Set(["clb", "dns"]);
const forbiddenKeys = /^(?:password|passwd|secret|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKeyId|accessKeySecret|authorization|authorizations|approval|approvals|confirmed|executionGrant)$/i;

const fail = message => { throw new Error(message); };
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
};
const stableJson = value => JSON.stringify(stableValue(value));
const hashObject = value => sha256(stableJson(value));

const ajv = new Ajv({ allErrors: true, strict: true });
const validateRequestSchema = ajv.compile(readJson(requestSchemaFile));
const validateProgressSchema = ajv.compile(readJson(progressSchemaFile));

function schemaErrors(validate) {
  return validate.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ") ?? "unknown error";
}

function scanPersistedValue(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPersistedValue(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) fail(`${location}.${key} is a forbidden credential or persisted execution decision`);
    scanPersistedValue(child, `${location}.${key}`);
  }
}

function assertArtifactReference(reference, label) {
  if (typeof reference !== "string" || reference.includes("\\")) fail(`${label} must be a normalized .artifacts/tke path`);
  const normalized = path.posix.normalize(reference);
  if (normalized !== reference || !normalized.startsWith(".artifacts/tke/") || normalized.includes("/../")) {
    fail(`${label} escapes or is not normalized below .artifacts/tke`);
  }
  return reference;
}

function validateRequest(request) {
  if (!validateRequestSchema(request)) fail(`cutover request schema validation failed: ${schemaErrors(validateRequestSchema)}`);
  scanPersistedValue(request);
  Object.entries(request.files).forEach(([name, reference]) => assertArtifactReference(reference, `request.files.${name}`));
  const weights = request.steps.map(step => step.weight);
  if (weights.some((weight, index) => weight !== trafficWeights[index])) {
    fail("cutover steps must be exactly 5/25/50/100 and cannot skip or reorder a level");
  }
  if (request.steps.some(step => step.minimumObservationSeconds < 900)) {
    fail("every cutover observation window must be at least 900 seconds");
  }
  return request;
}

function resolveArtifact(root, reference, label, requireExists = true) {
  assertArtifactReference(reference, label);
  const artifactRoot = path.resolve(root, ".artifacts", "tke");
  const resolved = path.resolve(root, reference.replaceAll("/", path.sep));
  if (!resolved.startsWith(`${artifactRoot}${path.sep}`)) fail(`${label} escapes .artifacts/tke`);
  if (requireExists && !existsSync(resolved)) fail(`${label} does not exist: ${reference}`);
  return resolved;
}

function assertIdentity(request, releaseManifest, cloudBundle, evidenceBundle, checkpoint) {
  for (const [label, value] of Object.entries({ releaseManifest, evidenceBundle, checkpoint })) {
    if (value.releaseId !== request.releaseId) fail(`${label} releaseId drift detected`);
  }
  for (const [label, value] of Object.entries({ releaseManifest, cloudBundle, evidenceBundle, checkpoint })) {
    if (value.environment !== request.environment) fail(`${label} environment drift detected`);
  }
  if (releaseManifest.trafficProvider !== request.trafficProvider) fail("traffic provider differs from release manifest");
}

function assertHashes(request, actualHashes, checkpoint) {
  for (const [name, expected] of Object.entries(request.expectedHashes)) {
    if (actualHashes[name] !== expected) fail(`${name} SHA-256 drift detected`);
  }
  for (const name of ["releaseManifest", "cloudBundle", "evidenceBundle"]) {
    if (!checkpoint.artifactHashes[name]) fail(`checkpoint artifactHashes.${name} is required for cutover`);
    if (checkpoint.artifactHashes[name] !== request.expectedHashes[name]) fail(`checkpoint ${name} binding drift detected`);
  }
}

function assertJobsReady(evidence, { requireTke = true } = {}) {
  validateEvidenceSemantics(evidence);
  const inspectReferences = (value, location = "evidence") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspectReferences(item, `${location}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "evidenceRef") assertArtifactReference(child, `${location}.${key}`);
      else inspectReferences(child, `${location}.${key}`);
    }
  };
  inspectReferences(evidence);
  const jobs = evidence.jobsSingleActive;
  const exactlyOneActive = (jobs.lighthouseState === "ACTIVE") !== (jobs.tkeState === "ACTIVE");
  if (!exactlyOneActive) fail("cutover requires exactly one active Jobs side");
  if (requireTke && (jobs.lighthouseState !== "STOPPED" || jobs.tkeState !== "ACTIVE")) {
    fail("forward traffic cutover requires Lighthouse Jobs STOPPED and TKE Jobs ACTIVE");
  }
}

function checkpointWeight(checkpoint) {
  if (checkpoint.currentState === "JOBS_SWITCHED") return 0;
  const match = /^TRAFFIC_(5|25|50|100)$/.exec(checkpoint.currentState);
  if (!match) fail(`checkpoint state ${checkpoint.currentState} is not eligible for traffic cutover`);
  return Number(match[1]);
}

export function buildCutoverPlan({ request, releaseManifest, cloudBundle, evidenceBundle, checkpoint, actualHashes }) {
  validateRequest(request);
  validateContract("releaseManifest", releaseManifest);
  validateContract("cloudBundle", cloudBundle);
  validateEvidenceSemantics(evidenceBundle);
  validateCheckpointSemantics(checkpoint);
  assertIdentity(request, releaseManifest, cloudBundle, evidenceBundle, checkpoint);
  assertHashes(request, actualHashes, checkpoint);
  assertJobsReady(evidenceBundle);

  const initialWeight = checkpointWeight(checkpoint);
  const observedWeights = (evidenceBundle.trafficObservations ?? []).map(item => item.weight);
  const expectedObserved = trafficWeights.filter(weight => weight <= initialWeight);
  if (stableJson(observedWeights) !== stableJson(expectedObserved)) {
    fail("traffic observation prefix does not match the checkpoint traffic state");
  }
  if (evidenceBundle.trafficObservations?.some(item => item.result !== "PASS")) fail("existing traffic observations must all be PASS");

  const planBody = {
    schemaVersion: 1,
    planKind: "OFFLINE_PROVIDER_NEUTRAL_CUTOVER",
    releaseId: request.releaseId,
    environment: request.environment,
    trafficProvider: request.trafficProvider,
    initialWeight,
    steps: request.steps,
    rollback: {
      targetWeight: 0,
      minimumObservationSeconds: 900,
      reverseOrder: initialWeight === 0 ? [] : [...trafficWeights.filter(weight => weight < initialWeight).reverse(), 0],
    },
    artifactHashes: { ...request.expectedHashes },
    externalExecutionEnabled: false,
  };
  const plan = { ...planBody, planSha256: hashObject(planBody) };
  scanPersistedValue(plan);
  return plan;
}

function verifyPlan(plan) {
  const { planSha256, ...body } = plan;
  if (hashObject(body) !== planSha256) fail("cutover plan hash drift detected");
  if (body.externalExecutionEnabled !== false) fail("persisted cutover plans cannot enable external execution");
  scanPersistedValue(plan);
}

function expectedForwardKey(plan, fromWeight, toWeight) {
  return `${plan.releaseId}:${plan.planSha256.slice(0, 12)}:forward:${fromWeight}-${toWeight}`;
}

function expectedRollbackKey(plan, fromWeight, toWeight) {
  return `${plan.releaseId}:${plan.planSha256.slice(0, 12)}:rollback:${fromWeight}-${toWeight}`;
}

function reverseTargets(weight) {
  return weight === 0 ? [] : [...trafficWeights.filter(candidate => candidate < weight).reverse(), 0];
}

function validateProgressSemantics(plan, progress) {
  verifyPlan(plan);
  if (!validateProgressSchema(progress)) fail(`cutover progress schema validation failed: ${schemaErrors(validateProgressSchema)}`);
  scanPersistedValue(progress);
  if (progress.releaseId !== plan.releaseId) fail("progress releaseId drift detected");
  if (progress.environment !== plan.environment) fail("progress environment drift detected");
  if (progress.trafficProvider !== plan.trafficProvider) fail("progress provider drift detected");
  if (progress.planSha256 !== plan.planSha256) fail("progress plan hash drift detected");
  if (stableJson(progress.artifactHashes) !== stableJson(plan.artifactHashes)) fail("progress artifact hash drift detected");
  if (progress.initialWeight !== plan.initialWeight) fail("progress initialWeight drift detected");

  const initialPrefix = trafficWeights.filter(weight => weight <= plan.initialWeight);
  const expectedPrefix = trafficWeights.slice(0, progress.completedWeights.length);
  if (stableJson(progress.completedWeights) !== stableJson(expectedPrefix) || progress.completedWeights.length < initialPrefix.length) {
    fail("progress completedWeights is not a valid ordered prefix");
  }
  const newCompleted = progress.completedWeights.slice(initialPrefix.length);
  if (stableJson(progress.observations.map(item => item.weight)) !== stableJson(newCompleted)) {
    fail("progress observations do not exactly cover newly completed traffic levels");
  }
  progress.observations.forEach((item, index) => {
    assertArtifactReference(item.providerEvidenceRef, `progress.observations[${index}].providerEvidenceRef`);
    assertArtifactReference(item.observationEvidenceRef, `progress.observations[${index}].observationEvidenceRef`);
  });

  const pending = progress.pendingOperation;
  if (pending) {
    assertArtifactReference(pending.providerEvidenceRef ?? ".artifacts/tke/pending/not-yet-created", "progress.pendingOperation.providerEvidenceRef");
    const expectedKey = pending.direction === "forward"
      ? expectedForwardKey(plan, pending.fromWeight, pending.toWeight)
      : expectedRollbackKey(plan, pending.fromWeight, pending.toWeight);
    if (pending.idempotencyKey !== expectedKey) fail("pending operation idempotency key drift detected");
    if (pending.phase === "APPLY" && pending.providerEvidenceRef) fail("APPLY pending operation cannot claim provider evidence");
    if (pending.phase === "OBSERVE" && !pending.providerEvidenceRef) fail("OBSERVE pending operation requires provider evidence");
  }

  const forwardStatuses = new Set(["READY", "APPLY_PENDING", "APPLY_FAILED", "OBSERVATION_PENDING", "OBSERVATION_FAILED", "CUTOVER_COMPLETE"]);
  if (forwardStatuses.has(progress.status)) {
    if (progress.rollback.status !== "NOT_STARTED") fail("forward status requires rollback NOT_STARTED");
    if (progress.rollback.transitions.length !== 0) fail("forward status cannot contain rollback transitions");
    if (["READY", "CUTOVER_COMPLETE"].includes(progress.status)) {
      if (pending || progress.failure) fail(`${progress.status} cannot contain pending operation or failure`);
      const expectedCurrent = progress.completedWeights.at(-1) ?? 0;
      if (progress.currentWeight !== expectedCurrent) fail(`${progress.status} currentWeight differs from completed prefix`);
      if (progress.status === "CUTOVER_COMPLETE" && progress.completedWeights.length !== 4) fail("CUTOVER_COMPLETE requires all traffic levels");
      if (progress.status === "READY" && progress.completedWeights.length === 4) fail("all traffic levels require CUTOVER_COMPLETE");
    } else {
      if (!pending || pending.direction !== "forward") fail(`${progress.status} requires a forward pending operation`);
      const next = trafficWeights[progress.completedWeights.length];
      if (pending.toWeight !== next || pending.fromWeight !== (progress.completedWeights.at(-1) ?? 0)) {
        fail("forward pending operation does not match the next traffic level");
      }
      const expectedPhase = ["APPLY_PENDING", "APPLY_FAILED"].includes(progress.status) ? "APPLY" : "OBSERVE";
      if (pending.phase !== expectedPhase) fail(`${progress.status} has the wrong pending phase`);
      if (progress.currentWeight !== (pending.phase === "APPLY" ? pending.fromWeight : pending.toWeight)) {
        fail(`${progress.status} currentWeight is inconsistent with pending phase`);
      }
      const shouldFail = progress.status.endsWith("FAILED");
      if (shouldFail !== Boolean(progress.failure)) fail(`${progress.status} failure metadata mismatch`);
      if (progress.failure && progress.failure.kind !== progress.status) fail(`${progress.status} failure kind mismatch`);
    }
    return progress;
  }

  if (progress.rollback.status === "NOT_STARTED" || progress.rollback.startedAtWeight === undefined) {
    fail("rollback status requires startedAtWeight and non-default rollback state");
  }
  const targets = reverseTargets(progress.rollback.startedAtWeight);
  const transitionTargets = progress.rollback.transitions.map(item => item.toWeight);
  if (stableJson(transitionTargets) !== stableJson(targets.slice(0, transitionTargets.length))) {
    fail("rollback transitions are not the reverse traffic prefix");
  }
  progress.rollback.transitions.forEach((item, index) => {
    const expectedFrom = index === 0 ? progress.rollback.startedAtWeight : progress.rollback.transitions[index - 1].toWeight;
    if (item.fromWeight !== expectedFrom) fail("rollback transition chain is broken");
    assertArtifactReference(item.providerEvidenceRef, `progress.rollback.transitions[${index}].providerEvidenceRef`);
    assertArtifactReference(item.observationEvidenceRef, `progress.rollback.transitions[${index}].observationEvidenceRef`);
  });
  const expectedRemaining = targets.slice(progress.rollback.transitions.length);
  if (stableJson(progress.rollback.reverseTargets) !== stableJson(expectedRemaining)) fail("rollback reverseTargets drift detected");
  const settledWeight = progress.rollback.transitions.at(-1)?.toWeight ?? progress.rollback.startedAtWeight;

  if (progress.status === "TRAFFIC_ROLLED_BACK") {
    if (progress.rollback.status !== "TRAFFIC_COMPLETE" || pending || progress.failure || progress.currentWeight !== 0 || expectedRemaining.length !== 0) {
      fail("TRAFFIC_ROLLED_BACK requires complete traffic-only rollback evidence");
    }
    if (typeof progress.rollback.jobsHandoffRequired !== "boolean") fail("traffic rollback must report Jobs handoff requirement");
    return progress;
  }

  if (progress.rollback.status !== "IN_PROGRESS") fail("active rollback requires IN_PROGRESS rollback state");
  if (progress.status === "ROLLBACK_IN_PROGRESS") {
    if (pending || progress.failure || progress.currentWeight !== settledWeight) fail("ROLLBACK_IN_PROGRESS has inconsistent settled state");
    return progress;
  }
  if (!pending || pending.direction !== "rollback") fail(`${progress.status} requires rollback pending operation`);
  if (pending.fromWeight !== settledWeight || pending.toWeight !== expectedRemaining[0]) fail("rollback pending operation differs from reverseTargets head");
  const applyStatus = ["ROLLBACK_APPLY_PENDING", "ROLLBACK_APPLY_FAILED"].includes(progress.status);
  const observeStatus = ["ROLLBACK_OBSERVATION_PENDING", "ROLLBACK_OBSERVATION_FAILED"].includes(progress.status);
  if ((!applyStatus && !observeStatus) || pending.phase !== (applyStatus ? "APPLY" : "OBSERVE")) fail(`${progress.status} has the wrong pending phase`);
  if (progress.currentWeight !== (pending.phase === "APPLY" ? pending.fromWeight : pending.toWeight)) fail("rollback currentWeight is inconsistent with pending phase");
  const shouldFail = progress.status.endsWith("FAILED");
  if (shouldFail !== Boolean(progress.failure)) fail(`${progress.status} failure metadata mismatch`);
  const expectedFailure = applyStatus ? "APPLY_FAILED" : "OBSERVATION_FAILED";
  if (progress.failure && progress.failure.kind !== expectedFailure) fail(`${progress.status} failure kind mismatch`);
  return progress;
}

export function createInitialProgress(plan, now = new Date()) {
  verifyPlan(plan);
  const completedWeights = trafficWeights.filter(weight => weight <= plan.initialWeight);
  const progress = {
    schemaVersion: 1,
    releaseId: plan.releaseId,
    environment: plan.environment,
    trafficProvider: plan.trafficProvider,
    planSha256: plan.planSha256,
    artifactHashes: { ...plan.artifactHashes },
    initialWeight: plan.initialWeight,
    status: completedWeights.length === 4 ? "CUTOVER_COMPLETE" : "READY",
    currentWeight: plan.initialWeight,
    completedWeights,
    observations: [],
    rollback: { status: "NOT_STARTED", transitions: [] },
    revision: 1,
    updatedAt: now.toISOString(),
  };
  return validateProgressSemantics(plan, progress);
}

function parseRuntimeEvidence(plan, evidenceSource, options) {
  const hasBytes = evidenceSource && Object.hasOwn(evidenceSource, "bytes");
  const hasFile = evidenceSource && Object.hasOwn(evidenceSource, "file");
  if (hasBytes === hasFile) fail("runtime evidence must provide exactly one of raw bytes or an ignored file");
  let bytes;
  if (hasBytes) {
    if (!(Buffer.isBuffer(evidenceSource.bytes) || evidenceSource.bytes instanceof Uint8Array || typeof evidenceSource.bytes === "string")) {
      fail("runtime evidence bytes must be Buffer, Uint8Array, or string");
    }
    bytes = Buffer.from(evidenceSource.bytes);
  } else {
    const root = evidenceSource.artifactRoot ?? defaultRepoRoot;
    const reference = path.relative(root, path.resolve(evidenceSource.file)).replaceAll(path.sep, "/");
    const file = resolveArtifact(root, reference, "runtime evidence file");
    bytes = readFileSync(file);
  }
  if (sha256(bytes) !== plan.artifactHashes.evidenceBundle) fail("runtime evidence SHA-256 drift detected");
  let evidence;
  try { evidence = JSON.parse(bytes.toString("utf8")); } catch { fail("runtime evidence is not valid JSON"); }
  if (evidence.releaseId !== plan.releaseId) fail("runtime evidence releaseId drift detected");
  if (evidence.environment !== plan.environment) fail("runtime evidence environment drift detected");
  assertJobsReady(evidence, options);
  return evidence;
}

function assertExecutionToken(plan, token, action, targetWeight) {
  if (!token || typeof token !== "object" || Array.isArray(token)) fail("a bound transient execution token is required");
  const expectedKeys = ["action", "planSha256", "releaseId", "targetWeight"];
  if (stableJson(Object.keys(token).sort()) !== stableJson(expectedKeys)) fail("execution token has unexpected or missing fields");
  if (token.releaseId !== plan.releaseId || token.planSha256 !== plan.planSha256 || token.action !== action || token.targetWeight !== targetWeight) {
    fail("execution token is not bound to this release, plan, action, and target weight");
  }
}

function normalizeProviderEvidence(result, expectedWeight) {
  if (!result || result.tkeWeight !== expectedWeight || result.lighthouseWeight !== 100 - expectedWeight) {
    fail("traffic provider did not report the requested complementary weights");
  }
  assertArtifactReference(result.evidenceRef, "traffic provider evidenceRef");
  return result;
}

function normalizeProviderEvidenceForEither(result, allowedWeights) {
  if (!result || !allowedWeights.includes(result.tkeWeight) || result.lighthouseWeight !== 100 - result.tkeWeight) {
    fail(`traffic provider weight drift detected; expected one of ${allowedWeights.join("/")}`);
  }
  assertArtifactReference(result.evidenceRef, "traffic provider evidenceRef");
  return result;
}

function normalizeObservation(result, expectedWeight, minimumSeconds) {
  if (!result || result.result !== "PASS") fail(`traffic observation for ${expectedWeight}% did not pass`);
  if (result.weight !== expectedWeight) fail("traffic observer reported a different weight");
  if (!Number.isInteger(result.durationSeconds) || result.durationSeconds < minimumSeconds) {
    fail(`traffic observation for ${expectedWeight}% is shorter than ${minimumSeconds} seconds`);
  }
  assertArtifactReference(result.evidenceRef, "traffic observation evidenceRef");
  if (!Number.isFinite(Date.parse(result.observedAt))) fail("traffic observer must return observedAt");
  return result;
}

function withoutFailure(progress) {
  const { failure: _removed, ...rest } = progress;
  return rest;
}

function withoutPendingAndFailure(progress) {
  const { failure: _failure, pendingOperation: _pending, ...rest } = progress;
  return rest;
}

function casCommit(plan, store, current, changes, now) {
  const next = {
    ...changes,
    revision: current.revision + 1,
    updatedAt: now().toISOString(),
  };
  validateProgressSemantics(plan, next);
  if (store.compareAndSwap(current.revision, next) !== true) fail(`cutover progress CAS revision conflict at ${current.revision}`);
  return next;
}

function loadOrCreateProgress(plan, store, now) {
  const existing = store.load();
  if (existing) return validateProgressSemantics(plan, existing);
  const initial = createInitialProgress(plan, now());
  if (store.compareAndSwap(0, initial) !== true) fail("cutover progress CAS initialization conflict");
  return initial;
}

export class InjectedTrafficAdapter {
  constructor(type, transport) {
    if (!providerTypes.has(type)) fail(`unsupported traffic provider type: ${type}`);
    if (!transport || typeof transport.readWeights !== "function" || typeof transport.applyWeights !== "function") {
      fail(`${type} adapter requires an explicitly injected transport`);
    }
    this.type = type;
    this.transport = transport;
  }
  readWeights(context) { return this.transport.readWeights(context); }
  applyWeights(context) { return this.transport.applyWeights(context); }
}

export const createClbAdapter = transport => new InjectedTrafficAdapter("clb", transport);
export const createDnsAdapter = transport => new InjectedTrafficAdapter("dns", transport);

export class CutoverController {
  constructor({ adapter, observer, store, now = () => new Date() }) {
    if (!adapter || !observer || !store) fail("controller requires injected adapter, observer, and progress store");
    if (typeof observer.observe !== "function" || typeof store.load !== "function" || typeof store.compareAndSwap !== "function") {
      fail("observer/store injection does not implement the required interface");
    }
    this.adapter = adapter;
    this.observer = observer;
    this.store = store;
    this.now = now;
  }

  async advance({ plan, evidenceSource, targetWeight, executionToken }) {
    verifyPlan(plan);
    assertExecutionToken(plan, executionToken, "ADVANCE", targetWeight);
    parseRuntimeEvidence(plan, evidenceSource, { requireTke: true });
    let progress = loadOrCreateProgress(plan, this.store, this.now);
    if (this.adapter.type !== plan.trafficProvider) fail("injected adapter type differs from cutover plan");
    if (progress.rollback.status !== "NOT_STARTED") fail("forward cutover is unavailable after rollback has started");

    if (progress.completedWeights.includes(targetWeight)) {
      const actual = normalizeProviderEvidence(await this.adapter.readWeights({ plan }), progress.currentWeight);
      return { progress, idempotent: true, verificationEvidenceRef: actual.evidenceRef };
    }
    const expectedTarget = trafficWeights[progress.completedWeights.length];
    if (targetWeight !== expectedTarget) fail(`next traffic weight must be ${expectedTarget}; levels cannot be skipped`);

    const step = plan.steps.find(item => item.weight === targetWeight);
    let pending = progress.pendingOperation;
    if (!pending) {
      pending = {
        direction: "forward",
        phase: "APPLY",
        fromWeight: progress.currentWeight,
        toWeight: targetWeight,
        idempotencyKey: expectedForwardKey(plan, progress.currentWeight, targetWeight),
      };
      progress = casCommit(plan, this.store, progress, {
        ...withoutFailure(progress), status: "APPLY_PENDING", pendingOperation: pending,
      }, this.now);
    }

    if (pending.phase === "APPLY") {
      try {
        const actual = normalizeProviderEvidenceForEither(await this.adapter.readWeights({ plan }), [pending.fromWeight, pending.toWeight]);
        let applied = actual;
        if (actual.tkeWeight !== pending.toWeight) {
          applied = normalizeProviderEvidence(await this.adapter.applyWeights({
            plan,
            fromWeight: pending.fromWeight,
            toWeight: pending.toWeight,
            idempotencyKey: pending.idempotencyKey,
          }), pending.toWeight);
        }
        pending = { ...pending, phase: "OBSERVE", providerEvidenceRef: applied.evidenceRef };
        progress = casCommit(plan, this.store, progress, {
          ...withoutFailure(progress), status: "OBSERVATION_PENDING", currentWeight: pending.toWeight, pendingOperation: pending,
        }, this.now);
      } catch (error) {
        progress = casCommit(plan, this.store, progress, {
          ...progress, status: "APPLY_FAILED", pendingOperation: pending,
          failure: { kind: "APPLY_FAILED", retryable: true, message: error.message },
        }, this.now);
        error.progress = progress;
        throw error;
      }
    }

    try {
      normalizeProviderEvidence(await this.adapter.readWeights({ plan }), pending.toWeight);
      const observation = normalizeObservation(await this.observer.observe({
        plan, direction: "forward", weight: targetWeight, minimumObservationSeconds: step.minimumObservationSeconds,
      }), targetWeight, step.minimumObservationSeconds);
      const base = withoutPendingAndFailure(progress);
      progress = casCommit(plan, this.store, progress, {
        ...base,
        status: targetWeight === 100 ? "CUTOVER_COMPLETE" : "READY",
        completedWeights: [...progress.completedWeights, targetWeight],
        observations: [...progress.observations, {
          direction: "forward",
          weight: targetWeight,
          providerEvidenceRef: pending.providerEvidenceRef,
          observationEvidenceRef: observation.evidenceRef,
          observedAt: observation.observedAt,
          durationSeconds: observation.durationSeconds,
          result: "PASS",
        }],
      }, this.now);
      return { progress, idempotent: false };
    } catch (error) {
      progress = casCommit(plan, this.store, progress, {
        ...progress, status: "OBSERVATION_FAILED", pendingOperation: pending,
        failure: { kind: "OBSERVATION_FAILED", retryable: true, message: error.message },
      }, this.now);
      error.progress = progress;
      throw error;
    }
  }

  async rollback({ plan, evidenceSource, executionToken }) {
    verifyPlan(plan);
    assertExecutionToken(plan, executionToken, "ROLLBACK_TRAFFIC", 0);
    const evidence = parseRuntimeEvidence(plan, evidenceSource, { requireTke: false });
    let progress = loadOrCreateProgress(plan, this.store, this.now);
    if (this.adapter.type !== plan.trafficProvider) fail("injected adapter type differs from cutover plan");
    if (progress.status === "TRAFFIC_ROLLED_BACK") {
      normalizeProviderEvidence(await this.adapter.readWeights({ plan }), 0);
      return { progress, idempotent: true };
    }

    if (progress.rollback.status === "NOT_STARTED") {
      progress = casCommit(plan, this.store, progress, {
        ...withoutPendingAndFailure(progress),
        status: "ROLLBACK_IN_PROGRESS",
        rollback: {
          status: "IN_PROGRESS",
          startedAtWeight: progress.currentWeight,
          reverseTargets: reverseTargets(progress.currentWeight),
          transitions: [],
        },
      }, this.now);
    }

    while (progress.rollback.reverseTargets.length > 0) {
      let pending = progress.pendingOperation;
      if (!pending) {
        const toWeight = progress.rollback.reverseTargets[0];
        pending = {
          direction: "rollback",
          phase: "APPLY",
          fromWeight: progress.currentWeight,
          toWeight,
          idempotencyKey: expectedRollbackKey(plan, progress.currentWeight, toWeight),
        };
        progress = casCommit(plan, this.store, progress, {
          ...withoutFailure(progress), status: "ROLLBACK_APPLY_PENDING", pendingOperation: pending,
        }, this.now);
      }

      if (pending.phase === "APPLY") {
        try {
          const actual = normalizeProviderEvidenceForEither(await this.adapter.readWeights({ plan }), [pending.fromWeight, pending.toWeight]);
          let applied = actual;
          if (actual.tkeWeight !== pending.toWeight) {
            applied = normalizeProviderEvidence(await this.adapter.applyWeights({
              plan,
              fromWeight: pending.fromWeight,
              toWeight: pending.toWeight,
              idempotencyKey: pending.idempotencyKey,
            }), pending.toWeight);
          }
          pending = { ...pending, phase: "OBSERVE", providerEvidenceRef: applied.evidenceRef };
          progress = casCommit(plan, this.store, progress, {
            ...withoutFailure(progress), status: "ROLLBACK_OBSERVATION_PENDING",
            currentWeight: pending.toWeight, pendingOperation: pending,
          }, this.now);
        } catch (error) {
          progress = casCommit(plan, this.store, progress, {
            ...progress, status: "ROLLBACK_APPLY_FAILED", pendingOperation: pending,
            failure: { kind: "APPLY_FAILED", retryable: true, message: error.message },
          }, this.now);
          error.progress = progress;
          throw error;
        }
      }

      try {
        normalizeProviderEvidence(await this.adapter.readWeights({ plan }), pending.toWeight);
        const observation = normalizeObservation(await this.observer.observe({
          plan,
          direction: "rollback",
          weight: pending.toWeight,
          minimumObservationSeconds: plan.rollback.minimumObservationSeconds,
        }), pending.toWeight, plan.rollback.minimumObservationSeconds);
        const transition = {
          fromWeight: pending.fromWeight,
          toWeight: pending.toWeight,
          providerEvidenceRef: pending.providerEvidenceRef,
          observationEvidenceRef: observation.evidenceRef,
          observedAt: observation.observedAt,
          durationSeconds: observation.durationSeconds,
          result: "PASS",
        };
        const base = withoutPendingAndFailure(progress);
        progress = casCommit(plan, this.store, progress, {
          ...base,
          status: "ROLLBACK_IN_PROGRESS",
          rollback: {
            ...progress.rollback,
            reverseTargets: progress.rollback.reverseTargets.slice(1),
            transitions: [...progress.rollback.transitions, transition],
          },
        }, this.now);
      } catch (error) {
        progress = casCommit(plan, this.store, progress, {
          ...progress, status: "ROLLBACK_OBSERVATION_FAILED", pendingOperation: pending,
          failure: { kind: "OBSERVATION_FAILED", retryable: true, message: error.message },
        }, this.now);
        error.progress = progress;
        throw error;
      }
    }

    progress = casCommit(plan, this.store, progress, {
      ...withoutPendingAndFailure(progress),
      status: "TRAFFIC_ROLLED_BACK",
      currentWeight: 0,
      rollback: {
        ...progress.rollback,
        status: "TRAFFIC_COMPLETE",
        jobsHandoffRequired: evidence.jobsSingleActive.tkeState === "ACTIVE",
      },
    }, this.now);
    return { progress, idempotent: false };
  }
}

export function createMemoryProgressStore(initialValue) {
  let value = initialValue ? structuredClone(initialValue) : undefined;
  return {
    load: () => value ? structuredClone(value) : undefined,
    compareAndSwap: (expectedRevision, next) => {
      const actualRevision = value?.revision ?? 0;
      if (actualRevision !== expectedRevision) return false;
      value = structuredClone(next);
      return true;
    },
  };
}

function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
}

export function prepareCutoverPlan({ requestFile, outputFile, artifactRoot = defaultRepoRoot }) {
  const requestReference = path.relative(artifactRoot, path.resolve(requestFile)).replaceAll(path.sep, "/");
  if (!requestReference.startsWith(".artifacts/tke/") || !existsSync(requestFile)) {
    fail("cutover request must be an existing file below .artifacts/tke");
  }
  const request = readJson(requestFile);
  validateRequest(request);
  const loaded = {};
  const actualHashes = {};
  for (const [name, reference] of Object.entries(request.files)) {
    const file = resolveArtifact(artifactRoot, reference, `request.files.${name}`);
    const bytes = readFileSync(file);
    actualHashes[name] = sha256(bytes);
    loaded[name] = JSON.parse(bytes.toString("utf8"));
  }
  const plan = buildCutoverPlan({
    request,
    releaseManifest: loaded.releaseManifest,
    cloudBundle: loaded.cloudBundle,
    evidenceBundle: loaded.evidenceBundle,
    checkpoint: loaded.checkpoint,
    actualHashes,
  });
  const outputReference = path.relative(artifactRoot, path.resolve(outputFile)).replaceAll(path.sep, "/");
  resolveArtifact(artifactRoot, outputReference, "cutover plan output", false);
  atomicWriteJson(outputFile, plan);
  return plan;
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) fail("arguments must be --name value pairs");
    const name = argv[index].slice(2);
    if (!["request", "output"].includes(name)) fail(`unsupported argument --${name}; this CLI only prepares offline plans`);
    values[name] = argv[index + 1];
  }
  if (!values.request || !values.output) fail("missing --request or --output");
  return values;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const plan = prepareCutoverPlan({
      requestFile: path.resolve(defaultRepoRoot, args.request),
      outputFile: path.resolve(defaultRepoRoot, args.output),
    });
    console.log(`tke-cutover: OFFLINE plan ${plan.planSha256} prepared; external execution remains disabled`);
  } catch (error) {
    console.error(`tke-cutover: BLOCKED - ${error.message}`);
    process.exitCode = 1;
  }
}
