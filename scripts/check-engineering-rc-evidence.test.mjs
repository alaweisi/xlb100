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
    schemaVersion: 2,
    gate: ENGINEERING_RC_GATE,
    runId,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(completed).toISOString(),
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
      platform: "win32-x64",
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
    verdict: "GO",
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
    now: current.now,
  });
}

test("engineering RC evidence accepts only the complete canonical current run", (t) => {
  const current = fixture(t);
  assert.deepEqual(validate(current), []);
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
