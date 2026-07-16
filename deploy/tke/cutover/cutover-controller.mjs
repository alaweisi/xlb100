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
const trafficWeights = Object.freeze([5, 25, 50, 100]);
const forbiddenKeys = /^(?:password|passwd|secret|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKeyId|accessKeySecret|authorization|authorizations|approval|approvals|confirmed|executionGrant)$/i;

const fail = message => { throw new Error(message); };
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const hashBuffer = value => createHash("sha256").update(value).digest("hex");
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
};
const stableJson = value => JSON.stringify(stableValue(value));
const hashObject = value => hashBuffer(stableJson(value));

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

function validateRequest(request) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson(requestSchemaFile));
  if (!validate(request)) {
    const details = validate.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ");
    fail(`cutover request schema validation failed: ${details}`);
  }
  scanPersistedValue(request);
  const weights = request.steps.map(step => step.weight);
  if (weights.some((weight, index) => weight !== trafficWeights[index])) {
    fail("cutover steps must be exactly 5/25/50/100 and cannot skip or reorder a level");
  }
  return request;
}

function resolveArtifact(root, reference, label) {
  if (typeof reference !== "string" || !reference.startsWith(".artifacts/tke/")) {
    fail(`${label} must remain below .artifacts/tke`);
  }
  const artifactRoot = path.resolve(root, ".artifacts", "tke");
  const resolved = path.resolve(root, reference.replaceAll("/", path.sep));
  if (!resolved.startsWith(`${artifactRoot}${path.sep}`)) fail(`${label} escapes .artifacts/tke`);
  if (!existsSync(resolved)) fail(`${label} does not exist: ${reference}`);
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
  const checkpointBindings = {
    releaseManifest: checkpoint.artifactHashes.releaseManifest,
    cloudBundle: checkpoint.artifactHashes.cloudBundle,
    evidenceBundle: checkpoint.artifactHashes.evidenceBundle,
  };
  for (const [name, expected] of Object.entries(checkpointBindings)) {
    if (!expected) fail(`checkpoint artifactHashes.${name} is required for cutover`);
    if (expected !== request.expectedHashes[name]) fail(`checkpoint ${name} binding drift detected`);
  }
}

function assertJobsReady(evidence, { requireTke = true } = {}) {
  validateEvidenceSemantics(evidence);
  const jobs = evidence.jobsSingleActive;
  const exactlyOneActive = (jobs.lighthouseState === "ACTIVE") !== (jobs.tkeState === "ACTIVE");
  if (!exactlyOneActive) fail("cutover requires exactly one active Jobs side");
  if (requireTke && (jobs.lighthouseState !== "STOPPED" || jobs.tkeState !== "ACTIVE")) {
    fail("forward traffic cutover requires Lighthouse Jobs STOPPED and TKE Jobs ACTIVE");
  }
}

function assertRuntimeEvidence(plan, evidence, evidenceSha256, options) {
  if (evidenceSha256 !== plan.artifactHashes.evidenceBundle) fail("runtime evidence SHA-256 drift detected");
  if (evidence.releaseId !== plan.releaseId) fail("runtime evidence releaseId drift detected");
  if (evidence.environment !== plan.environment) fail("runtime evidence environment drift detected");
  assertJobsReady(evidence, options);
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
  if (evidenceBundle.trafficObservations?.some(item => item.result !== "PASS")) {
    fail("existing traffic observations must all be PASS");
  }

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
      reverseOrder: initialWeight === 0 ? [] : [...trafficWeights.filter(weight => weight < initialWeight).reverse(), 0],
    },
    artifactHashes: { ...request.expectedHashes },
    externalExecutionEnabled: false,
  };
  const plan = { ...planBody, planSha256: hashObject(planBody) };
  scanPersistedValue(plan);
  return plan;
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
    status: completedWeights.length === 4 ? "CUTOVER_COMPLETE" : "READY",
    currentWeight: plan.initialWeight,
    completedWeights,
    observations: [],
    rollback: { status: "NOT_STARTED", transitions: [] },
    revision: 1,
    updatedAt: now.toISOString(),
  };
  scanPersistedValue(progress);
  return progress;
}

function verifyPlan(plan) {
  const { planSha256, ...body } = plan;
  if (hashObject(body) !== planSha256) fail("cutover plan hash drift detected");
  if (body.externalExecutionEnabled !== false) fail("persisted cutover plans cannot enable external execution");
  scanPersistedValue(plan);
}

function verifyProgress(plan, progress) {
  verifyPlan(plan);
  scanPersistedValue(progress);
  if (progress.releaseId !== plan.releaseId) fail("progress releaseId drift detected");
  if (progress.environment !== plan.environment) fail("progress environment drift detected");
  if (progress.trafficProvider !== plan.trafficProvider) fail("progress provider drift detected");
  if (progress.planSha256 !== plan.planSha256) fail("progress plan hash drift detected");
  if (stableJson(progress.artifactHashes) !== stableJson(plan.artifactHashes)) fail("progress artifact hash drift detected");
  const expectedPrefix = trafficWeights.slice(0, progress.completedWeights.length);
  if (stableJson(progress.completedWeights) !== stableJson(expectedPrefix)) fail("progress completedWeights is not the ordered traffic prefix");
}

