import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateEngineeringRcEvidence } from "./check-engineering-rc-evidence.mjs";
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
  ENGINEERING_RC_COREPACK_RUNTIME_PINS,
  ENGINEERING_RC_COREPACK_RUNTIME_PINS_BY_PLATFORM,
  ENGINEERING_RC_LOCAL_MYSQL_CONTAINER,
  ENGINEERING_RC_LOCAL_REDIS_CONTAINER,
  ENGINEERING_RC_PACKAGE_MANAGER,
  ENGINEERING_RC_PNPM_RUNTIME_PINS,
} from "./engineering-rc-runtime.mjs";

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
  return sha256(filePath);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-rc-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const commit = "a".repeat(40);
  const runId = "2026-07-27T00-00-00-000Z-aaaaaaaaaaaa";
  const relativeArtifactRoot =
    `.artifacts/engineering-rc/${commit}/${runId}`;
  const artifactRoot = path.join(root, relativeArtifactRoot);
  fs.mkdirSync(artifactRoot, { recursive: true });
  const lockfile = path.join(root, "pnpm-lock.yaml");
  fs.writeFileSync(lockfile, "lockfileVersion: '9.0'\n", "utf8");
  const started = Date.parse("2026-07-27T00:00:00.000Z");
  const completed = started + ENGINEERING_RC_STEPS.length * 1_000;
  const evidence = {
    schemaVersion: 3,
    gate: ENGINEERING_RC_GATE,
    runId,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(completed).toISOString(),
    authorization: {
      evidenceClass: "DIAGNOSTIC_ONLY",
      releaseAuthority:
        "REQUIRES_PROTECTED_CI_SUCCESS_AND_VERIFIED_GITHUB_ATTESTATION",
      githubRun: null,
    },
    source: {
      commit,
      commitEnd: commit,
      cleanBefore: true,
      cleanAfter: true,
      lockfileSha256: sha256(lockfile),
    },
    tools: {
      node: ENGINEERING_RC_NODE_VERSION,
      pnpm: ENGINEERING_RC_PNPM_VERSION,
      pnpmRuntime: {
        packageManager: ENGINEERING_RC_PACKAGE_MANAGER,
        packageName: "pnpm",
        packageVersion: ENGINEERING_RC_PNPM_VERSION,
        packageIntegrity: ENGINEERING_RC_PNPM_RUNTIME_PINS.integrity,
        packageTreeSha256: ENGINEERING_RC_PNPM_RUNTIME_PINS.packageTreeSha256,
        entrySha256: ENGINEERING_RC_PNPM_RUNTIME_PINS.entrySha256,
        launcher: {
          packageName: "corepack",
          packageVersion: ENGINEERING_RC_COREPACK_RUNTIME_PINS.version,
          entrySha256: ENGINEERING_RC_COREPACK_RUNTIME_PINS.entrySha256,
          packageTreeSha256:
            ENGINEERING_RC_COREPACK_RUNTIME_PINS.packageTreeSha256,
        },
      },
      docker: {
        context: "desktop-linux",
        endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
        containers: {
          mysql: {
            name: ENGINEERING_RC_LOCAL_MYSQL_CONTAINER,
            id: "1".repeat(64),
            image: "mysql:8",
            imageId: `sha256:${"2".repeat(64)}`,
            manifestDigest: `sha256:${"3".repeat(64)}`,
            running: true,
            healthy: true,
            privileged: false,
            networkMode: "bridge",
            port: {
              container: "3306/tcp",
              host: "3306",
              bindings: [{ hostIp: "0.0.0.0", hostPort: "3306" }],
            },
          },
          redis: {
            name: ENGINEERING_RC_LOCAL_REDIS_CONTAINER,
            id: "4".repeat(64),
            image: "redis:7",
            imageId: `sha256:${"5".repeat(64)}`,
            manifestDigest: `sha256:${"6".repeat(64)}`,
            running: true,
            healthy: true,
            privileged: false,
            networkMode: "bridge",
            port: {
              container: "6379/tcp",
              host: "6379",
              bindings: [{ hostIp: "0.0.0.0", hostPort: "6379" }],
            },
          },
        },
      },
      platform: `${process.platform}-${process.arch}`,
      mobile: {
        signingClass: "simulation",
        reports: ["customer", "worker", "admin"].map((role) => ({
          role,
          javaMajor: 21,
          androidApi: 36,
        })),
      },
    },
    scope: {
      exclusions: [...ENGINEERING_RC_EXCLUSIONS],
      realProviderExecution: false,
      providerEnvironment: { ...ENGINEERING_RC_PROVIDER_ISOLATION },
      database: { host: "127.0.0.1", port: "3306", name: "xlb_local" },
      redis: { host: "127.0.0.1", port: "6379" },
      productionActivation: "NOT_EVALUATED",
    },
    requiredStepIds: [...ENGINEERING_RC_REQUIRED_STEP_IDS],
    artifactRoot: relativeArtifactRoot,
    steps: [],
    executionResult: "PASS",
    releaseGateEligible: false,
  };

  for (let index = 0; index < ENGINEERING_RC_STEPS.length; index += 1) {
    const canonical = ENGINEERING_RC_STEPS[index];
    const logName =
      `${String(index + 1).padStart(2, "0")}-${canonical.id}.log`;
    const logPath = path.join(artifactRoot, logName);
    fs.writeFileSync(logPath, `PASS ${canonical.id}\n`, "utf8");
    const stepStart = started + index * 1_000;
    const stepEnd = stepStart + 500;
    const step = {
      id: canonical.id,
      stage: canonical.stage,
      command: [...canonical.args],
      timeoutMs: canonical.timeoutMs,
      startedAt: new Date(stepStart).toISOString(),
      completedAt: new Date(stepEnd).toISOString(),
      durationMs: 500,
      exitCode: 0,
      status: "PASS",
      logPath: `${relativeArtifactRoot}/${logName}`,
      logSha256: sha256(logPath),
      artifacts: [],
    };
    if (canonical.artifact?.kind === "stage4a") {
      const artifactPath = path.join(artifactRoot, "structured", "stage4a.json");
      step.artifacts.push({
        kind: "stage4a",
        path: "structured/stage4a.json",
        sha256: writeJson(artifactPath, {
          sourceCommit: commit,
          result: "PASS_LOCAL_STAGE4A_DRILL",
          realProviderUsed: false,
          productionOperationPerformed: false,
          isolatedRedis: { removedAfterDrill: true },
          outbox: { testDatabase: "isolated and removed after drill" },
        }),
      });
    } else if (canonical.artifact?.kind === "oa-migration") {
      const artifactPath = path.join(
        artifactRoot,
        "structured",
        "oa-migration.json",
      );
      step.artifacts.push({
        kind: "oa-migration",
        path: "structured/oa-migration.json",
        sha256: writeJson(artifactPath, {
          sourceCommit: commit,
          result: "PASS",
          databaseRemoved: true,
          migrationMarkers: 3,
          requiredTables: 24,
        }),
      });
    } else if (canonical.artifact?.kind === "playwright") {
      for (
        let reportIndex = 0;
        reportIndex < canonical.artifact.minimumFiles;
        reportIndex += 1
      ) {
        const name = `${canonical.id}-${reportIndex + 1}.json`;
        const artifactPath = path.join(artifactRoot, "playwright", name);
        step.artifacts.push({
          kind: "playwright",
          path: `playwright/${name}`,
          sha256: writeJson(artifactPath, {
            stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
          }),
        });
      }
    } else if (canonical.artifact?.kind === "mobile-m5") {
      const artifactPath = path.join(
        artifactRoot,
        "structured",
        "mobile-m5.json",
      );
      const reports = ["customer", "worker", "admin"].map((role, roleIndex) => ({
        role,
        apkPath: `fixture-${role}.apk`,
        sha256: "",
        certificateDn: `CN=XLB ${role} Engineering RC Simulation`,
        certificateSha256: String(roleIndex + 4).repeat(64),
        publicKeySha256: String(roleIndex + 7).repeat(64),
        apiBaseUrl: `https://${role}.engineering-rc.invalid`,
      }));
      const apkArtifacts = reports.map((report) => {
        const relativePath = `structured/apks/${report.role}.apk`;
        const apkPath = path.join(artifactRoot, relativePath);
        fs.mkdirSync(path.dirname(apkPath), { recursive: true });
        fs.writeFileSync(apkPath, `fixture APK ${report.role}\n`, "utf8");
        report.sha256 = sha256(apkPath).toUpperCase();
        return {
          kind: "mobile-apk",
          role: report.role,
          path: relativePath,
          sha256: sha256(apkPath),
        };
      });
      step.artifacts.push({
        kind: "mobile-m5",
        path: "structured/mobile-m5.json",
        sha256: writeJson(artifactPath, {
          releaseCandidate: true,
          published: false,
          signingClass: "simulation",
          sourceCommit: commit,
          reports,
        }),
      });
      step.artifacts.push(...apkArtifacts);
    }
    evidence.steps.push(step);
  }
  return {
    root,
    evidence,
    commit,
    lockfileSha256: evidence.source.lockfileSha256,
    now: new Date(completed + 60_000),
  };
}

