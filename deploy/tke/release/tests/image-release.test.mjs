import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateContract } from "../../../../scripts/check-tke-release-contracts.mjs";
import { assertIgnoredArtifactInput, executeImageRelease } from "../image-release.mjs";

const commit = "a".repeat(40);
const digests = Object.freeze({
  backend: `sha256:${"1".repeat(64)}`,
  customer: `sha256:${"2".repeat(64)}`,
  worker: `sha256:${"3".repeat(64)}`,
  admin: `sha256:${"4".repeat(64)}`,
});

function validInput(overrides = {}) {
  return {
    releaseId: "release-20260716-001",
    environment: "production",
    repositoryPrefix: "ccr.ccs.tencentyun.com/xlb",
    sourceCommit: commit,
    owners: { release: "release-owner", data: "data-owner", onCall: "oncall-owner", cost: "cost-owner" },
    changeWindow: {
      startsAt: "2026-07-18T01:00:00.000Z",
      endsAt: "2026-07-18T05:00:00.000Z",
      timezone: "Asia/Shanghai",
    },
    trafficProvider: "clb",
    ...overrides,
  };
}

function workspace() {
  return mkdtempSync(path.join(os.tmpdir(), "xlb-image-release-"));
}

function mockRunner(calls, digestOverride = {}) {
  return (command, args) => {
    calls.push([command, ...args]);
    if (command === "docker" && args[0] === "buildx" && args[1] === "imagetools") {
      const reference = args[3];
      const component = Object.keys(digests).find(name => reference.includes(`/${name}:`));
      return { stdout: `"${digestOverride[component] ?? digests[component]}"\n`, stderr: "" };
    }
    if (command === "syft") {
      const output = args.find(value => value.startsWith("cyclonedx-json="))?.slice("cyclonedx-json=".length);
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, "{}\n");
    }
    if (command === "trivy") {
      const output = args[args.indexOf("--output") + 1];
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, "{}\n");
    }
    return { stdout: "", stderr: "" };
  };
}

test("plan is fail-closed, emits Wave 0 manifest, and runs no external command", () => {
  const repoRoot = workspace();
  const calls = [];
  const result = executeImageRelease({
    input: validInput(), mode: "plan", repoRoot, sourceCommit: commit,
    runner: mockRunner(calls), clock: () => new Date("2026-07-16T08:00:00.000Z"),
  });
  assert.equal(result.status, "PLANNED");
  assert.equal(result.plan.externalWriteAuthorized, false);
  assert.equal(result.plan.commands.length, 4);
  assert.equal(calls.length, 0);
  assert.equal(validateContract("releaseManifest", result.manifest), result.manifest);
  assert.equal(result.manifest.imageLockFile, ".artifacts/tke/releases/release-20260716-001/images.lock.json");
});

test("local build builds exactly four images and never pushes or freezes a digest", () => {
  const calls = [];
  const result = executeImageRelease({
    input: validInput(), mode: "build", repoRoot: workspace(), sourceCommit: commit,
    runner: mockRunner(calls), clock: () => new Date("2026-07-16T08:00:00.000Z"),
  });
  assert.equal(result.status, "BUILT_LOCAL_ONLY");
  assert.equal(result.imageLock, null);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call[0] === "docker" && call[1] === "build" && !call.includes("--push")));
  assert.ok(calls.every(call => !call.join(" ").includes(":latest")));
});

