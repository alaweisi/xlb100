import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPONENTS = Object.freeze({
  backend: Object.freeze({ dockerfile: "infra/docker/Dockerfile.backend", buildArgs: [] }),
  customer: Object.freeze({ dockerfile: "infra/docker/Dockerfile.frontend", buildArgs: ["APP_NAME=customer", "APP_BASE=/customer/"] }),
  worker: Object.freeze({ dockerfile: "infra/docker/Dockerfile.frontend", buildArgs: ["APP_NAME=worker", "APP_BASE=/worker/"] }),
  admin: Object.freeze({ dockerfile: "infra/docker/Dockerfile.frontend", buildArgs: ["APP_NAME=admin", "APP_BASE=/admin/"] }),
  oa: Object.freeze({ dockerfile: "infra/docker/Dockerfile.frontend", buildArgs: ["APP_NAME=oa", "APP_BASE=/oa/"] }),
  dashboard: Object.freeze({ dockerfile: "infra/docker/Dockerfile.frontend", buildArgs: ["APP_NAME=dashboard", "APP_BASE=/dashboard/"] }),
});

const RELEASE_ID = /^[a-z0-9](?:[a-z0-9.-]{4,61}[a-z0-9])$/;
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY_PREFIX = /^(?:[a-z0-9.-]+(?::[0-9]+)?\/)[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PLACEHOLDER = /(?:placeholder|example\.invalid|replace[_-]?with|change-me|<[^>]+>)/i;
const FORBIDDEN_KEY = /(?:password|passwd|secret|token|credential|kubeconfig|privatekey|accesskey)/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKID[A-Za-z0-9]{12,}\b)/;
const MODES = new Set(["plan", "build", "publish", "freeze"]);

const fail = message => { throw new Error(message); };
const toPosix = value => value.replaceAll("\\", "/");

function scanForCredentials(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanForCredentials(child, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail(`${location}.${key} is a forbidden credential field`);
      scanForCredentials(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && CREDENTIAL_VALUE.test(value)) {
    fail(`${location} contains credential-like content`);
  }
}

function validateInput(input) {
  scanForCredentials(input);
  const allowed = new Set(["releaseId", "environment", "repositoryPrefix", "sourceCommit", "owners", "changeWindow", "trafficProvider"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail(`unknown release input field: ${key}`);
  }
  if (!RELEASE_ID.test(input.releaseId ?? "")) fail("releaseId must be DNS-safe and 6-63 characters");
  if (input.releaseId === "latest") fail("releaseId must not be latest");
  if (!REPOSITORY_PREFIX.test(input.repositoryPrefix ?? "")) fail("repositoryPrefix must be an untagged registry path");
  if (PLACEHOLDER.test(input.repositoryPrefix)) fail("repositoryPrefix contains a placeholder marker");
  if (/:([^/]+)$/.test(input.repositoryPrefix)) fail("repositoryPrefix must not contain a mutable tag");
  if (!new Set(["staging", "production"]).has(input.environment)) fail("environment must be staging or production");
  if (!new Set(["clb", "dns"]).has(input.trafficProvider)) fail("trafficProvider must be clb or dns");
  for (const name of ["release", "data", "onCall", "cost"]) {
    const owner = input.owners?.[name];
    if (typeof owner !== "string" || owner.trim().length === 0 || owner.length > 160 || PLACEHOLDER.test(owner)) fail(`owners.${name} is required and must not be a placeholder`);
  }
  if (Object.keys(input.owners ?? {}).some(key => !["release", "data", "onCall", "cost"].includes(key))) fail("owners contains an unknown field");
  const { startsAt, endsAt, timezone } = input.changeWindow ?? {};
  if (!TIMESTAMP.test(startsAt ?? "") || !TIMESTAMP.test(endsAt ?? "") || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) {
    fail("changeWindow requires UTC timestamps with seconds and optional milliseconds");
  }
  if (Object.keys(input.changeWindow ?? {}).some(key => !["startsAt", "endsAt", "timezone"].includes(key))) fail("changeWindow contains an unknown field");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) fail("changeWindow endsAt must be after startsAt");
  if (timezone !== "Asia/Shanghai") fail("changeWindow timezone must be Asia/Shanghai");
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} failed with exit code ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function writeJsonAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  if (existsSync(file)) {
    writeFileSync(file, readFileSync(temporary));
    rmSync(temporary);
    return;
  }
  renameSync(temporary, file);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`invalid JSON at ${file}: ${error.message}`);
  }
}

function releaseArtifactPath(releaseId, suffix) {
  return `.artifacts/tke/releases/${releaseId}/${suffix}`;
}