function validate(current) {
  return validateEngineeringRcEvidence(current.evidence, {
    root: current.root,
    currentCommit: current.commit,
    currentLockfileSha256: current.lockfileSha256,
    currentClean: true,
    currentGithubRun: null,
    now: current.now,
  });
}

test("engineering RC evidence accepts only the complete canonical current run", (t) => {
  const current = fixture(t);
  assert.deepEqual(validate(current), []);
});

test("engineering RC evidence cannot claim local release authority", (t) => {
  const current = fixture(t);
  current.evidence.authorization.evidenceClass = "RELEASE_AUTHORITY";
  assert.ok(
    validate(current).includes(
      "local evidence must not claim independent release authority",
    ),
  );
});

test("engineering RC evidence binds optional GitHub provenance to the source commit", (t) => {
  const current = fixture(t);
  current.evidence.authorization.githubRun = {
    repository: "owner/repository",
    repositoryId: "12345",
    workflowRef: "owner/repository/.github/workflows/ci.yml@refs/heads/main",
    workflowSha: "b".repeat(40),
    runId: "12345",
    runAttempt: "1",
    sourceSha: "c".repeat(40),
    eventName: "push",
  };
  assert.ok(
    validate(current).includes(
      "GitHub run provenance is incomplete or not bound to the source commit",
    ),
  );
});

