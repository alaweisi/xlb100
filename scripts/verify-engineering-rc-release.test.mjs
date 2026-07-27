import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENGINEERING_RC_RELEASE_POLICY,
  verifyEngineeringRcRelease,
} from "./verify-engineering-rc-release.mjs";

const SOURCE_SHA = "a".repeat(40);
const RUN_ID = "30198692909";
const RUN_ATTEMPT = "2";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const MANIFEST_PATH = path.resolve("fixtures", "manifest.json");
const TRUSTED_GH_PATH = fileURLToPath(import.meta.url);
const TRUSTED_GH_SHA256 = createHash("sha256")
  .update(fs.readFileSync(TRUSTED_GH_PATH))
  .digest("hex");

function manifestFixture() {
  return {
    schemaVersion: 3,
    gate: "XLB_ENGINEERING_RC_NON_TKE",
    executionResult: "PASS",
    releaseGateEligible: false,
    authorization: {
      evidenceClass: "DIAGNOSTIC_ONLY",
      releaseAuthority:
        "REQUIRES_PROTECTED_CI_SUCCESS_AND_VERIFIED_GITHUB_ATTESTATION",
      githubRun: {
        repository: ENGINEERING_RC_RELEASE_POLICY.repository,
        repositoryId: ENGINEERING_RC_RELEASE_POLICY.repositoryId,
        workflowRef: ENGINEERING_RC_RELEASE_POLICY.workflowRef,
        workflowSha: SOURCE_SHA,
        runId: RUN_ID,
        runAttempt: RUN_ATTEMPT,
        sourceSha: SOURCE_SHA,
        eventName: "push",
      },
    },
    source: {
      commit: SOURCE_SHA,
    },
  };
}

function runFixture(overrides = {}) {
  return {
    id: Number(RUN_ID),
    run_attempt: Number(RUN_ATTEMPT),
    workflow_id: Number(ENGINEERING_RC_RELEASE_POLICY.workflowId),
    path: ENGINEERING_RC_RELEASE_POLICY.workflowPath,
    event: "push",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: SOURCE_SHA,
    repository: {
      id: Number(ENGINEERING_RC_RELEASE_POLICY.repositoryId),
      full_name: ENGINEERING_RC_RELEASE_POLICY.repository,
    },
    ...overrides,
  };
}

function jobFixture(overrides = {}) {
  return {
    id: 99,
    run_id: Number(RUN_ID),
    name: ENGINEERING_RC_RELEASE_POLICY.jobName,
    status: "completed",
    conclusion: "success",
    head_sha: SOURCE_SHA,
    completed_at: "2026-07-27T11:00:00.000Z",
    ...overrides,
  };
}

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return structuredClone(body);
    },
  };
}

