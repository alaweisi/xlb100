import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ENGINEERING_RC_EXCLUSIONS,
  ENGINEERING_RC_GATE,
  ENGINEERING_RC_NODE_VERSION,
  ENGINEERING_RC_PNPM_VERSION,
  ENGINEERING_RC_PROVIDER_ISOLATION,
  ENGINEERING_RC_REQUIRED_STEP_IDS,
  ENGINEERING_RC_STEPS,
} from "./engineering-rc-contract.mjs";
import {
  ENGINEERING_RC_COREPACK_RUNTIME_PINS_BY_PLATFORM,
  ENGINEERING_RC_LOCAL_MYSQL_CONTAINER,
  ENGINEERING_RC_LOCAL_REDIS_CONTAINER,
  ENGINEERING_RC_PACKAGE_MANAGER,
  ENGINEERING_RC_PNPM_RUNTIME_PINS,
  isLocalDockerEndpoint,
} from "./engineering-rc-runtime.mjs";

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function captureGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== ""
    && !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative);
}

function parseJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
}

function githubRunFromEnvironment(environment = process.env) {
  if (environment.GITHUB_ACTIONS !== "true") return null;
  return {
    repository: environment.GITHUB_REPOSITORY ?? null,
    repositoryId: environment.GITHUB_REPOSITORY_ID ?? null,
    workflowRef: environment.GITHUB_WORKFLOW_REF ?? null,
    workflowSha: environment.GITHUB_WORKFLOW_SHA ?? null,
    runId: environment.GITHUB_RUN_ID ?? null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
    sourceSha: environment.GITHUB_SHA ?? null,
    eventName: environment.GITHUB_EVENT_NAME ?? null,
  };
}

function validateStage4aArtifact(payload, evidence, errors) {
  if (payload?.sourceCommit !== evidence.source.commit) {
    errors.push("Stage 4A evidence is not bound to the source commit");
  }
  if (payload?.result !== "PASS_LOCAL_STAGE4A_DRILL") {
    errors.push("Stage 4A evidence did not pass");
  }
  if (payload?.realProviderUsed !== false) {
    errors.push("Stage 4A evidence used a real Provider");
  }
  if (payload?.productionOperationPerformed !== false) {
    errors.push("Stage 4A evidence performed a production operation");
  }
  if (payload?.isolatedRedis?.removedAfterDrill !== true) {
    errors.push("Stage 4A isolated Redis cleanup is not proven");
  }
  if (payload?.outbox?.testDatabase !== "isolated and removed after drill") {
    errors.push("Stage 4A isolated database cleanup is not proven");
  }
}

function validateOaMigrationArtifact(payload, evidence, errors) {
  if (payload?.sourceCommit !== evidence.source.commit) {
    errors.push("OA migration evidence is not bound to the source commit");
  }
  if (
    payload?.result !== "PASS"
    || payload?.databaseRemoved !== true
    || payload?.migrationMarkers !== 3
    || payload?.requiredTables !== 24
  ) {
    errors.push("OA migration evidence is incomplete");
  }
}

function validatePlaywrightArtifact(payload, errors) {
  const stats = payload?.stats;
  if (
    !stats
    || !Number.isInteger(stats.expected)
    || stats.expected < 1
    || stats.unexpected !== 0
    || stats.skipped !== 0
    || stats.flaky !== 0
  ) {
    errors.push("Playwright evidence does not prove a passing test run");
  }
}