function buildReleaseManifest(input, sourceCommit, createdAt) {
  const base = `.artifacts/tke/releases/${input.releaseId}`;
  return {
    schemaVersion: 1,
    releaseId: input.releaseId,
    environment: input.environment,
    executionMode: "gated-release",
    sourceCommit,
    createdAt,
    owners: input.owners,
    changeWindow: input.changeWindow,
    imageLockFile: `${base}/images.lock.json`,
    cloudBundleFile: `.artifacts/tke/${input.environment}/cloud-bundle.json`,
    evidenceFile: `${base}/evidence.json`,
    checkpointFile: `${base}/checkpoint.json`,
    trafficProvider: input.trafficProvider,
  };
}

function compareIdentity(existing, desired, label) {
  const normalizedDesired = { ...desired, createdAt: existing.createdAt };
  if (JSON.stringify(existing) !== JSON.stringify(normalizedDesired)) {
    fail(`${label} already exists with different release identity; choose a new releaseId`);
  }
  return existing;
}

function commandPlan(input, mode) {
  return Object.entries(COMPONENTS).map(([name, definition]) => ({
    component: name,
    dockerfile: definition.dockerfile,
    buildArgs: definition.buildArgs,
    taggedReference: `${input.repositoryPrefix}/${name}:${input.releaseId}`,
    action: mode === "plan" ? "would-build" : mode,
  }));
}

function runBuild(definition, reference, { mode, repoRoot, runner, releaseId, sourceCommit }) {
  const args = mode === "publish"
    ? ["buildx", "build", "--file", definition.dockerfile, "--tag", reference, "--push"]
    : ["build", "--file", definition.dockerfile, "--tag", reference];
  args.push("--label", `org.opencontainers.image.revision=${sourceCommit}`);
  args.push("--label", `org.opencontainers.image.version=${releaseId}`);
  for (const buildArg of definition.buildArgs) args.push("--build-arg", buildArg);
  args.push(".");
  runner("docker", args, { cwd: repoRoot });
}

function inspectDigest(reference, runner, repoRoot) {
  const result = runner("docker", ["buildx", "imagetools", "inspect", reference, "--format", "{{json .Manifest.Digest}}"], {
    cwd: repoRoot,
    capture: true,
  });
  const digest = result.stdout.trim().replace(/^"|"$/g, "").toLowerCase();
  if (!DIGEST.test(digest)) fail(`registry did not return a valid immutable digest for ${reference}`);
  if (/^sha256:0{64}$/.test(digest)) fail(`registry returned an all-zero placeholder digest for ${reference}`);
  return digest;
}

function generateSupplyChainEvidence(immutableReference, component, artifactRoot, runner, repoRoot) {
  const sbom = path.join(artifactRoot, "sbom", `${component}.cdx.json`);
  const scan = path.join(artifactRoot, "scans", `${component}.json`);
  mkdirSync(path.dirname(sbom), { recursive: true });
  mkdirSync(path.dirname(scan), { recursive: true });
  runner("syft", [immutableReference, "-o", `cyclonedx-json=${sbom}`], { cwd: repoRoot });
  runner("trivy", ["image", "--format", "json", "--output", scan, "--severity", "HIGH,CRITICAL", "--exit-code", "1", immutableReference], { cwd: repoRoot });
  if (!existsSync(sbom) || !existsSync(scan)) fail(`SBOM or scan evidence was not produced for ${component}`);
  readJson(sbom);
  readJson(scan);
}

function gitCommit(repoRoot, runner) {
  const result = runner("git", ["rev-parse", "HEAD"], { cwd: repoRoot, capture: true });
  const commit = result.stdout.trim().toLowerCase();
  if (!COMMIT.test(commit)) fail("current Git HEAD is not a full commit SHA");
  return commit;
}

export function assertIgnoredArtifactInput(repoRoot, candidate) {
  const resolved = path.resolve(repoRoot, candidate);
  const artifactRoot = path.resolve(repoRoot, ".artifacts", "tke");
  if (!(resolved === artifactRoot || resolved.startsWith(`${artifactRoot}${path.sep}`))) {
    fail("release input must remain under ignored .artifacts/tke");
  }
  if (!existsSync(resolved)) fail(`release input not found: ${candidate}`);
  return resolved;
}

