import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractsRoot = path.join(repoRoot, "deploy/tke/contracts");

export const CONTRACTS = Object.freeze({
  releaseManifest: "release-manifest.schema.json",
  imageLock: "images-lock.schema.json",
  cloudBundle: "cloud-bundle.schema.json",
  checkpoint: "checkpoint.schema.json",
  evidenceBundle: "evidence-bundle.schema.json",
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

const rollbackStates = new Set(FORWARD_STATES.slice(FORWARD_STATES.indexOf("DEPLOYED_NO_TRAFFIC"), -1));
const forbiddenArtifactKeys = /^(?:password|passwd|secret|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKeyId|accessKeySecret|authorizations)$/i;
const forbiddenArtifactValues = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|\W)AKID[A-Za-z0-9]{12,}(?:$|\W)/,
];
const artifactPath = /^\.artifacts\/tke\//;
const expectedTrafficSteps = [5, 25, 50, 100];

const stateRequiredStages = Object.freeze({
  ARTIFACTS_READY: ["PREPARE", "IMAGES_PUBLISHED", "CLOUD_BUNDLE_READY", "SAFETY_CONTRACT_READY"],
  PLAN_REVIEWED: ["PLAN_INFRASTRUCTURE"],
  INFRA_READY: ["APPLY_INFRASTRUCTURE"],
  DEPLOYED_NO_TRAFFIC: ["DEPLOY_NO_TRAFFIC"],
  BACKUP_VERIFIED: ["VERIFY_BACKUP"],
  MIGRATED: ["MIGRATE_DATA"],
  SMOKE_PASS: ["SMOKE"],
  JOBS_SWITCHED: ["SWITCH_JOBS"],
  TRAFFIC_5: ["TRAFFIC_5"],
  TRAFFIC_25: ["TRAFFIC_25"],
  TRAFFIC_50: ["TRAFFIC_50"],
  TRAFFIC_100: ["TRAFFIC_100"],
  OBSERVED: ["OBSERVE"],
  LIGHTHOUSE_RETIRED: ["RETIRE_LIGHTHOUSE"],
  ROLLED_BACK: ["ROLLBACK"],
});

const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const fail = message => {
  throw new Error(message);
};

function scanForCredentials(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForCredentials(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenArtifactKeys.test(key)) fail(`${location}.${key} is a forbidden credential or authorization field`);
      scanForCredentials(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    for (const pattern of forbiddenArtifactValues) {
      if (pattern.test(value)) fail(`${location} contains credential-like content`);
    }
  }
}

function compileContracts(root = contractsRoot) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validators = {};
  for (const [name, file] of Object.entries(CONTRACTS)) {
    const resolved = path.join(root, file);
    if (!existsSync(resolved)) fail(`missing release contract schema: ${file}`);
    validators[name] = ajv.compile(readJson(resolved));
  }
  return validators;
}

let defaultValidators;

export function validateContract(name, value, root = contractsRoot) {
  const validators = root === contractsRoot
    ? (defaultValidators ??= compileContracts(root))
    : compileContracts(root);
  const validate = validators[name];
  if (!validate) fail(`unknown release contract: ${name}`);
  if (!validate(value)) {
    const details = validate.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ") ?? "unknown error";
    fail(`${name} schema validation failed: ${details}`);
  }
  scanForCredentials(value);
  return value;
}

export function assertTransition(from, to, options = {}) {
  if (from === "LIGHTHOUSE_RETIRED" || from === "ROLLED_BACK") {
    fail(`${from} is terminal for the release ID`);
  }
  if (to === "FAILED") return true;
  if (from === "FAILED") {
    if (!options.resumeState || options.resumeState !== to || !FORWARD_STATES.includes(to)) {
      fail("FAILED may resume only to its recorded forward resumeState");
    }
    return true;
  }
  if (to === "ROLLED_BACK") {
    if (!rollbackStates.has(from)) fail(`rollback is not available from ${from}`);
    return true;
  }
  const index = FORWARD_STATES.indexOf(from);
  if (index < 0 || FORWARD_STATES[index + 1] !== to) {
    fail(`illegal release transition ${from} -> ${to}`);
  }
  return true;
}