function nextWeight(progress) {
  return trafficWeights[progress.completedWeights.length];
}

function operationKey(plan, direction, fromWeight, toWeight) {
  return `${plan.releaseId}:${plan.planSha256.slice(0, 12)}:${direction}:${fromWeight}-${toWeight}`;
}

function assertTransientConfirmation(confirmed) {
  if (confirmed !== true) fail("external traffic execution requires a transient runtime confirmation");
}

function normalizeProviderEvidence(result, expectedWeight) {
  if (!result || result.tkeWeight !== expectedWeight || result.lighthouseWeight !== 100 - expectedWeight) {
    fail("traffic provider did not report the requested complementary weights");
  }
  if (typeof result.evidenceRef !== "string" || !result.evidenceRef.startsWith(".artifacts/tke/")) {
    fail("traffic provider must return an ignored evidenceRef");
  }
  return result;
}

function normalizeObservation(result, expectedWeight, minimumSeconds) {
  if (!result || result.result !== "PASS") fail(`traffic observation for ${expectedWeight}% did not pass`);
  if (result.weight !== expectedWeight) fail("traffic observer reported a different weight");
  if (!Number.isInteger(result.durationSeconds) || result.durationSeconds < minimumSeconds) {
    fail(`traffic observation for ${expectedWeight}% is shorter than ${minimumSeconds} seconds`);
  }
  if (typeof result.evidenceRef !== "string" || !result.evidenceRef.startsWith(".artifacts/tke/")) {
    fail("traffic observer must return an ignored evidenceRef");
  }
  if (!Number.isFinite(Date.parse(result.observedAt))) fail("traffic observer must return observedAt");
  return result;
}

function saveProgress(store, progress, now) {
  const next = { ...progress, revision: progress.revision + 1, updatedAt: now().toISOString() };
  scanPersistedValue(next);
  store.save(next);
  return next;
}

export class InjectedTrafficAdapter {
  constructor(type, transport) {
    if (!trafficProviderTypes.has(type)) fail(`unsupported traffic provider type: ${type}`);
    if (!transport || typeof transport.readWeights !== "function" || typeof transport.applyWeights !== "function") {
      fail(`${type} adapter requires an explicitly injected transport`);
    }
    this.type = type;
    this.transport = transport;
  }

  readWeights(context) { return this.transport.readWeights(context); }
  applyWeights(context) { return this.transport.applyWeights(context); }
}

const trafficProviderTypes = new Set(["clb", "dns"]);
export const createClbAdapter = transport => new InjectedTrafficAdapter("clb", transport);
export const createDnsAdapter = transport => new InjectedTrafficAdapter("dns", transport);

export class CutoverController {
  constructor({ adapter, observer, store, now = () => new Date() }) {
    if (!adapter || !observer || !store) fail("controller requires injected adapter, observer, and progress store");
    if (typeof observer.observe !== "function" || typeof store.load !== "function" || typeof store.save !== "function") {
      fail("observer/store injection does not implement the required interface");
    }
    this.adapter = adapter;
    this.observer = observer;
    this.store = store;
    this.now = now;
  }

  async advance({ plan, evidenceBundle, evidenceSha256, targetWeight, confirmed = false }) {
    assertTransientConfirmation(confirmed);
    assertRuntimeEvidence(plan, evidenceBundle, evidenceSha256);
    let progress = this.store.load() ?? createInitialProgress(plan, this.now());
    verifyProgress(plan, progress);
    if (this.adapter.type !== plan.trafficProvider) fail("injected adapter type differs from cutover plan");
    if (progress.rollback.status !== "NOT_STARTED") fail("forward cutover is unavailable after rollback has started");
    if (progress.completedWeights.includes(targetWeight)) return { progress, idempotent: true };
    const expectedTarget = nextWeight(progress);
    if (targetWeight !== expectedTarget) fail(`next traffic weight must be ${expectedTarget}; levels cannot be skipped`);

    const step = plan.steps.find(item => item.weight === targetWeight);
    const fromWeight = progress.currentWeight;
    const pending = progress.pendingObservation;
    if (!pending) {
      const actual = await this.adapter.readWeights({ plan });
      normalizeProviderEvidence(actual, fromWeight);
      const providerResult = normalizeProviderEvidence(await this.adapter.applyWeights({
        plan,
        fromWeight,
        toWeight: targetWeight,
        idempotencyKey: operationKey(plan, "forward", fromWeight, targetWeight),
      }), targetWeight);
      progress = saveProgress(this.store, {
        ...progress,
        status: "OBSERVATION_PENDING",
        currentWeight: targetWeight,
        pendingObservation: {
          direction: "forward",
          weight: targetWeight,
          providerEvidenceRef: providerResult.evidenceRef,
        },
      }, this.now);
    } else if (pending.direction !== "forward" || pending.weight !== targetWeight) {
      fail("a different traffic observation is already pending");
    }

    try {
      const observation = normalizeObservation(await this.observer.observe({
        plan,
        direction: "forward",
        weight: targetWeight,
        minimumObservationSeconds: step.minimumObservationSeconds,
      }), targetWeight, step.minimumObservationSeconds);
      const { pendingObservation: _removed, failure: _failure, ...rest } = progress;
      progress = saveProgress(this.store, {
        ...rest,
        status: targetWeight === 100 ? "CUTOVER_COMPLETE" : "READY",
        completedWeights: [...progress.completedWeights, targetWeight],
        observations: [...progress.observations, {
          direction: "forward",
          weight: targetWeight,
          providerEvidenceRef: progress.pendingObservation.providerEvidenceRef,
          observationEvidenceRef: observation.evidenceRef,
          observedAt: observation.observedAt,
          durationSeconds: observation.durationSeconds,
          result: "PASS",
        }],
      }, this.now);
      return { progress, idempotent: false };
    } catch (error) {
      progress = saveProgress(this.store, {
        ...progress,
        status: "FAILED",
        failure: { operation: `TRAFFIC_${targetWeight}`, retryable: true, message: error.message },
      }, this.now);
      error.progress = progress;
      throw error;
    }
  }