export function executeImageRelease({
  input,
  mode = "plan",
  repoRoot,
  sourceCommit,
  confirmation = "",
  runner = defaultRunner,
  clock = () => new Date(),
}) {
  if (!MODES.has(mode)) fail("mode must be plan, build, publish, or freeze");
  validateInput(input);
  const commit = sourceCommit ?? gitCommit(repoRoot, runner);
  if (!COMMIT.test(commit)) fail("sourceCommit must be a full lowercase Git SHA");
  if (input.sourceCommit && input.sourceCommit !== commit) fail("release input sourceCommit does not match current Git HEAD");
  const requiredConfirmation = mode === "publish"
    ? `PUBLISH-IMAGES-${input.releaseId}`
    : mode === "freeze" ? `FREEZE-IMAGES-${input.releaseId}` : "";
  if (requiredConfirmation && confirmation !== requiredConfirmation) {
    fail(`explicit confirmation required: ${requiredConfirmation}`);
  }

  const artifactRoot = path.join(repoRoot, ".artifacts", "tke", "releases", input.releaseId);
  const manifestFile = path.join(artifactRoot, "release-manifest.json");
  const lockFile = path.join(artifactRoot, "images.lock.json");
  const planFile = path.join(artifactRoot, "image-plan.json");
  const timestamp = clock().toISOString();
  let manifest = buildReleaseManifest(input, commit, timestamp);
  if (existsSync(manifestFile)) manifest = compareIdentity(readJson(manifestFile), manifest, "release manifest");
  else writeJsonAtomic(manifestFile, manifest);

  const plan = {
    schemaVersion: 1,
    releaseId: input.releaseId,
    sourceCommit: commit,
    mode,
    externalWriteAuthorized: mode === "publish",
    commands: commandPlan(input, mode),
  };
  if (existsSync(planFile)) {
    const existingPlan = readJson(planFile);
    const identity = value => ({
      releaseId: value.releaseId,
      sourceCommit: value.sourceCommit,
      commands: value.commands?.map(command => ({
        component: command.component,
        dockerfile: command.dockerfile,
        buildArgs: command.buildArgs,
        taggedReference: command.taggedReference,
      })),
    });
    if (JSON.stringify(identity(existingPlan)) !== JSON.stringify(identity(plan))) {
      fail("image plan already exists with a different commit or repository prefix; choose a new releaseId");
    }
  }
  writeJsonAtomic(planFile, plan);

  if (mode === "plan") return { status: "PLANNED", manifest, plan, imageLock: null, artifactRoot };
  if (existsSync(lockFile)) {
    const existing = readJson(lockFile);
    if (existing.releaseId !== input.releaseId || existing.sourceCommit !== commit) fail("existing image lock belongs to a different release identity");
    for (const name of Object.keys(COMPONENTS)) {
      if (existing.images?.[name]?.repository !== `${input.repositoryPrefix}/${name}`) fail("existing image lock repository differs; choose a new releaseId");
    }
    return { status: "IMAGES_PUBLISHED", manifest, plan, imageLock: existing, artifactRoot };
  }

  if (mode === "build" || mode === "publish") {
    for (const [name, definition] of Object.entries(COMPONENTS)) {
      runBuild(definition, `${input.repositoryPrefix}/${name}:${input.releaseId}`, {
        mode, repoRoot, runner, releaseId: input.releaseId, sourceCommit: commit,
      });
    }
  }
  if (mode === "build") return { status: "BUILT_LOCAL_ONLY", manifest, plan, imageLock: null, artifactRoot };

  const images = {};
  for (const name of Object.keys(COMPONENTS)) {
    const repository = `${input.repositoryPrefix}/${name}`;
    const digest = inspectDigest(`${repository}:${input.releaseId}`, runner, repoRoot);
    generateSupplyChainEvidence(`${repository}@${digest}`, name, artifactRoot, runner, repoRoot);
    images[name] = {
      repository,
      digest,
      sbomFile: releaseArtifactPath(input.releaseId, `sbom/${name}.cdx.json`),
      scanEvidenceFile: releaseArtifactPath(input.releaseId, `scans/${name}.json`),
    };
  }
  const imageLock = { schemaVersion: 1, releaseId: input.releaseId, sourceCommit: commit, createdAt: timestamp, images };
  writeJsonAtomic(lockFile, imageLock);
  return { status: "IMAGES_PUBLISHED", manifest, plan, imageLock, artifactRoot };
}

function parseArgs(argv) {
  const result = { mode: "plan", input: "", confirmation: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--input", "--mode", "--confirmation"].includes(flag)) fail(`unknown argument: ${flag}`);
    const value = argv[++index];
    if (!value) fail(`${flag} requires a value`);
    result[flag.slice(2)] = value;
  }
  if (!result.input) fail("--input is required");
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const args = parseArgs(process.argv.slice(2));
    const inputFile = assertIgnoredArtifactInput(repoRoot, args.input);
    const result = executeImageRelease({ input: readJson(inputFile), mode: args.mode, confirmation: args.confirmation, repoRoot });
    console.log(`xlb-image-release: ${result.status}`);
    console.log(`xlb-image-release: artifacts ${toPosix(path.relative(repoRoot, result.artifactRoot))}`);
    if (args.mode === "plan") console.log("xlb-image-release: dry-run only; no Docker, registry, or cloud command was executed");
  } catch (error) {
    console.error(`xlb-image-release: FAILED - ${error.message}`);
    process.exitCode = 1;
  }
}