function harness({
  liveRun = runFixture(),
  exactAttempt = runFixture(),
  jobs = { total_count: 1, jobs: [jobFixture()] },
  branch = {
    name: "main",
    protected: true,
    commit: { sha: SOURCE_SHA },
  },
  protection = {
    required_status_checks: {
      strict: true,
      contexts: [ENGINEERING_RC_RELEASE_POLICY.jobName],
      checks: [{
        context: ENGINEERING_RC_RELEASE_POLICY.jobName,
        app_id: Number(ENGINEERING_RC_RELEASE_POLICY.requiredAppId),
      }],
    },
  },
  failPath = null,
  spawnResult = {
    status: 0,
    stdout: JSON.stringify([{ verificationResult: {} }]),
    error: undefined,
  },
} = {}) {
  const fetchCalls = [];
  const spawnCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    const pathname = new URL(url).pathname + new URL(url).search;
    if (failPath && pathname.includes(failPath)) {
      return response({}, { ok: false, status: 401 });
    }
    if (pathname.endsWith(`/actions/runs/${RUN_ID}`)) {
      return response(liveRun);
    }
    if (
      pathname.endsWith(
        `/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}`,
      )
    ) {
      return response(exactAttempt);
    }
    if (
      pathname.endsWith(
        `/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}/jobs?per_page=100`,
      )
    ) {
      return response(jobs);
    }
    if (pathname.endsWith("/branches/main/protection")) {
      return response(protection);
    }
    if (pathname.endsWith("/branches/main")) {
      return response(branch);
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const spawnImpl = async (...args) => {
    spawnCalls.push(args);
    return spawnResult;
  };
  return { fetchImpl, spawnImpl, fetchCalls, spawnCalls };
}

async function verify(manifest, currentHarness) {
  return verifyEngineeringRcRelease(manifest, {
    manifestPath: MANIFEST_PATH,
    fetchImpl: currentHarness.fetchImpl,
    spawnImpl: currentHarness.spawnImpl,
    now: () => new Date(NOW),
    token: "fixture-token",
    ghPath: TRUSTED_GH_PATH,
    ghSha256: TRUSTED_GH_SHA256,
  });
}

test("returns GO only for the exact fresh protected CI attempt and attestation", async () => {
  const currentHarness = harness();
  const result = await verify(manifestFixture(), currentHarness);

  assert.deepEqual(result, {
    ok: true,
    releaseGate: "GO",
    errors: [],
    sourceSha: SOURCE_SHA,
    runId: RUN_ID,
    runAttempt: RUN_ATTEMPT,
  });
  assert.equal(currentHarness.fetchCalls.length, 5);
  assert.equal(currentHarness.spawnCalls.length, 1);
  const [command, args, options] = currentHarness.spawnCalls[0];
  assert.equal(command, fs.realpathSync.native(TRUSTED_GH_PATH));
  assert.deepEqual(args.slice(0, 5), [
    "attestation",
    "verify",
    MANIFEST_PATH,
    "-R",
    ENGINEERING_RC_RELEASE_POLICY.repository,
  ]);
  assert.ok(args.includes("--signer-workflow"));
  assert.ok(args.includes("--signer-digest"));
  assert.ok(args.includes("--source-digest"));
  assert.ok(args.includes("--source-ref"));
  assert.ok(args.includes("--deny-self-hosted-runners"));
  assert.ok(args.includes("--hostname"));
  assert.ok(args.includes("--format"));
  assert.equal(options.shell, false);
  assert.equal(options.env.GH_TOKEN, "fixture-token");
  assert.equal(options.env.GH_HOST, "github.com");
  assert.equal(options.env.GH_CONFIG_DIR.includes("xlb-engineering-rc-gh-"), true);
  assert.equal(options.env.PATH, undefined);
});

for (const [name, mutate, expected] of [
  [
    "self-declared release authority",
    (manifest) => {
      manifest.authorization.evidenceClass = "RELEASE_AUTHORITY";
    },
    "manifest must remain diagnostic-only",
  ],
  [
    "wrong repository",
    (manifest) => {
      manifest.authorization.githubRun.repository = "attacker/repository";
    },
    "manifest repository is not trusted",
  ],
  [
    "wrong workflow ref",
    (manifest) => {
      manifest.authorization.githubRun.workflowRef =
        "alaweisi/xlb100/.github/workflows/other.yml@refs/heads/main";
    },
    "manifest workflow ref is not trusted",
  ],
  [
    "pull request event",
    (manifest) => {
      manifest.authorization.githubRun.eventName = "pull_request";
    },
    "manifest GitHub event must be push",
  ],
  [
    "source SHA substitution",
    (manifest) => {
      manifest.authorization.githubRun.sourceSha = "b".repeat(40);
    },
    "manifest GitHub source SHA is not the source commit",
  ],
  [
    "invalid run attempt",
    (manifest) => {
      manifest.authorization.githubRun.runAttempt = "0";
    },
    "manifest GitHub run attempt must be a positive decimal string",
  ],
]) {
  test(`rejects manifest ${name} before any external verification`, async () => {
    const manifest = manifestFixture();
    mutate(manifest);
    const currentHarness = harness();

    const result = await verify(manifest, currentHarness);

    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(expected));
    assert.equal(currentHarness.fetchCalls.length, 0);
    assert.equal(currentHarness.spawnCalls.length, 0);
  });
}