  async rollback({ plan, evidenceBundle, evidenceSha256, confirmed = false }) {
    assertTransientConfirmation(confirmed);
    assertRuntimeEvidence(plan, evidenceBundle, evidenceSha256, { requireTke: false });
    let progress = this.store.load() ?? createInitialProgress(plan, this.now());
    verifyProgress(plan, progress);
    if (this.adapter.type !== plan.trafficProvider) fail("injected adapter type differs from cutover plan");
    if (progress.rollback.status === "COMPLETE") return { progress, idempotent: true };

    if (progress.rollback.status === "NOT_STARTED") {
      const reverseTargets = progress.currentWeight === 0
        ? []
        : [...trafficWeights.filter(weight => weight < progress.currentWeight).reverse(), 0];
      progress = saveProgress(this.store, {
        ...progress,
        status: "ROLLBACK_IN_PROGRESS",
        rollback: { status: "IN_PROGRESS", reverseTargets, transitions: [] },
      }, this.now);
    }

    while (progress.rollback.reverseTargets.length > 0) {
      const toWeight = progress.rollback.reverseTargets[0];
      const fromWeight = progress.currentWeight;
      let pending = progress.rollback.pendingObservation;
      if (!pending) {
        const actual = await this.adapter.readWeights({ plan });
        normalizeProviderEvidence(actual, fromWeight);
        const providerResult = normalizeProviderEvidence(await this.adapter.applyWeights({
          plan,
          fromWeight,
          toWeight,
          idempotencyKey: operationKey(plan, "rollback", fromWeight, toWeight),
        }), toWeight);
        pending = { fromWeight, toWeight, providerEvidenceRef: providerResult.evidenceRef };
        progress = saveProgress(this.store, {
          ...progress,
          currentWeight: toWeight,
          rollback: { ...progress.rollback, pendingObservation: pending },
        }, this.now);
      }

      try {
        const observation = normalizeObservation(await this.observer.observe({
          plan,
          direction: "rollback",
          weight: toWeight,
          minimumObservationSeconds: 0,
        }), toWeight, 0);
        const { pendingObservation: _removed, ...rollbackRest } = progress.rollback;
        progress = saveProgress(this.store, {
          ...progress,
          rollback: {
            ...rollbackRest,
            reverseTargets: progress.rollback.reverseTargets.slice(1),
            transitions: [...progress.rollback.transitions, {
              fromWeight: pending.fromWeight,
              toWeight,
              providerEvidenceRef: pending.providerEvidenceRef,
              observationEvidenceRef: observation.evidenceRef,
              observedAt: observation.observedAt,
              result: "PASS",
            }],
          },
        }, this.now);
      } catch (error) {
        progress = saveProgress(this.store, {
          ...progress,
          status: "ROLLBACK_FAILED",
          rollback: { ...progress.rollback, status: "FAILED", failure: { retryable: true, message: error.message } },
        }, this.now);
        error.progress = progress;
        throw error;
      }
    }

    const { failure: _failure, ...rollbackRest } = progress.rollback;
    progress = saveProgress(this.store, {
      ...progress,
      status: "ROLLED_BACK",
      completedWeights: [],
      rollback: {
        ...rollbackRest,
        status: "COMPLETE",
        jobsHandoffRequired: evidenceBundle.jobsSingleActive.tkeState === "ACTIVE",
      },
    }, this.now);
    return { progress, idempotent: false };
  }
}

export function createMemoryProgressStore(initialValue) {
  let value = initialValue ? structuredClone(initialValue) : undefined;
  return {
    load: () => value ? structuredClone(value) : undefined,
    save: next => { value = structuredClone(next); },
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
    const content = readFileSync(file);
    actualHashes[name] = hashBuffer(content);
    loaded[name] = JSON.parse(content.toString("utf8"));
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
  if (!outputReference.startsWith(".artifacts/tke/")) fail("cutover plan output must remain below .artifacts/tke");
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