test("engineering RC evidence accepts only pinned Linux Corepack for GitHub", (t) => {
  const current = fixture(t);
  const linuxPins = ENGINEERING_RC_COREPACK_RUNTIME_PINS_BY_PLATFORM.linux;
  current.evidence.authorization.githubRun = {
    repository: "owner/repository",
    repositoryId: "12345",
    workflowRef: "owner/repository/.github/workflows/ci.yml@refs/heads/main",
    workflowSha: "b".repeat(40),
    runId: "12345",
    runAttempt: "1",
    sourceSha: current.commit,
    eventName: "push",
  };
  current.evidence.tools.platform = "linux-x64";
  current.evidence.tools.pnpmRuntime.launcher = {
    packageName: "corepack",
    packageVersion: linuxPins.version,
    entrySha256: linuxPins.entrySha256,
    packageTreeSha256: linuxPins.packageTreeSha256,
  };
  assert.deepEqual(validate(current), []);

  current.evidence.tools.platform = "win32-x64";
  assert.ok(
    validate(current).includes(
      "toolchain platform does not match the evidence origin",
    ),
  );
});

test("engineering RC evidence must match the current GitHub Actions run", (t) => {
  const current = fixture(t);
  const githubRun = {
    repository: "owner/repository",
    repositoryId: "12345",
    workflowRef: "owner/repository/.github/workflows/ci.yml@refs/heads/main",
    workflowSha: "b".repeat(40),
    runId: "12345",
    runAttempt: "1",
    sourceSha: current.commit,
    eventName: "push",
  };
  current.evidence.authorization.githubRun = githubRun;
  const errors = validateEngineeringRcEvidence(current.evidence, {
    root: current.root,
    currentCommit: current.commit,
    currentLockfileSha256: current.lockfileSha256,
    currentClean: true,
    currentGithubRun: { ...githubRun, runAttempt: "2" },
    now: current.now,
  });
  assert.ok(errors.includes("evidence is not bound to the current GitHub Actions run"));
});