function validateMobileArtifact(payload, evidence, apkArtifacts, errors) {
  if (
    payload?.releaseCandidate !== true
    || payload?.published !== false
    || payload?.signingClass !== "simulation"
    || payload?.sourceCommit !== evidence.source.commit
    || !Array.isArray(payload?.reports)
    || payload.reports.length !== 3
  ) {
    errors.push("mobile M5 evidence is not a three-app simulation RC");
    return;
  }
  const roles = payload.reports.map((report) => report.role).sort();
  if (JSON.stringify(roles) !== JSON.stringify(["admin", "customer", "worker"])) {
    errors.push("mobile M5 evidence has the wrong app roles");
  }
  const certificates = new Set();
  const publicKeys = new Set();
  const apkByRole = new Map(
    apkArtifacts.map((artifact) => [artifact.role, artifact]),
  );
  for (const report of payload.reports) {
    if (
      !/^[A-F0-9]{64}$/u.test(report.sha256 ?? "")
      || !/^[A-F0-9]{64}$/u.test(report.certificateSha256 ?? "")
      || !/^[A-F0-9]{64}$/u.test(report.publicKeySha256 ?? "")
      || !String(report.certificateDn ?? "").toLowerCase().includes(
        `CN=XLB ${report.role} Engineering RC Simulation`.toLowerCase(),
      )
    ) {
      errors.push(
        `mobile M5 ${report.role ?? "unknown"} hashes or role-bound certificate are invalid`,
      );
    }
    certificates.add(report.certificateSha256);
    publicKeys.add(report.publicKeySha256);
    const apkArtifact = apkByRole.get(report.role);
    if (
      !apkArtifact
      || typeof apkArtifact.sha256 !== "string"
      || apkArtifact.sha256.toUpperCase() !== report.sha256
    ) {
      errors.push(`mobile M5 ${report.role ?? "unknown"} APK hash is not bound to the report`);
    }
    try {
      const hostname = new URL(report.apiBaseUrl).hostname;
      if (!hostname.endsWith(".invalid")) {
        errors.push(`mobile M5 ${report.role ?? "unknown"} API origin is not isolated`);
      }
    } catch {
      errors.push(`mobile M5 ${report.role ?? "unknown"} API origin is invalid`);
    }
  }
  if (certificates.size !== 3 || publicKeys.size !== 3) {
    errors.push("mobile M5 simulation signing identities must be distinct");
  }
}

function validateStructuredArtifacts(
  step,
  canonical,
  evidence,
  artifactRoot,
  verifyLogs,
  errors,
) {
  const required = canonical.artifact;
  const artifacts = Array.isArray(step.artifacts) ? step.artifacts : [];
  if (!required) {
    if (artifacts.length > 0) errors.push(`${step.id} declares unexpected artifacts`);
    return;
  }
  if (artifacts.length < required.minimumFiles) {
    errors.push(`${step.id} is missing required ${required.kind} evidence`);
    return;
  }
  if (required.kind === "mobile-m5") {
    const evidenceArtifacts = artifacts.filter(
      (artifact) => artifact?.kind === "mobile-m5",
    );
    const apkArtifacts = artifacts.filter(
      (artifact) => artifact?.kind === "mobile-apk",
    );
    if (evidenceArtifacts.length !== 1 || apkArtifacts.length !== 3) {
      errors.push("mobile-release must contain one M5 report and three APK files");
      return;
    }
    for (const artifact of artifacts) {
      const absolute = path.resolve(artifactRoot, artifact.path ?? "");
      if (!isInside(artifactRoot, absolute) || !fs.existsSync(absolute)) {
        errors.push("mobile-release artifact is missing or outside its run");
      } else if (verifyLogs && sha256File(absolute) !== artifact.sha256) {
        errors.push("mobile-release artifact hash does not match");
      }
    }
    const reportPath = path.resolve(
      artifactRoot,
      evidenceArtifacts[0].path,
    );
    if (fs.existsSync(reportPath)) {
      try {
        validateMobileArtifact(
          parseJsonFile(reportPath),
          evidence,
          apkArtifacts,
          errors,
        );
      } catch {
        errors.push("mobile M5 structured artifact is not valid JSON");
      }
    }
    return;
  }
  for (const artifact of artifacts) {
    if (artifact?.kind !== required.kind || typeof artifact?.path !== "string") {
      errors.push(`${step.id} has an invalid structured artifact descriptor`);
      continue;
    }
    const absolute = path.resolve(artifactRoot, artifact.path);
    if (!isInside(artifactRoot, absolute) || !fs.existsSync(absolute)) {
      errors.push(`${step.id} structured artifact is missing or outside its run`);
      continue;
    }
    if (verifyLogs && sha256File(absolute) !== artifact.sha256) {
      errors.push(`${step.id} structured artifact hash does not match`);
      continue;
    }
    let payload;
    try {
      payload = parseJsonFile(absolute);
    } catch {
      errors.push(`${step.id} structured artifact is not valid JSON`);
      continue;
    }
    if (required.kind === "stage4a") {
      validateStage4aArtifact(payload, evidence, errors);
    } else if (required.kind === "oa-migration") {
      validateOaMigrationArtifact(payload, evidence, errors);
    } else if (required.kind === "playwright") {
      validatePlaywrightArtifact(payload, errors);
    }
  }
}

