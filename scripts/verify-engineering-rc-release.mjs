import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ENGINEERING_RC_RELEASE_POLICY = Object.freeze({
  repository: "alaweisi/xlb100",
  repositoryId: "1287812965",
  workflowId: "307447151",
  workflowPath: ".github/workflows/ci.yml",
  workflowRef:
    "alaweisi/xlb100/.github/workflows/ci.yml@refs/heads/main",
  branch: "main",
  ref: "refs/heads/main",
  eventName: "push",
  jobName: "Engineering RC (non-TKE)",
  requiredAppId: "15368",
  maximumAgeMs: 24 * 60 * 60 * 1000,
  trustedGhBinaries: Object.freeze({
    "win32-x64": Object.freeze({
      version: "2.96.0",
      path: "C:\\Program Files\\GitHub CLI\\gh.exe",
      sha256:
        "cd79f16203f1fbe56937c4c96e2b6eadd10549418dcb241d91576ac77af0ac8b",
    }),
  }),
});

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const EXPECTED_GATE = "XLB_ENGINEERING_RC_NON_TKE";
const EXPECTED_RELEASE_AUTHORITY =
  "REQUIRES_PROTECTED_CI_SUCCESS_AND_VERIFIED_GITHUB_ATTESTATION";

function positiveDecimal(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/u.test(value);
}

function fullSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