test("engineering RC evidence rejects forged pnpm and remote Docker runtime claims", (t) => {
  const current = fixture(t);
  current.evidence.tools.pnpmRuntime.entrySha256 = "0".repeat(64);
  current.evidence.tools.docker.endpoint = "tcp://docker.example:2376";
  const errors = validate(current);
  assert.ok(
    errors.includes("pnpm runtime evidence does not match the pinned RC toolchain"),
  );
  assert.ok(
    errors.includes("Docker runtime evidence does not prove canonical local containers"),
  );
});

test("engineering RC evidence rejects a self-declared reduced plan", (t) => {
  const current = fixture(t);
  current.evidence.requiredStepIds = ["environment-preflight"];
  current.evidence.steps = current.evidence.steps.slice(0, 1);
  const errors = validate(current);
  assert.ok(errors.includes("requiredStepIds do not match the canonical RC plan"));
  assert.ok(errors.includes("evidence must contain every canonical step exactly once"));
});

test("engineering RC evidence rejects stale commit, lockfile, and command substitution", (t) => {
  const current = fixture(t);
  current.evidence.source.commitEnd = "b".repeat(40);
  current.evidence.source.lockfileSha256 = "c".repeat(64);
  current.evidence.steps[0].command = ["tke:gate", "--skip-browser"];
  const errors = validate(current);
  assert.ok(errors.includes("source commit changed during the gate"));
  assert.ok(errors.includes("lockfile hash does not match the current lockfile"));
  assert.ok(
    errors.includes(
      "step 1 does not match canonical command environment-preflight",
    ),
  );
});

test("engineering RC evidence rejects invalid structured results", (t) => {
  const current = fixture(t);
  const mobileStep = current.evidence.steps.find(
    (entry) => entry.id === "mobile-release",
  );
  const mobilePath = path.join(
    current.root,
    current.evidence.artifactRoot,
    mobileStep.artifacts[0].path,
  );
  mobileStep.artifacts[0].sha256 = writeJson(mobilePath, {
    releaseCandidate: true,
    published: false,
    signingClass: "release",
    sourceCommit: current.commit,
    reports: [],
  });
  const errors = validate(current);
  assert.ok(
    errors.includes("mobile M5 evidence is not a three-app simulation RC"),
  );
});

for (const nonPassingStatus of ["skipped", "flaky"]) {
  test(`engineering RC evidence rejects Playwright ${nonPassingStatus} tests`, (t) => {
    const current = fixture(t);
    const playwrightStep = current.evidence.steps.find(
      (entry) => entry.id === "browser-cross-app",
    );
    const descriptor = playwrightStep.artifacts[0];
    const artifactPath = path.join(
      current.root,
      current.evidence.artifactRoot,
      descriptor.path,
    );
    const payload = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    payload.stats[nonPassingStatus] = 1;
    descriptor.sha256 = writeJson(artifactPath, payload);

    assert.ok(
      validate(current).includes(
        "Playwright evidence does not prove a passing test run",
      ),
    );
  });
}

test("engineering RC evidence rejects a simulation certificate assigned to the wrong app", (t) => {
  const current = fixture(t);
  const mobileStep = current.evidence.steps.find(
    (entry) => entry.id === "mobile-release",
  );
  const descriptor = mobileStep.artifacts[0];
  const mobilePath = path.join(
    current.root,
    current.evidence.artifactRoot,
    descriptor.path,
  );
  const payload = JSON.parse(fs.readFileSync(mobilePath, "utf8"));
  payload.reports[0].certificateDn =
    "CN=XLB worker Engineering RC Simulation";
  descriptor.sha256 = writeJson(mobilePath, payload);
  assert.ok(
    validate(current).includes(
      "mobile M5 customer hashes or role-bound certificate are invalid",
    ),
  );
});