for (const [name, options, expected] of [
  [
    "repository ID mismatch",
    {
      liveRun: runFixture({
        repository: {
          id: 7,
          full_name: ENGINEERING_RC_RELEASE_POLICY.repository,
        },
      }),
    },
    "live workflow run repository identity is not trusted",
  ],
  [
    "workflow ID mismatch",
    { exactAttempt: runFixture({ workflow_id: 9 }) },
    "exact workflow attempt workflow identity is not trusted",
  ],
  [
    "workflow path mismatch",
    { liveRun: runFixture({ path: ".github/workflows/other.yml" }) },
    "live workflow run workflow identity is not trusted",
  ],
  [
    "head SHA mismatch",
    { exactAttempt: runFixture({ head_sha: "b".repeat(40) }) },
    "exact workflow attempt head SHA is not the manifest source SHA",
  ],
  [
    "non-main run",
    { liveRun: runFixture({ head_branch: "feature" }) },
    "live workflow run must be a push on main",
  ],
  [
    "non-push run",
    { exactAttempt: runFixture({ event: "workflow_dispatch" }) },
    "exact workflow attempt must be a push on main",
  ],
  [
    "failed live run",
    { liveRun: runFixture({ conclusion: "failure" }) },
    "live workflow run is not completed successfully",
  ],
  [
    "old successful attempt after a newer rerun",
    { liveRun: runFixture({ run_attempt: 3 }) },
    "live workflow run attempt is not the manifest attempt",
  ],
]) {
  test(`rejects GitHub run ${name}`, async () => {
    const currentHarness = harness(options);
    const result = await verify(manifestFixture(), currentHarness);

    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(expected));
    assert.equal(currentHarness.spawnCalls.length, 0);
  });
}

for (const [name, jobs, expected] of [
  [
    "missing required job",
    { total_count: 1, jobs: [jobFixture({ name: "other" })] },
    `exactly one ${ENGINEERING_RC_RELEASE_POLICY.jobName} job is required`,
  ],
  [
    "duplicate required job",
    { total_count: 2, jobs: [jobFixture(), jobFixture({ id: 100 })] },
    `exactly one ${ENGINEERING_RC_RELEASE_POLICY.jobName} job is required`,
  ],
  [
    "skipped required job",
    {
      total_count: 1,
      jobs: [jobFixture({ status: "completed", conclusion: "skipped" })],
    },
    "required job is not completed successfully",
  ],
  [
    "job from another SHA",
    {
      total_count: 1,
      jobs: [jobFixture({ head_sha: "b".repeat(40) })],
    },
    "required job is not bound to the exact run and source SHA",
  ],
  [
    "stale job",
    {
      total_count: 1,
      jobs: [
        jobFixture({ completed_at: "2026-07-26T11:59:59.999Z" }),
      ],
    },
    "required job completion is outside the 24-hour release window",
  ],
  [
    "future job timestamp",
    {
      total_count: 1,
      jobs: [
        jobFixture({ completed_at: "2026-07-27T12:00:00.001Z" }),
      ],
    },
    "required job completion is outside the 24-hour release window",
  ],
]) {
  test(`rejects exact-attempt ${name}`, async () => {
    const currentHarness = harness({ jobs });
    const result = await verify(manifestFixture(), currentHarness);

    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(expected));
    assert.equal(currentHarness.spawnCalls.length, 0);
  });
}

test("accepts a job completed exactly 24 hours ago", async () => {
  const currentHarness = harness({
    jobs: {
      total_count: 1,
      jobs: [
        jobFixture({ completed_at: "2026-07-26T12:00:00.000Z" }),
      ],
    },
  });

  assert.equal((await verify(manifestFixture(), currentHarness)).ok, true);
});