function sameIdentifier(actual, expected) {
  return String(actual ?? "") === String(expected);
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function trustedGhBinary(ghPath, expectedSha256) {
  if (
    typeof ghPath !== "string"
    || !path.isAbsolute(ghPath)
    || typeof expectedSha256 !== "string"
    || !/^[a-f0-9]{64}$/iu.test(expectedSha256)
  ) {
    throw new Error(
      "an absolute trusted gh path and SHA-256 are required",
    );
  }
  const resolved = fs.realpathSync.native(ghPath);
  if (!fs.statSync(resolved).isFile()) {
    throw new Error("trusted gh path is not a file");
  }
  if (sha256File(resolved) !== expectedSha256.toLowerCase()) {
    throw new Error("trusted gh binary SHA-256 does not match release policy");
  }
  return resolved;
}

function removeTemporaryGhConfig(directory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  const relative = path.relative(temporaryRoot, resolved);
  if (
    !path.basename(resolved).startsWith("xlb-engineering-rc-gh-")
    || relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("refusing to remove an unsafe GitHub CLI config directory");
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function validateManifest(manifest) {
  const errors = [];
  const githubRun = manifest?.authorization?.githubRun;
  const sourceSha = manifest?.source?.commit;

  if (manifest?.schemaVersion !== 3) {
    errors.push("manifest schemaVersion must be 3");
  }
  if (manifest?.gate !== EXPECTED_GATE) {
    errors.push(`manifest gate must be ${EXPECTED_GATE}`);
  }
  if (manifest?.executionResult !== "PASS") {
    errors.push("diagnostic execution result must be PASS");
  }
  if (manifest?.releaseGateEligible !== false) {
    errors.push("diagnostic manifest must not self-authorize a release");
  }
  if (
    manifest?.authorization?.evidenceClass !== "DIAGNOSTIC_ONLY"
    || manifest?.authorization?.releaseAuthority
      !== EXPECTED_RELEASE_AUTHORITY
  ) {
    errors.push("manifest must remain diagnostic-only");
  }
  if (!fullSha(sourceSha)) {
    errors.push("manifest source commit must be a full Git SHA");
  }
  if (!githubRun || typeof githubRun !== "object") {
    errors.push("manifest must declare its GitHub Actions origin");
    return errors;
  }
  if (githubRun.repository !== ENGINEERING_RC_RELEASE_POLICY.repository) {
    errors.push("manifest repository is not trusted");
  }
  if (
    !sameIdentifier(
      githubRun.repositoryId,
      ENGINEERING_RC_RELEASE_POLICY.repositoryId,
    )
  ) {
    errors.push("manifest repository ID is not trusted");
  }
  if (githubRun.workflowRef !== ENGINEERING_RC_RELEASE_POLICY.workflowRef) {
    errors.push("manifest workflow ref is not trusted");
  }
  if (githubRun.workflowSha !== sourceSha) {
    errors.push("manifest workflow SHA is not the source SHA");
  }
  if (githubRun.sourceSha !== sourceSha) {
    errors.push("manifest GitHub source SHA is not the source commit");
  }
  if (githubRun.eventName !== ENGINEERING_RC_RELEASE_POLICY.eventName) {
    errors.push("manifest GitHub event must be push");
  }
  if (!positiveDecimal(githubRun.runId)) {
    errors.push("manifest GitHub run ID must be a positive decimal string");
  }
  if (!positiveDecimal(githubRun.runAttempt)) {
    errors.push("manifest GitHub run attempt must be a positive decimal string");
  }
  return errors;
}

async function githubJson(fetchImpl, token, pathname) {
  const response = await fetchImpl(`${GITHUB_API}${pathname}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });
  if (!response || response.ok !== true) {
    const status = response?.status ?? "unavailable";
    throw new Error(`GitHub API request failed (${status}) for ${pathname}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`GitHub API returned invalid JSON for ${pathname}`);
  }
}

function validateRun(run, { runId, runAttempt, sourceSha, label }) {
  const errors = [];
  if (!sameIdentifier(run?.id, runId)) {
    errors.push(`${label} ID does not match the manifest`);
  }
  if (!sameIdentifier(run?.run_attempt, runAttempt)) {
    errors.push(`${label} attempt is not the manifest attempt`);
  }
  if (
    !sameIdentifier(
      run?.repository?.id,
      ENGINEERING_RC_RELEASE_POLICY.repositoryId,
    )
    || run?.repository?.full_name
      !== ENGINEERING_RC_RELEASE_POLICY.repository
  ) {
    errors.push(`${label} repository identity is not trusted`);
  }
  if (
    !sameIdentifier(
      run?.workflow_id,
      ENGINEERING_RC_RELEASE_POLICY.workflowId,
    )
    || run?.path !== ENGINEERING_RC_RELEASE_POLICY.workflowPath
  ) {
    errors.push(`${label} workflow identity is not trusted`);
  }
  if (
    run?.event !== ENGINEERING_RC_RELEASE_POLICY.eventName
    || run?.head_branch !== ENGINEERING_RC_RELEASE_POLICY.branch
  ) {
    errors.push(`${label} must be a push on main`);
  }
  if (run?.head_sha !== sourceSha) {
    errors.push(`${label} head SHA is not the manifest source SHA`);
  }
  if (run?.status !== "completed" || run?.conclusion !== "success") {
    errors.push(`${label} is not completed successfully`);
  }
  return errors;
}

function validateJobs(payload, { runId, sourceSha, now }) {
  const errors = [];
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  if (
    Number.isInteger(payload?.total_count)
    && payload.total_count > jobs.length
  ) {
    errors.push("exact-attempt job response is incomplete");
  }
  const matching = jobs.filter(
    (job) => job?.name === ENGINEERING_RC_RELEASE_POLICY.jobName,
  );
  if (matching.length !== 1) {
    errors.push(
      `exactly one ${ENGINEERING_RC_RELEASE_POLICY.jobName} job is required`,
    );
    return errors;
  }

  const job = matching[0];
  if (!sameIdentifier(job?.run_id, runId) || job?.head_sha !== sourceSha) {
    errors.push("required job is not bound to the exact run and source SHA");
  }
  if (job?.status !== "completed" || job?.conclusion !== "success") {
    errors.push("required job is not completed successfully");
  }
  const completedAt = Date.parse(job?.completed_at ?? "");
  const ageMs = now.getTime() - completedAt;
  if (
    !Number.isFinite(completedAt)
    || ageMs < 0
    || ageMs > ENGINEERING_RC_RELEASE_POLICY.maximumAgeMs
  ) {
    errors.push("required job completion is outside the 24-hour release window");
  }
  return errors;
}

function validateBranch(branch, protection, sourceSha) {
  const errors = [];
  if (
    branch?.name !== ENGINEERING_RC_RELEASE_POLICY.branch
    || branch?.protected !== true
  ) {
    errors.push("main branch is not protected");
  }
  if (branch?.commit?.sha !== sourceSha) {
    errors.push("manifest source SHA is not the current protected main HEAD");
  }

  const required = protection?.required_status_checks;
  if (required?.strict !== true) {
    errors.push("main branch required status checks are not strict");
  }
  const contexts = new Set([
    ...(Array.isArray(required?.contexts) ? required.contexts : []),
    ...(Array.isArray(required?.checks)
      ? required.checks.map((entry) => entry?.context)
      : []),
  ]);
  if (!contexts.has(ENGINEERING_RC_RELEASE_POLICY.jobName)) {
    errors.push("main branch does not require the exact engineering RC job");
  }
  const matchingChecks = Array.isArray(required?.checks)
    ? required.checks.filter(
      (entry) => entry?.context === ENGINEERING_RC_RELEASE_POLICY.jobName,
    )
    : [];
  if (
    matchingChecks.length !== 1
    || !sameIdentifier(
      matchingChecks[0]?.app_id,
      ENGINEERING_RC_RELEASE_POLICY.requiredAppId,
    )
  ) {
    errors.push(
      "engineering RC required check source must be the GitHub Actions app",
    );
  }
  return errors;
}

async function verifyAttestation(
  spawnImpl,
  token,
  manifestPath,
  sourceSha,
  ghPath,
) {
  const signerWorkflow =
    `${ENGINEERING_RC_RELEASE_POLICY.repository}/`
    + ENGINEERING_RC_RELEASE_POLICY.workflowPath;
  const configDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "xlb-engineering-rc-gh-"),
  );
  try {
    const hostEnvironment = {};
    for (const name of [
      "SystemRoot",
      "WINDIR",
      "COMSPEC",
      "PATHEXT",
      "TEMP",
      "TMP",
      "TMPDIR",
      "LANG",
      "LC_ALL",
      "NO_COLOR",
    ]) {
      if (process.env[name]) hostEnvironment[name] = process.env[name];
    }
    const result = await spawnImpl(
      ghPath,
      [
        "attestation",
        "verify",
        manifestPath,
        "-R",
        ENGINEERING_RC_RELEASE_POLICY.repository,
        "--hostname",
        "github.com",
        "--signer-workflow",
        signerWorkflow,
        "--signer-digest",
        sourceSha,
        "--source-digest",
        sourceSha,
        "--source-ref",
        ENGINEERING_RC_RELEASE_POLICY.ref,
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        env: {
          ...hostEnvironment,
          GH_CONFIG_DIR: configDirectory,
          GH_HOST: "github.com",
          GH_NO_UPDATE_NOTIFIER: "1",
          GH_PROMPT_DISABLED: "true",
          GH_TELEMETRY_DISABLED: "1",
          GH_TOKEN: token,
        },
        shell: false,
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
    );
    if (result?.error) {
      throw result.error;
    }
    if (result?.status !== 0) {
      throw new Error("GitHub attestation verification failed");
    }
    let payload;
    try {
      payload = JSON.parse(String(result.stdout ?? ""));
    } catch {
      throw new Error("GitHub attestation verification did not return JSON");
    }
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("GitHub attestation verification returned no result");
    }
  } finally {
    removeTemporaryGhConfig(configDirectory);
  }
}