export function validateCheckpointSemantics(checkpoint) {
  validateContract("checkpoint", checkpoint);
  const completed = new Set(checkpoint.completedStages);
  const currentIndex = FORWARD_STATES.indexOf(checkpoint.currentState);
  if (currentIndex > 0) {
    for (const state of FORWARD_STATES.slice(1, currentIndex + 1)) {
      for (const stage of stateRequiredStages[state] ?? []) {
        if (!completed.has(stage)) fail(`${checkpoint.currentState} requires completed stage ${stage}`);
      }
    }
  }
  for (const stage of stateRequiredStages[checkpoint.currentState] ?? []) {
    if (!completed.has(stage)) fail(`${checkpoint.currentState} requires completed stage ${stage}`);
  }
  if (checkpoint.currentState === "FAILED" && !checkpoint.failure) fail("FAILED requires failure metadata");
  if (checkpoint.currentState !== "FAILED" && checkpoint.failure) fail("failure metadata is allowed only in FAILED state");
  return checkpoint;
}

export function validateEvidenceSemantics(evidence) {
  validateContract("evidenceBundle", evidence);
  if (evidence.jobsSingleActive.lighthouseState === "ACTIVE" && evidence.jobsSingleActive.tkeState === "ACTIVE") {
    fail("Lighthouse and TKE jobs must never both be ACTIVE");
  }
  const weights = (evidence.trafficObservations ?? []).map(item => item.weight);
  for (let index = 0; index < weights.length; index += 1) {
    if (weights[index] !== expectedTrafficSteps[index]) {
      fail("traffic observations must be the ordered 5/25/50/100 prefix");
    }
  }
  return evidence;
}

export function validateContractBundle(bundle) {
  const release = validateContract("releaseManifest", bundle.releaseManifest);
  const images = validateContract("imageLock", bundle.imageLock);
  const cloud = validateContract("cloudBundle", bundle.cloudBundle);
  const checkpoint = validateCheckpointSemantics(bundle.checkpoint);
  const evidence = validateEvidenceSemantics(bundle.evidenceBundle);

  for (const [name, value] of Object.entries({ images, checkpoint, evidence })) {
    if (value.releaseId !== release.releaseId) fail(`${name} releaseId does not match release manifest`);
  }
  for (const [name, value] of Object.entries({ cloud, checkpoint, evidence })) {
    if (value.environment !== release.environment) fail(`${name} environment does not match release manifest`);
  }
  if (images.sourceCommit !== release.sourceCommit) fail("image lock sourceCommit does not match release manifest");
  if (Date.parse(release.changeWindow.endsAt) <= Date.parse(release.changeWindow.startsAt)) {
    fail("release changeWindow must end after it starts");
  }
  if (cloud.costReview.monthlyMin > cloud.costReview.monthlyMax) fail("costReview monthlyMin must not exceed monthlyMax");
  for (const [name, image] of Object.entries(images.images)) {
    if (/:[^/]+$/.test(image.repository)) fail(`${name} repository must not contain a mutable tag`);
    if (/^sha256:0{64}$/.test(image.digest)) fail(`${name} digest must not be all zeroes`);
  }
  for (const [name, value] of Object.entries({
    imageLockFile: release.imageLockFile,
    cloudBundleFile: release.cloudBundleFile,
    evidenceFile: release.evidenceFile,
    checkpointFile: release.checkpointFile,
  })) {
    if (!artifactPath.test(value)) fail(`${name} must remain below .artifacts/tke`);
  }
  return bundle;
}

export function checkRepositoryContracts(root = repoRoot) {
  const contractRoot = path.join(root, "deploy/tke/contracts");
  compileContracts(contractRoot);
  const examplesRoot = path.join(contractRoot, "examples");
  const bundle = {
    releaseManifest: readJson(path.join(examplesRoot, "release-manifest.example.json")),
    imageLock: readJson(path.join(examplesRoot, "images-lock.example.json")),
    cloudBundle: readJson(path.join(examplesRoot, "cloud-bundle.example.json")),
    checkpoint: readJson(path.join(examplesRoot, "checkpoint.example.json")),
    evidenceBundle: readJson(path.join(examplesRoot, "evidence-bundle.example.json")),
  };
  validateContractBundle(bundle);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    checkRepositoryContracts();
    console.log("tke-release-contracts: schemas, examples, state machine, and safety boundaries passed");
  } catch (error) {
    console.error(`tke-release-contracts: FAILED - ${error.message}`);
    process.exitCode = 1;
  }
}
