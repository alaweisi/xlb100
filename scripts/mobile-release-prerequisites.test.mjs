import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertMobileReleasePrerequisites,
  mobileReleaseApps,
  mobileSigningPrefix,
} from "./mobile-release-prerequisites.mjs";
import {
  createMobileSimulationSigning,
  removeMobileSimulationSigning,
} from "./create-mobile-simulation-signing.mjs";

function completeEnvironment(root) {
  const environment = { XLB_MOBILE_SIGNING_CLASS: "simulation" };
  for (const app of mobileReleaseApps) {
    const prefix = mobileSigningPrefix(app);
    environment[app.environment.apiBaseUrlVariable] =
      `https://${app.key}.engineering-rc.invalid`;
    environment[`${prefix}_KEYSTORE_PATH`] =
      path.join(root, `${app.key}.jks`);
    environment[`${prefix}_STORE_PASSWORD`] = "fixture-store-password";
    environment[`${prefix}_KEY_ALIAS`] = `${app.key}-fixture`;
    environment[`${prefix}_KEY_PASSWORD`] = "fixture-key-password";
  }
  return environment;
}

test("mobile release preflight is explicit, complete, and secret-safe", () => {
  const root = path.resolve("fixture-signing");
  const environment = completeEnvironment(root);
  const report = assertMobileReleasePrerequisites({
    environment,
    exists: () => true,
    probe: () => ({ javaMajor: 21, androidApi: 36 }),
  });
  assert.equal(report.signingClass, "simulation");
  assert.deepEqual(
    report.reports.map((entry) => entry.role),
    ["customer", "worker", "admin"],
  );

  const missingName = "XLB_WORKER_ANDROID_STORE_PASSWORD";
  const secret = environment[missingName];
  delete environment[missingName];
  assert.throws(
    () => assertMobileReleasePrerequisites({
      environment,
      exists: () => true,
      probe: () => ({ javaMajor: 21, androidApi: 36 }),
    }),
    (error) => error.message.includes(missingName)
      && !error.message.includes(secret),
  );
});

test("engineering RC creates and safely removes three ephemeral simulation identities", (t) => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "xlb-signing-test-parent-"),
  );
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const generated = createMobileSimulationSigning({
    environment: {},
    platform: "win32",
    temporaryRoot,
    resolveJava: () => path.resolve("fixture-jdk"),
    spawn: (_command, args) => {
      const keystorePath = args[args.indexOf("-keystore") + 1];
      fs.writeFileSync(keystorePath, "simulation");
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(generated.environment.XLB_MOBILE_SIGNING_CLASS, "simulation");
  for (const app of mobileReleaseApps) {
    const prefix = mobileSigningPrefix(app);
    assert.equal(
      fs.existsSync(generated.environment[`${prefix}_KEYSTORE_PATH`]),
      true,
    );
    assert.match(
      generated.environment[app.environment.apiBaseUrlVariable],
      /\.engineering-rc\.invalid$/u,
    );
  }
  removeMobileSimulationSigning(generated.signingRoot, temporaryRoot);
  assert.equal(fs.existsSync(generated.signingRoot), false);
  assert.throws(
    () => removeMobileSimulationSigning(temporaryRoot, temporaryRoot),
    /unsafe simulation signing directory/u,
  );
});