test("authorized publish builds four images, inspects registry digests, and emits valid lock evidence", () => {
  const calls = [];
  const repoRoot = workspace();
  const input = validInput();
  const result = executeImageRelease({
    input, mode: "publish", confirmation: `PUBLISH-IMAGES-${input.releaseId}`,
    repoRoot, sourceCommit: commit, runner: mockRunner(calls),
    clock: () => new Date("2026-07-16T08:00:00.000Z"),
  });
  assert.equal(result.status, "IMAGES_PUBLISHED");
  assert.equal(validateContract("imageLock", result.imageLock), result.imageLock);
  assert.deepEqual(Object.keys(result.imageLock.images), ["backend", "customer", "worker", "admin"]);
  assert.equal(result.imageLock.images.worker.digest, digests.worker);
  assert.equal(calls.filter(call => call.includes("--push")).length, 4);
  assert.equal(calls.filter(call => call[0] === "syft").length, 4);
  assert.equal(calls.filter(call => call[0] === "trivy").length, 4);
  assert.ok(calls.every(call => call[0] !== "docker" || call[1] !== "login"));
  assert.match(readFileSync(path.join(result.artifactRoot, "images.lock.json"), "utf8"), /sha256:1111/);
});

test("publish and registry freeze require an exact release-scoped confirmation", () => {
  for (const mode of ["publish", "freeze"]) {
    assert.throws(() => executeImageRelease({
      input: validInput(), mode, repoRoot: workspace(), sourceCommit: commit, runner: mockRunner([]),
    }), /explicit confirmation required/);
  }
});

test("registry placeholders, mutable tags, latest release ids, and credential fields are rejected", () => {
  const cases = [
    [validInput({ repositoryPrefix: "example.invalid/xlb" }), /placeholder/],
    [validInput({ repositoryPrefix: "ccr.ccs.tencentyun.com/xlb:mutable" }), /untagged|mutable tag/],
    [validInput({ releaseId: "latest" }), /must not be latest/],
    [{ ...validInput(), secretId: "not-allowed" }, /forbidden credential field/],
  ];
  for (const [input, expected] of cases) {
    assert.throws(() => executeImageRelease({ input, repoRoot: workspace(), sourceCommit: commit, runner: mockRunner([]) }), expected);
  }
});

test("zero or malformed registry digests fail before an image lock is written", () => {
  const input = validInput();
  assert.throws(() => executeImageRelease({
    input, mode: "freeze", confirmation: `FREEZE-IMAGES-${input.releaseId}`,
    repoRoot: workspace(), sourceCommit: commit,
    runner: mockRunner([], { backend: `sha256:${"0".repeat(64)}` }),
  }), /all-zero placeholder digest/);
});

test("completed release IDs are idempotent and cannot be rebound", () => {
  const repoRoot = workspace();
  const input = validInput();
  executeImageRelease({
    input, mode: "freeze", confirmation: `FREEZE-IMAGES-${input.releaseId}`,
    repoRoot, sourceCommit: commit, runner: mockRunner([]),
    clock: () => new Date("2026-07-16T08:00:00.000Z"),
  });
  const resumedCalls = [];
  const resumed = executeImageRelease({
    input, mode: "freeze", confirmation: `FREEZE-IMAGES-${input.releaseId}`,
    repoRoot, sourceCommit: commit, runner: mockRunner(resumedCalls),
    clock: () => new Date("2026-07-16T09:00:00.000Z"),
  });
  assert.equal(resumed.status, "IMAGES_PUBLISHED");
  assert.equal(resumedCalls.length, 0);
  assert.throws(() => executeImageRelease({
    input: validInput({ owners: { ...input.owners, release: "another-owner" } }),
    mode: "plan", repoRoot, sourceCommit: commit, runner: mockRunner([]),
  }), /different release identity/);
});

test("CLI inputs must exist below ignored .artifacts/tke", () => {
  const repoRoot = workspace();
  const allowed = path.join(repoRoot, ".artifacts", "tke", "input.json");
  mkdirSync(path.dirname(allowed), { recursive: true });
  writeFileSync(allowed, "{}\n");
  assert.equal(assertIgnoredArtifactInput(repoRoot, allowed), allowed);
  const outside = path.join(repoRoot, "input.json");
  writeFileSync(outside, "{}\n");
  assert.throws(() => assertIgnoredArtifactInput(repoRoot, outside), /must remain under ignored/);
});