export function validateEngineeringRcEvidence(
  evidence,
  {
    root = process.cwd(),
    verifyLogs = true,
    currentCommit = captureGit(root, ["rev-parse", "HEAD"]),
    currentLockfileSha256 = sha256File(path.join(root, "pnpm-lock.yaml")),
    currentClean =
      captureGit(root, ["status", "--porcelain", "--untracked-files=all"]) === "",
    currentGithubRun = githubRunFromEnvironment(),
    now = new Date(),
    maximumAgeMs = 15 * 60 * 1000,
  } = {},
) {
  const errors = [];
  if (evidence?.schemaVersion !== 3) errors.push("schemaVersion must be 3");
  if (evidence?.gate !== ENGINEERING_RC_GATE) {
    errors.push(`gate must be ${ENGINEERING_RC_GATE}`);
  }
  if (
    evidence?.authorization?.evidenceClass !== "DIAGNOSTIC_ONLY"
    || evidence?.authorization?.releaseAuthority
      !== "REQUIRES_PROTECTED_CI_SUCCESS_AND_VERIFIED_GITHUB_ATTESTATION"
  ) {
    errors.push("local evidence must not claim independent release authority");
  }
  const githubRun = evidence?.authorization?.githubRun;
  if (githubRun !== null && githubRun !== undefined) {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(githubRun.repository ?? "")
      || !/^[1-9][0-9]*$/u.test(githubRun.repositoryId ?? "")
      || typeof githubRun.workflowRef !== "string"
      || githubRun.workflowRef.length === 0
      || !/^[a-f0-9]{40}$/u.test(githubRun.workflowSha ?? "")
      || !/^[1-9][0-9]*$/u.test(githubRun.runId ?? "")
      || !/^[1-9][0-9]*$/u.test(githubRun.runAttempt ?? "")
      || githubRun.sourceSha !== evidence?.source?.commit
      || !["push", "pull_request"].includes(githubRun.eventName)
    ) {
      errors.push("GitHub run provenance is incomplete or not bound to the source commit");
    }
  }
  if (
    currentGithubRun !== null
    && JSON.stringify(githubRun) !== JSON.stringify(currentGithubRun)
  ) {
    errors.push("evidence is not bound to the current GitHub Actions run");
  }
  if (!/^[a-f0-9]{40}$/u.test(evidence?.source?.commit ?? "")) {
    errors.push("source.commit must be a full Git SHA");
  }
  if (evidence?.source?.commitEnd !== evidence?.source?.commit) {
    errors.push("source commit changed during the gate");
  }
  if (evidence?.source?.commit !== currentCommit) {
    errors.push("evidence source commit is not the current HEAD");
  }
  if (evidence?.source?.cleanBefore !== true || evidence?.source?.cleanAfter !== true) {
    errors.push("tracked worktree must be clean before and after the gate");
  }
  if (currentClean !== true) {
    errors.push("current worktree is not clean");
  }
  if (evidence?.source?.lockfileSha256 !== currentLockfileSha256) {
    errors.push("lockfile hash does not match the current lockfile");
  }
  if (
    evidence?.tools?.node !== ENGINEERING_RC_NODE_VERSION
    || evidence?.tools?.pnpm !== ENGINEERING_RC_PNPM_VERSION
  ) {
    errors.push("Node or pnpm version does not match the canonical RC toolchain");
  }
  const localRun = githubRun === null || githubRun === undefined;
  const expectedPlatform = localRun
    ? `${process.platform}-${process.arch}`
    : "linux-x64";
  if (evidence?.tools?.platform !== expectedPlatform) {
    errors.push("toolchain platform does not match the evidence origin");
  }
  const corepackPlatform = String(evidence?.tools?.platform ?? "")
    .split("-", 1)[0];
  const corepackPins =
    ENGINEERING_RC_COREPACK_RUNTIME_PINS_BY_PLATFORM[corepackPlatform];
  const pnpmRuntime = evidence?.tools?.pnpmRuntime;
  if (
    pnpmRuntime?.packageManager !== ENGINEERING_RC_PACKAGE_MANAGER
    || pnpmRuntime?.packageName !== "pnpm"
    || pnpmRuntime?.packageVersion !== ENGINEERING_RC_PNPM_VERSION
    || pnpmRuntime?.packageIntegrity
      !== ENGINEERING_RC_PNPM_RUNTIME_PINS.integrity
    || pnpmRuntime?.entrySha256
      !== ENGINEERING_RC_PNPM_RUNTIME_PINS.entrySha256
    || pnpmRuntime?.packageTreeSha256
      !== ENGINEERING_RC_PNPM_RUNTIME_PINS.packageTreeSha256
    || pnpmRuntime?.launcher?.packageName !== "corepack"
    || !corepackPins
    || pnpmRuntime?.launcher?.packageVersion
      !== corepackPins?.version
    || pnpmRuntime?.launcher?.entrySha256
      !== corepackPins?.entrySha256
    || pnpmRuntime?.launcher?.packageTreeSha256
      !== corepackPins?.packageTreeSha256
  ) {
    errors.push("pnpm runtime evidence does not match the pinned RC toolchain");
  }
  const dockerRuntime = evidence?.tools?.docker;
  const validContainer = (container, expectedImage, containerPort, hostPort) =>
    container?.image === expectedImage
    && /^[a-f0-9]{64}$/u.test(container?.id ?? "")
    && /^sha256:[a-f0-9]{64}$/u.test(container?.imageId ?? "")
    && (
      container?.manifestDigest === null
      || /^sha256:[a-f0-9]{64}$/u.test(container?.manifestDigest ?? "")
    )
    && container?.running === true
    && container?.healthy === true
    && container?.privileged === false
    && container?.networkMode !== "host"
    && container?.port?.container === `${containerPort}/tcp`
    && container?.port?.host === hostPort
    && Array.isArray(container?.port?.bindings)
    && container.port.bindings.length > 0
    && container.port.bindings.every((binding) =>
      binding?.hostPort === hostPort
      && ["", "0.0.0.0", "::", "127.0.0.1", "::1"]
        .includes(binding?.hostIp ?? ""));
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(
      dockerRuntime?.context ?? "",
    )
    || !isLocalDockerEndpoint(dockerRuntime?.endpoint)
    || !validContainer(
      dockerRuntime?.containers?.mysql,
      "mysql:8",
      "3306",
      evidence?.scope?.database?.port,
    )
    || !validContainer(
      dockerRuntime?.containers?.redis,
      "redis:7",
      "6379",
      evidence?.scope?.redis?.port,
    )
    || (
      localRun
      && (
        dockerRuntime?.containers?.mysql?.name
          !== ENGINEERING_RC_LOCAL_MYSQL_CONTAINER
        || dockerRuntime?.containers?.redis?.name
          !== ENGINEERING_RC_LOCAL_REDIS_CONTAINER
      )
    )
  ) {
    errors.push("Docker runtime evidence does not prove canonical local containers");
  }
  if (
    evidence?.tools?.mobile?.signingClass !== "simulation"
    || !Array.isArray(evidence?.tools?.mobile?.reports)
    || evidence.tools.mobile.reports.length !== 3
    || evidence.tools.mobile.reports.some(
      (entry) => entry.javaMajor !== 21 || entry.androidApi !== 36,
    )
  ) {
    errors.push("mobile toolchain evidence must prove JDK 21, API 36, and simulation signing");
  }
  if (evidence?.scope?.productionActivation !== "NOT_EVALUATED") {
    errors.push("production activation must remain NOT_EVALUATED");
  }
  if (evidence?.scope?.realProviderExecution !== false) {
    errors.push("real Provider execution must remain false");
  }
  if (
    JSON.stringify(evidence?.scope?.exclusions)
      !== JSON.stringify(ENGINEERING_RC_EXCLUSIONS)
  ) {
    errors.push("scope exclusions do not match the canonical RC exclusions");
  }
  if (
    JSON.stringify(evidence?.scope?.providerEnvironment)
      !== JSON.stringify(ENGINEERING_RC_PROVIDER_ISOLATION)
  ) {
    errors.push("Provider isolation was not enforced by the gate environment");
  }
  if (
    evidence?.scope?.database?.host !== "127.0.0.1"
    || evidence?.scope?.database?.name !== "xlb_local"
    || evidence?.scope?.redis?.host !== "127.0.0.1"
  ) {
    errors.push("the gate was not isolated to local database and Redis endpoints");
  }

  const startedAt = Date.parse(evidence?.startedAt ?? "");
  const completedAt = Date.parse(evidence?.completedAt ?? "");
  const currentTime = now.getTime();
  if (
    !Number.isFinite(startedAt)
    || !Number.isFinite(completedAt)
    || completedAt < startedAt
    || completedAt > currentTime + 5 * 60 * 1000
    || currentTime - completedAt > maximumAgeMs
  ) {
    errors.push("evidence timestamps are invalid or stale");
  }
  if (!/^[0-9TZ-]+-[a-f0-9]{12}$/u.test(evidence?.runId ?? "")) {
    errors.push("runId is invalid");
  }
  const expectedArtifactRoot = [
    ".artifacts",
    "engineering-rc",
    evidence?.source?.commit,
    evidence?.runId,
  ].join("/");
  if (evidence?.artifactRoot !== expectedArtifactRoot) {
    errors.push("artifactRoot is not bound to the source commit and runId");
  }
  const artifactRoot = path.resolve(root, expectedArtifactRoot);

  if (
    JSON.stringify(evidence?.requiredStepIds)
      !== JSON.stringify(ENGINEERING_RC_REQUIRED_STEP_IDS)
  ) {
    errors.push("requiredStepIds do not match the canonical RC plan");
  }
  const steps = Array.isArray(evidence?.steps) ? evidence.steps : [];
  if (steps.length !== ENGINEERING_RC_STEPS.length) {
    errors.push("evidence must contain every canonical step exactly once");
  }
  const limit = Math.max(steps.length, ENGINEERING_RC_STEPS.length);
  for (let index = 0; index < limit; index += 1) {
    const step = steps[index];
    const canonical = ENGINEERING_RC_STEPS[index];
    if (!step || !canonical) continue;
    if (
      step.id !== canonical.id
      || step.stage !== canonical.stage
      || JSON.stringify(step.command) !== JSON.stringify(canonical.args)
      || step.timeoutMs !== canonical.timeoutMs
    ) {
      errors.push(`step ${index + 1} does not match canonical command ${canonical.id}`);
      continue;
    }
    if (step.status !== "PASS" || step.exitCode !== 0) {
      errors.push(`${step.id} did not pass`);
    }
    const stepStart = Date.parse(step.startedAt ?? "");
    const stepEnd = Date.parse(step.completedAt ?? "");
    if (
      !Number.isFinite(stepStart)
      || !Number.isFinite(stepEnd)
      || stepEnd < stepStart
      || stepStart < startedAt
      || stepEnd > completedAt
      || step.durationMs !== stepEnd - stepStart
    ) {
      errors.push(`${step.id} timing evidence is invalid`);
    }
    const expectedLogPath = `${expectedArtifactRoot}/${String(index + 1).padStart(2, "0")}-${step.id}.log`;
    if (step.logPath !== expectedLogPath) {
      errors.push(`${step.id} log path is not canonical`);
    } else {
      const absolute = path.resolve(root, step.logPath);
      if (!isInside(artifactRoot, absolute) || !fs.existsSync(absolute)) {
        errors.push(`${step.id} log is missing or outside its run`);
      } else if (verifyLogs && sha256File(absolute) !== step.logSha256) {
        errors.push(`${step.id} log hash does not match`);
      }
    }
    validateStructuredArtifacts(
      step,
      canonical,
      evidence,
      artifactRoot,
      verifyLogs,
      errors,
    );
  }
  if (evidence?.executionResult !== "PASS") {
    errors.push("executionResult must be PASS");
  }
  if (evidence?.releaseGateEligible !== false) {
    errors.push("diagnostic evidence must not be release-gate eligible");
  }
  return errors;
}

function run() {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    throw new Error(
      "usage: node scripts/check-engineering-rc-evidence.mjs <manifest.json>",
    );
  }
  const absolute = path.resolve(evidencePath);
  const evidence = parseJsonFile(absolute);
  const errors = validateEngineeringRcEvidence(evidence, { root: process.cwd() });
  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(`[engineering-rc] FAIL ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `[engineering-rc] PASS diagnostic-evidence=${absolute}\n`
      + "[engineering-rc] RELEASE_AUTHORIZATION=REQUIRES_PROTECTED_CI_SUCCESS_AND_VERIFIED_GITHUB_ATTESTATION\n",
  );
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) run();