for (const [name, options, expected] of [
  [
    "unprotected main",
    {
      branch: {
        name: "main",
        protected: false,
        commit: { sha: SOURCE_SHA },
      },
    },
    "main branch is not protected",
  ],
  [
    "main moved to another SHA",
    {
      branch: {
        name: "main",
        protected: true,
        commit: { sha: "b".repeat(40) },
      },
    },
    "manifest source SHA is not the current protected main HEAD",
  ],
  [
    "loose status checks",
    {
      protection: {
        required_status_checks: {
          strict: false,
          contexts: [ENGINEERING_RC_RELEASE_POLICY.jobName],
        },
      },
    },
    "main branch required status checks are not strict",
  ],
  [
    "wrong required check",
    {
      protection: {
        required_status_checks: {
          strict: true,
          contexts: ["ci"],
        },
      },
    },
    "main branch does not require the exact engineering RC job",
  ],
  [
    "untrusted required check source",
    {
      protection: {
        required_status_checks: {
          strict: true,
          contexts: [ENGINEERING_RC_RELEASE_POLICY.jobName],
          checks: [{
            context: ENGINEERING_RC_RELEASE_POLICY.jobName,
            app_id: 1,
          }],
        },
      },
    },
    "engineering RC required check source must be the GitHub Actions app",
  ],
]) {
  test(`rejects branch policy with ${name}`, async () => {
    const currentHarness = harness(options);
    const result = await verify(manifestFixture(), currentHarness);

    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(expected));
    assert.equal(currentHarness.spawnCalls.length, 0);
  });
}

test("fails closed when GitHub API or authorization is unavailable", async () => {
  const currentHarness = harness({ failPath: "/protection" });
  const result = await verify(manifestFixture(), currentHarness);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("GitHub API request failed (401)")),
  );
  assert.equal(currentHarness.spawnCalls.length, 0);
});

test("fails closed when the GitHub attestation cannot be verified", async () => {
  const currentHarness = harness({
    spawnResult: { status: 1, error: undefined },
  });
  const result = await verify(manifestFixture(), currentHarness);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["GitHub attestation verification failed"]);
  assert.equal(currentHarness.spawnCalls.length, 1);
});

test("fails closed when attestation verification returns no JSON result", async () => {
  const currentHarness = harness({
    spawnResult: { status: 0, stdout: "[]", error: undefined },
  });
  const result = await verify(manifestFixture(), currentHarness);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors,
    ["GitHub attestation verification returned no result"],
  );
});

test("rejects an untrusted GitHub CLI before making REST calls", async () => {
  const currentHarness = harness();
  const result = await verifyEngineeringRcRelease(manifestFixture(), {
    manifestPath: MANIFEST_PATH,
    fetchImpl: currentHarness.fetchImpl,
    spawnImpl: currentHarness.spawnImpl,
    now: () => new Date(NOW),
    token: "fixture-token",
    ghPath: TRUSTED_GH_PATH,
    ghSha256: "0".repeat(64),
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.includes(
      "trusted gh binary SHA-256 does not match release policy",
    ),
  );
  assert.equal(currentHarness.fetchCalls.length, 0);
  assert.equal(currentHarness.spawnCalls.length, 0);
});

test("requires an authenticated token before making REST calls", async () => {
  const currentHarness = harness();
  const result = await verifyEngineeringRcRelease(manifestFixture(), {
    manifestPath: MANIFEST_PATH,
    fetchImpl: currentHarness.fetchImpl,
    spawnImpl: currentHarness.spawnImpl,
    now: () => new Date(NOW),
    token: "",
    ghPath: TRUSTED_GH_PATH,
    ghSha256: TRUSTED_GH_SHA256,
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes("GitHub token")),
  );
  assert.equal(currentHarness.fetchCalls.length, 0);
  assert.equal(currentHarness.spawnCalls.length, 0);
});
