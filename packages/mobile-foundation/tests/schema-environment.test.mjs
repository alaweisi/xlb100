import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createWebBuildPlan,
  defineMobileApp,
  resolveMobileEnvironment,
  toCapacitorConfig,
} from "../src/index.mjs";

function descriptor(overrides = {}) {
  const workspaceRoot = path.join(os.tmpdir(), "xlb-mobile-foundation-fixture");
  const mobileRoot = path.join(workspaceRoot, "apps", "role-mobile");
  return {
    key: "role",
    appId: "com.xlb100.role",
    appName: "Role",
    version: { code: 3, name: "1.2.3" },
    paths: {
      workspaceRoot,
      mobileRoot,
      webRoot: path.join(workspaceRoot, "apps", "role"),
      androidRoot: path.join(mobileRoot, "android"),
    },
    web: {
      packageName: "@xlb/role",
      outputDirectory: path.join(mobileRoot, "dist"),
      publicBase: "./",
      apiBaseBuildVariable: "VITE_API_BASE",
      appVersionBuildVariable: "VITE_APP_VERSION",
    },
    environment: {
      apiBaseUrlVariable: "XLB_ROLE_MOBILE_API_BASE_URL",
      profiles: {
        development: { source: "environment", requireHttps: true },
        test: {
          source: "fixed",
          apiBaseUrl: "http://192.0.2.10",
          requireHttps: false,
        },
        production: { source: "environment", requireHttps: true },
      },
    },
    android: {
      permissions: ["android.permission.INTERNET"],
      debugCleartextHosts: ["192.0.2.10"],
    },
    ...overrides,
  };
}

test("descriptor becomes immutable and derives a bundled Capacitor config", () => {
  const app = defineMobileApp(descriptor());
  assert.deepEqual(toCapacitorConfig(app), {
    appId: "com.xlb100.role",
    appName: "Role",
    webDir: "dist",
  });
  assert.throws(() => {
    app.version.name = "9.9.9";
  }, TypeError);
});

test("schema requires production HTTPS and exact app-owned HTTP debug hosts", () => {
  const insecureProduction = descriptor();
  insecureProduction.environment.profiles.production.requireHttps = false;
  assert.throws(
    () => defineMobileApp(insecureProduction),
    /production .*require HTTPS/u,
  );

  const broadCleartext = descriptor();
  broadCleartext.android.debugCleartextHosts.push("example.com");
  assert.throws(
    () => defineMobileApp(broadCleartext),
    /exactly match fixed HTTP profile hosts/u,
  );
});

test("profiles resolve fixed test and explicit HTTPS environment origins", () => {
  const app = defineMobileApp(descriptor());
  assert.deepEqual(resolveMobileEnvironment(app, "test", {}), {
    profile: "test",
    apiBaseUrl: "http://192.0.2.10",
    publicBase: "./",
  });
  assert.throws(
    () =>
      resolveMobileEnvironment(app, "test", {
        XLB_ROLE_MOBILE_API_BASE_URL: "http://192.0.2.11",
      }),
    /pinned/u,
  );
  assert.equal(
    resolveMobileEnvironment(app, "production", {
      XLB_ROLE_MOBILE_API_BASE_URL: "https://api.example.com",
    }).apiBaseUrl,
    "https://api.example.com",
  );
});

test("web plan preserves source app while forcing relative mobile assets", () => {
  const app = defineMobileApp(descriptor());
  const plan = createWebBuildPlan(app, "test", {});
  assert.deepEqual(plan.dependencyBuild.args, [
    "--filter",
    "@xlb/role^...",
    "build",
  ]);
  assert.equal(plan.webBuild.cwd, app.paths.webRoot);
  assert.deepEqual(plan.webBuild.args.slice(-5), [
    "--base",
    "./",
    "--outDir",
    app.web.outputDirectory,
    "--emptyOutDir",
  ]);
  assert.equal(plan.webBuild.environment.VITE_API_BASE, "http://192.0.2.10");
  assert.equal(plan.webBuild.environment.VITE_APP_VERSION, "1.2.3");
});
