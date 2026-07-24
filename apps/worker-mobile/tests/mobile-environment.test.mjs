import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebBuildPlan,
  resolveMobileEnvironment,
} from "@xlb/mobile-foundation";
import app, {
  TENCENT_CLOUD_TEST_ORIGIN,
} from "../mobile-app.config.mjs";

test("test profile is pinned to the Tencent Cloud HTTP origin", () => {
  assert.deepEqual(resolveMobileEnvironment(app, "test", {}), {
    profile: "test",
    apiBaseUrl: TENCENT_CLOUD_TEST_ORIGIN,
    publicBase: "./",
  });
  assert.throws(
    () =>
      resolveMobileEnvironment(app, "test", {
        XLB_WORKER_MOBILE_API_BASE_URL: "http://example.com",
      }),
    /pinned/u,
  );
});

test("development and production profiles require an explicit HTTPS origin", () => {
  for (const profile of ["development", "production"]) {
    assert.equal(
      resolveMobileEnvironment(app, profile, {
        XLB_WORKER_MOBILE_API_BASE_URL: "https://api.example.com",
      }).apiBaseUrl,
      "https://api.example.com",
    );
    assert.throws(
      () => resolveMobileEnvironment(app, profile, {}),
      /required/u,
    );
    assert.throws(
      () =>
        resolveMobileEnvironment(app, profile, {
          XLB_WORKER_MOBILE_API_BASE_URL: "http://api.example.com",
        }),
      /must use HTTPS/u,
    );
  }
});

test("API configuration accepts origins only", () => {
  assert.throws(
    () =>
      resolveMobileEnvironment(app, "production", {
        XLB_WORKER_MOBILE_API_BASE_URL: "https://api.example.com/api",
      }),
    /must be an origin/u,
  );
  assert.throws(
    () =>
      resolveMobileEnvironment(app, "production", {
        XLB_WORKER_MOBILE_API_BASE_URL: "https://user:pass@api.example.com",
      }),
    /must be an origin/u,
  );
});

test("Worker mobile web plan uses the existing API variable and relative assets", () => {
  const plan = createWebBuildPlan(app, "test", {});

  assert.equal(plan.environment.publicBase, "./");
  assert.equal(plan.webBuild.environment.VITE_API_BASE, TENCENT_CLOUD_TEST_ORIGIN);
  assert.equal(plan.webBuild.environment.VITE_APP_VERSION, "0.1.0");
  assert.deepEqual(plan.dependencyBuild.args, [
    "--filter",
    "@xlb/worker^...",
    "build",
  ]);
  assert.deepEqual(plan.webBuild.args.slice(-5), [
    "--base",
    "./",
    "--outDir",
    app.web.outputDirectory,
    "--emptyOutDir",
  ]);
});
