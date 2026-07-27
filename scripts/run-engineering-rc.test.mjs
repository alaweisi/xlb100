import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENGINEERING_RC_EXCLUSIONS,
  ENGINEERING_RC_STEPS,
  createEngineeringRcEnvironment,
  validateEngineeringRcPlan,
} from "./run-engineering-rc.mjs";
import {
  ENGINEERING_RC_NODE_VERSION,
} from "./engineering-rc-contract.mjs";
import {
  STAGE4B_API_STEPS,
  createStage4bPlaywrightEnvironment,
  selectStage4bSteps,
} from "./run-stage4b-e2e.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function workflowTriggerBlock(workflow) {
  const lines = workflow.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((line) => line === "on:");
  assert.notEqual(start, -1, "workflow must declare a multiline on block");
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[^\s#][^:]*:/u.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

function workflowJobBlock(workflow, jobId) {
  const lines = workflow.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.notEqual(start, -1, `workflow must declare job ${jobId}`);
  const body = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/u.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

test("engineering RC plan is exact, complete, bounded, and excludes TKE", () => {
  assert.deepEqual(validateEngineeringRcPlan(), []);
  assert.deepEqual(ENGINEERING_RC_EXCLUSIONS, [
    "tke-delivery-deployment-and-cutover",
    "real-payment-provider",
    "real-sms-provider",
    "real-amap-provider",
  ]);
  const commands = ENGINEERING_RC_STEPS
    .map((step) => step.args.join(" "))
    .join("\n");
  assert.doesNotMatch(commands, /(?:^|[\s:])tke(?:$|[\s:])/imu);
  assert.doesNotMatch(commands, /--skip-/iu);
  assert.doesNotMatch(commands, /stage5/iu);
  assert.ok(ENGINEERING_RC_STEPS.every((step) => step.timeoutMs > 0));

  const reduced = ENGINEERING_RC_STEPS.slice(0, -1);
  assert.notDeepEqual(validateEngineeringRcPlan(reduced), []);
  const substituted = ENGINEERING_RC_STEPS.map((step, index) =>
    index === 0 ? { ...step, args: ["test"] } : step);
  assert.ok(
    validateEngineeringRcPlan(substituted).some((error) =>
      error.includes("must match canonical step environment-preflight")),
  );
});

test("deployment Dockerfiles use the canonical Node version", () => {
  const nodeVersion = fs
    .readFileSync(path.join(rootDir, ".node-version"), "utf8")
    .trim();
  assert.equal(nodeVersion, ENGINEERING_RC_NODE_VERSION);

  for (const fileName of ["Dockerfile.backend", "Dockerfile.frontend"]) {
    const dockerfile = fs.readFileSync(
      path.join(rootDir, "infra", "docker", fileName),
      "utf8",
    );
    const baseImages = [...dockerfile.matchAll(/^FROM node:([^\s]+).*$/gmu)]
      .map((match) => match[1]);
    assert.ok(baseImages.length > 0, `${fileName} must use a Node base image`);
    assert.deepEqual(
      [...new Set(baseImages)],
      [`${ENGINEERING_RC_NODE_VERSION}-alpine`],
      `${fileName} must match the canonical Node version`,
    );
  }
});

test("engineering RC executes each bounded step through process-tree cleanup", () => {
  const runner = fs.readFileSync(
    path.join(rootDir, "scripts", "run-engineering-rc.mjs"),
    "utf8",
  );
  assert.match(runner, /export async function runEngineeringRc\(\)/u);
  assert.match(runner, /await runEngineeringRcStep\(\{/u);
  assert.match(runner, /timeoutMs:\s*step\.timeoutMs/u);
  assert.match(runner, /killGraceMs:\s*5_000/u);
  assert.match(runner, /process\.once\("SIGINT", handleSigint\)/u);
  assert.match(runner, /process\.off\("SIGINT", handleSigint\)/u);
  assert.match(runner, /assertRuntimeBindings\(gateEnvironment, dockerRuntime\)/u);
  assert.doesNotMatch(
    runner,
    /spawnSync\(pnpm\.command,\s*\[\.\.\.pnpm\.prefix,\s*\.\.\.step\.args\]/u,
  );
});

test("engineering RC requires every data, browser, mobile, performance, and secret lane", () => {
  const ids = ENGINEERING_RC_STEPS.map((step) => step.id);
  for (const required of [
    "full-regression-non-tke",
    "performance-regression",
    "data-reliability-drill",
    "browser-cross-app",
    "browser-oa-dashboard",
    "browser-dashboard",
    "mobile-tests",
    "mobile-types",
    "mobile-boundaries",
    "mobile-toolchain",
    "mobile-release",
    "tracked-and-history-secrets",
  ]) {
    assert.equal(ids.includes(required), true, `${required} is required`);
  }
  assert.ok(ids.indexOf("mobile-tests") < ids.indexOf("mobile-release"));
  assert.ok(ids.indexOf("mobile-toolchain") < ids.indexOf("mobile-release"));
});

test("engineering RC environment replaces remote resources and strips Provider credentials", () => {
  const environment = createEngineeringRcEnvironment({
    PATH: "fixture",
    MYSQL_HOST: "mysql.prod.internal",
    MYSQL_DATABASE: "xlb_prod",
    REDIS_HOST: "redis.prod.internal",
    XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED: "true",
    XLB_OBJECT_STORAGE_PROVIDER: "cos",
    XLB_COS_SECRET_ID_FILE: "C:/secrets/cos-id",
    XLB_COS_SECRET_KEY_FILE: "C:/secrets/cos-key",
    XLB_PAYMENT_SECRET_KEY: "should-not-survive",
  });
  assert.equal(environment.PATH, "fixture");
  assert.equal(environment.NODE_ENV, "test");
  assert.equal(environment.BACKEND_HOST, "127.0.0.1");
  assert.equal(environment.MYSQL_HOST, "127.0.0.1");
  assert.equal(environment.MYSQL_DATABASE, "xlb_local");
  assert.equal(environment.REDIS_HOST, "127.0.0.1");
  assert.equal(environment.XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED, "false");
  assert.equal(environment.XLB_OBJECT_STORAGE_PROVIDER, "local");
  assert.equal(environment.XLB_PAYMENT_PROVIDER, "mock");
  assert.equal(environment.XLB_SMS_PROVIDER, "mock");
  assert.equal(environment.XLB_GEO_PROVIDER, "local_mock");
  assert.equal(environment.XLB_COS_SECRET_ID_FILE, undefined);
  assert.equal(environment.XLB_COS_SECRET_KEY_FILE, undefined);
  assert.equal(environment.XLB_PAYMENT_SECRET_KEY, undefined);
});

test("Phase 28 callback is test-only and Stage 4B browser mode cannot select Provider readiness", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
  const command = manifest.scripts["test:e2e:phase28"];
  assert.match(command, /\bNODE_ENV=test\b/u);
  assert.match(command, /\bPAYMENT_MOCK_WEBHOOK_ENABLED=true\b/u);
  assert.match(
    command,
    /\bPAYMENT_MOCK_WEBHOOK_SECRET=xlb-test-only-mock-payment-webhook-secret\b/u,
  );
  const browserSteps = selectStage4bSteps({ browserOnly: true });
  assert.equal(browserSteps.length, 6);
  assert.equal(
    browserSteps.some((step) =>
      step.args.some((argument) => argument.includes("provider"))),
    false,
  );
  assert.equal(
    STAGE4B_API_STEPS.some((step) => step.id === "provider-readiness"),
    true,
  );
});

test("Stage 4B adds a report id only when Playwright evidence is enabled", () => {
  assert.deepEqual(
    createStage4bPlaywrightEnvironment({ NODE_ENV: "test" }, 0, "smoke"),
    { NODE_ENV: "test" },
  );
  assert.deepEqual(
    createStage4bPlaywrightEnvironment(
      {
        NODE_ENV: "test",
        XLB_PLAYWRIGHT_EVIDENCE_DIR: "evidence",
      },
      1,
      "support",
    ),
    {
      NODE_ENV: "test",
      XLB_PLAYWRIGHT_EVIDENCE_DIR: "evidence",
      XLB_PLAYWRIGHT_REPORT_ID: "stage4b-02-support",
    },
  );
});

test("Stage 4A scopes the mock payment callback to isolated reliability fixtures", () => {
  const stage4a = fs.readFileSync(
    path.join(rootDir, "scripts", "run-stage4a-data-reliability.ps1"),
    "utf8",
  );
  assert.match(
    stage4a,
    /\$env:PAYMENT_MOCK_WEBHOOK_ENABLED = 'true'[\s\S]*isolated Outbox reliability tests[\s\S]*finally \{[\s\S]*\$env:PAYMENT_MOCK_WEBHOOK_ENABLED = 'false'/u,
  );
  assert.match(
    stage4a,
    /\$env:PAYMENT_MOCK_WEBHOOK_SECRET = 'xlb-test-only-mock-payment-webhook-secret'[\s\S]*\$env:PAYMENT_MOCK_WEBHOOK_SECRET = ''/u,
  );
  assert.doesNotMatch(stage4a, /XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED\s*=\s*'true'/u);
});

test("RC test configs reject focused tests, bind loopback, reject stale servers, and emit JSON evidence", () => {
  for (const name of [
    "playwright.config.ts",
    "playwright.phase27.config.ts",
    "playwright.phase28.config.ts",
    "playwright.phase29.config.ts",
    "playwright.oa-dashboard.config.ts",
    "playwright.dashboard.config.ts",
  ]) {
    const config = fs.readFileSync(path.join(rootDir, name), "utf8");
    assert.match(config, /forbidOnly:\s*true/u);
    assert.doesNotMatch(config, /reuseExistingServer:\s*true/u);
    assert.match(config, /engineeringReporter/u);
    if (config.includes("@xlb/backend")) {
      assert.match(config, /BACKEND_HOST=127\.0\.0\.1/u);
    }
  }
  const vitestConfig = fs.readFileSync(
    path.join(rootDir, "vitest.config.ts"),
    "utf8",
  );
  assert.match(vitestConfig, /allowOnly:\s*false/u);
});

test("main CI executes the unique canonical gate with the pinned toolchain", () => {
  const workflow = fs.readFileSync(
    path.join(rootDir, ".github", "workflows", "ci.yml"),
    "utf8",
  );
  assert.match(workflow, /node-version:\s*"24\.14\.0"/u);
  assert.match(workflow, /java-version:\s*"21"/u);
  assert.match(workflow, /platforms;android-36/u);
  assert.doesNotMatch(workflow, /yes\s*\|[\s\S]*sdkmanager/u);
  assert.match(workflow, /run: pnpm gate:engineering-rc/u);
  assert.match(workflow, /if: always\(\)/u);
  assert.match(workflow, /\.artifacts\/engineering-rc\//u);
  assert.match(workflow, /^ {2}engineering_rc:\s*$/mu);
  assert.match(workflow, /name: Engineering RC \(non-TKE\)/u);
  assert.match(workflow, /include-hidden-files:\s*true/u);
  assert.match(workflow, /if-no-files-found:\s*error/u);
  assert.match(
    workflow,
    /engineering-rc-\$\{\{ github\.repository_id \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-\$\{\{ github\.sha \}\}/u,
  );
  assert.match(workflow, /^ {2}attest:\s*$/mu);
  assert.match(workflow, /name: Engineering RC provenance/u);
  assert.match(workflow, /needs: engineering_rc/u);
  assert.match(
    workflow,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u,
  );
  assert.match(workflow, /id-token:\s*write/u);
  assert.match(workflow, /attestations:\s*write/u);
  assert.match(
    workflow,
    /uses: actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/u,
  );
  assert.match(
    workflow,
    /uses: actions\/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6/u,
  );
  assert.match(
    workflow,
    /subject-path: \.attestation-input\/\*\*\/manifest\.json/u,
  );
  const engineeringJob = workflowJobBlock(workflow, "engineering_rc");
  const attestationJob = workflowJobBlock(workflow, "attest");
  assert.doesNotMatch(engineeringJob, /id-token:\s*write/u);
  assert.doesNotMatch(engineeringJob, /attestations:\s*write/u);
  assert.match(attestationJob, /needs:\s*engineering_rc/u);
  assert.match(attestationJob, /actions:\s*read/u);
  assert.match(attestationJob, /contents:\s*read/u);
  assert.doesNotMatch(attestationJob, /actions\/checkout@/u);
});

test("only canonical CI and the scoped TKE delivery line auto-trigger", () => {
  const workflowsDirectory = path.join(rootDir, ".github", "workflows");
  const workflowFiles = fs.readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort();
  assert.ok(workflowFiles.includes("ci.yml"));
  assert.ok(workflowFiles.includes("tke-delivery-line.yml"));

  for (const name of workflowFiles) {
    const workflow = fs.readFileSync(path.join(workflowsDirectory, name), "utf8");
    const triggers = workflowTriggerBlock(workflow);
    if (name === "ci.yml") {
      assert.match(triggers, /^(?: {2})?push:/mu);
      assert.match(triggers, /^(?: {2})?pull_request:/mu);
      continue;
    }
    if (name === "tke-delivery-line.yml") {
      assert.match(triggers, /^(?: {2})?push:/mu);
      assert.match(triggers, /^(?: {2})?pull_request:/mu);
      assert.doesNotMatch(
        triggers,
        /(?:^|[\s"'])package\.json(?:$|[\s"'])/mu,
        "generic package.json changes must not trigger the TKE-only workflow",
      );
      continue;
    }
    assert.equal(
      triggers,
      "workflow_dispatch:",
      `${name} must remain manual-only; ci.yml is the unique non-TKE automatic entry`,
    );
  }
});

test("non-TKE regression, zero-warning lint, and cross-platform PowerShell are canonical", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  );
  assert.match(
    manifest.scripts["test:engineering-non-tke"],
    /XLB_EXCLUDE_TKE_TESTS=1/u,
  );
  assert.doesNotMatch(
    manifest.scripts["test:engineering-non-tke"],
    /PAYMENT_MOCK_WEBHOOK/u,
  );
  const projectRunner = fs.readFileSync(
    path.join(rootDir, "scripts", "run-vitest-projects.mjs"),
    "utf8",
  );
  assert.match(
    projectRunner,
    /delete unitEnv\.PAYMENT_MOCK_WEBHOOK_ENABLED/u,
  );
  assert.match(
    projectRunner,
    /delete env\.PAYMENT_MOCK_WEBHOOK_ENABLED/u,
  );
  assert.match(
    fs.readFileSync(path.join(rootDir, "vitest.config.ts"), "utf8"),
    /tests\/unit\/tke\*\.test\.ts/u,
  );
  const lintStep = ENGINEERING_RC_STEPS.find((step) => step.id === "lint");
  assert.deepEqual(
    lintStep.args,
    [
      "exec",
      "--",
      "turbo",
      "run",
      "lint",
      "--force",
      "--",
      "--max-warnings=0",
    ],
  );
  assert.deepEqual(
    ENGINEERING_RC_STEPS.find((step) => step.id === "typecheck").args,
    ["exec", "--", "turbo", "run", "typecheck", "--force"],
  );
  assert.deepEqual(
    ENGINEERING_RC_STEPS.find((step) => step.id === "build").args,
    ["exec", "--", "turbo", "run", "build", "--force"],
  );
  for (const scriptName of [
    "check:migration:runtime",
    "check:migration-integrity",
    "test:migration:oa",
    "preflight",
  ]) {
    assert.match(manifest.scripts[scriptName], /node scripts\/run-powershell\.mjs/u);
  }
});
