import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  INVESTOR_DEMO_API_ORIGIN,
  INVESTOR_DEMO_VERSION,
  assertInvestorDemoPrerequisites,
  investorDemoArtifactRoot,
  investorDemoApp,
  requiredInvestorDemoEnvironmentNames,
} from "./mobile-investor-demo-release.mjs";
import { mobileReleaseApps } from "./mobile-release-prerequisites.mjs";

function completeEnvironment() {
  const signingFixtureRoot = path.resolve(
    mobileReleaseApps[0].paths.workspaceRoot,
    "..",
    "investor-demo-signing-fixtures",
  );
  const environment = {
    XLB_INVESTOR_DEMO_API_ORIGIN: INVESTOR_DEMO_API_ORIGIN,
  };
  for (const [index, name] of requiredInvestorDemoEnvironmentNames().entries()) {
    environment[name] = name.endsWith("_KEYSTORE_PATH")
      ? path.join(signingFixtureRoot, `demo-role-${index}.jks`)
      : `fixture-${index}`;
  }
  return environment;
}

test("Investor Demo identities are distinct from Engineering M5 identities", () => {
  const demoApps = mobileReleaseApps.map(investorDemoApp);
  assert.deepEqual(
    demoApps.map((app) => app.appId),
    [
      "com.xlb100.customer.demo",
      "com.xlb100.worker.demo",
      "com.xlb100.admin.demo",
    ],
  );
  assert.ok(demoApps.every((app) => app.appName.includes("演示")));
  assert.ok(demoApps.every((app) => app.version === INVESTOR_DEMO_VERSION));
  assert.equal(INVESTOR_DEMO_VERSION.code, 2);
});

test("Investor Demo requires complete external role-specific signing", () => {
  const environment = completeEnvironment();
  assert.deepEqual(
    assertInvestorDemoPrerequisites({
      environment,
      exists: () => true,
    }),
    {
      apiOrigin: INVESTOR_DEMO_API_ORIGIN,
      published: false,
    },
  );

  delete environment.XLB_ADMIN_ANDROID_DEMO_KEY_PASSWORD;
  assert.throws(
    () => assertInvestorDemoPrerequisites({ environment, exists: () => true }),
    /signing environment is incomplete/u,
  );
});

test("Investor Demo rejects non-Staging and placeholder origins", () => {
  const environment = completeEnvironment();
  environment.XLB_INVESTOR_DEMO_API_ORIGIN =
    "https://mobile.engineering-rc.invalid";
  assert.throws(
    () => assertInvestorDemoPrerequisites({ environment, exists: () => true }),
    /pinned to Tencent Staging|placeholder/u,
  );

  environment.XLB_INVESTOR_DEMO_API_ORIGIN = "https://example.com";
  assert.throws(
    () => assertInvestorDemoPrerequisites({ environment, exists: () => true }),
    /pinned to Tencent Staging/u,
  );

  environment.XLB_INVESTOR_DEMO_API_ORIGIN = "http://123.207.198.136:80";
  assert.throws(
    () => assertInvestorDemoPrerequisites({ environment, exists: () => true }),
    /pinned to Tencent Staging/u,
  );
});

test("Investor Demo artifact sealing supports an explicit absolute base", () => {
  const sourceCommit = "a".repeat(40);
  const workspaceRoot = path.resolve("workspace");
  const artifactBase = path.resolve("external-artifacts");
  assert.equal(
    investorDemoArtifactRoot({
      environment: { XLB_INVESTOR_DEMO_ARTIFACT_BASE: artifactBase },
      sourceCommit,
      workspaceRoot,
    }),
    path.join(artifactBase, sourceCommit),
  );
  assert.throws(
    () => investorDemoArtifactRoot({
      environment: { XLB_INVESTOR_DEMO_ARTIFACT_BASE: "relative-artifacts" },
      sourceCommit,
      workspaceRoot,
    }),
    /must be an absolute path/u,
  );
  assert.throws(
    () => investorDemoArtifactRoot({
      environment: {},
      sourceCommit: "short",
      workspaceRoot,
    }),
    /full Git SHA/u,
  );
});

test("Investor Demo device QA derives taps from the UI tree helpers", () => {
  const qaScript = fs.readFileSync(
    new URL("./mobile-investor-demo-device-qa.ps1", import.meta.url),
    "utf8",
  );
  assert.match(qaScript, /uiautomator', 'dump', '\/dev\/tty'/u);
  assert.match(qaScript, /ui_tree_summarize\.py/u);
  assert.match(qaScript, /ui_pick\.py/u);
  assert.match(
    qaScript,
    /'shell', 'input', 'tap', \$x, \$y/u,
  );
  assert.match(qaScript, /DEVICE_UAT_BLOCKED/u);
  assert.doesNotMatch(
    qaScript,
    /'shell', 'input', 'tap', '\d+', '\d+'/u,
  );
});
