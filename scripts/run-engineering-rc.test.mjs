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
  STAGE4B_API_STEPS,
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

test("RC browser configs bind loopback, reject stale servers, and emit JSON evidence", () => {
  for (const name of [
    "playwright.config.ts",
    "playwright.phase27.config.ts",
    "playwright.phase28.config.ts",
    "playwright.phase29.config.ts",
    "playwright.oa-dashboard.config.ts",
    "playwright.dashboard.config.ts",
  ]) {
    const config = fs.readFileSync(path.join(rootDir, name), "utf8");
    assert.doesNotMatch(config, /reuseExistingServer:\s*true/u);
    assert.match(config, /engineeringReporter/u);
    if (config.includes("@xlb/backend")) {
      assert.match(config, /BACKEND_HOST=127\.0\.0\.1/u);
    }
  }
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
    ["lint", "--", "--force", "--", "--max-warnings=0"],
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