export async function verifyEngineeringRcRelease(
  manifest,
  {
    manifestPath,
    fetchImpl = globalThis.fetch,
    spawnImpl = spawnSync,
    now = () => new Date(),
    token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    ghPath,
    ghSha256,
  } = {},
) {
  const errors = validateManifest(manifest);
  if (typeof manifestPath !== "string" || manifestPath.length === 0) {
    errors.push("manifestPath is required for attestation verification");
  }
  if (typeof fetchImpl !== "function") {
    errors.push("a GitHub REST fetch implementation is required");
  }
  if (typeof spawnImpl !== "function") {
    errors.push("a gh spawn implementation is required");
  }
  if (typeof token !== "string" || token.length === 0) {
    errors.push("a GitHub token with Actions and branch-protection read access is required");
  }
  let resolvedGhPath;
  try {
    resolvedGhPath = trustedGhBinary(ghPath, ghSha256);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const nowValue = typeof now === "function" ? now() : now;
  if (!(nowValue instanceof Date) || !Number.isFinite(nowValue.getTime())) {
    errors.push("now must resolve to a valid Date");
  }
  if (errors.length > 0) {
    return { ok: false, releaseGate: "NO_GO", errors };
  }

  const githubRun = manifest.authorization.githubRun;
  const sourceSha = manifest.source.commit;
  const runId = githubRun.runId;
  const runAttempt = githubRun.runAttempt;
  const repositoryPath = `/repos/${ENGINEERING_RC_RELEASE_POLICY.repository}`;

  let liveRun;
  let exactAttempt;
  let jobs;
  let branch;
  let protection;
  try {
    liveRun = await githubJson(
      fetchImpl,
      token,
      `${repositoryPath}/actions/runs/${runId}`,
    );
    exactAttempt = await githubJson(
      fetchImpl,
      token,
      `${repositoryPath}/actions/runs/${runId}/attempts/${runAttempt}`,
    );
    jobs = await githubJson(
      fetchImpl,
      token,
      `${repositoryPath}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`,
    );
    branch = await githubJson(
      fetchImpl,
      token,
      `${repositoryPath}/branches/${ENGINEERING_RC_RELEASE_POLICY.branch}`,
    );
    protection = await githubJson(
      fetchImpl,
      token,
      `${repositoryPath}/branches/${ENGINEERING_RC_RELEASE_POLICY.branch}/protection`,
    );
  } catch (error) {
    return {
      ok: false,
      releaseGate: "NO_GO",
      errors: [
        error instanceof Error
          ? error.message
          : "GitHub API verification is unavailable",
      ],
    };
  }

  errors.push(
    ...validateRun(liveRun, {
      runId,
      runAttempt,
      sourceSha,
      label: "live workflow run",
    }),
    ...validateRun(exactAttempt, {
      runId,
      runAttempt,
      sourceSha,
      label: "exact workflow attempt",
    }),
    ...validateJobs(jobs, {
      runId,
      sourceSha,
      now: nowValue,
    }),
    ...validateBranch(branch, protection, sourceSha),
  );
  if (errors.length > 0) {
    return { ok: false, releaseGate: "NO_GO", errors };
  }

  try {
    await verifyAttestation(
      spawnImpl,
      token,
      path.resolve(manifestPath),
      sourceSha,
      resolvedGhPath,
    );
  } catch (error) {
    return {
      ok: false,
      releaseGate: "NO_GO",
      errors: [
        error instanceof Error
          ? error.message
          : "GitHub attestation verification failed",
      ],
    };
  }

  return {
    ok: true,
    releaseGate: "GO",
    errors: [],
    sourceSha,
    runId,
    runAttempt,
  };
}

async function run() {
  const [manifestPath, ...arguments_] = process.argv.slice(2);
  if (!manifestPath) {
    process.stderr.write(
      "usage: node scripts/verify-engineering-rc-release.mjs <manifest.json> [--gh-path <absolute-path> --gh-sha256 <sha256>]\n",
    );
    process.stdout.write("RELEASE_GATE=NO_GO\n");
    process.exitCode = 1;
    return;
  }
  let ghPath;
  let ghSha256;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--gh-path") {
      ghPath = arguments_[index + 1];
      index += 1;
    } else if (argument === "--gh-sha256") {
      ghSha256 = arguments_[index + 1];
      index += 1;
    } else {
      process.stderr.write(
        `[engineering-rc-release] unknown option: ${argument}\n`,
      );
      process.stdout.write("RELEASE_GATE=NO_GO\n");
      process.exitCode = 1;
      return;
    }
  }
  const platformPin =
    ENGINEERING_RC_RELEASE_POLICY.trustedGhBinaries[
      `${process.platform}-${process.arch}`
    ];
  ghPath ??= platformPin?.path;
  ghSha256 ??= platformPin?.sha256;

  let manifest;
  const absolute = path.resolve(manifestPath);
  try {
    manifest = JSON.parse(
      fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/u, ""),
    );
  } catch (error) {
    process.stderr.write(
      `[engineering-rc-release] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stdout.write("RELEASE_GATE=NO_GO\n");
    process.exitCode = 1;
    return;
  }

  const result = await verifyEngineeringRcRelease(manifest, {
    manifestPath: absolute,
    ghPath,
    ghSha256,
  });
  if (!result.ok) {
    for (const error of result.errors) {
      process.stderr.write(`[engineering-rc-release] FAIL ${error}\n`);
    }
    process.stdout.write("RELEASE_GATE=NO_GO\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `RELEASE_GATE=GO\n`
      + `RELEASE_SHA=${result.sourceSha}\n`
      + `RELEASE_RUN_ID=${result.runId}\n`
      + `RELEASE_RUN_ATTEMPT=${result.runAttempt}\n`,
  );
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await run();
