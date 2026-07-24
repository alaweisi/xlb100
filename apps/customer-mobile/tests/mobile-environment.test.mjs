import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMobileEnvironment,
  TENCENT_CLOUD_TEST_ORIGIN,
} from "../scripts/mobile-environment.mjs";

test("test profile is pinned to the Tencent Cloud HTTP origin", () => {
  assert.deepEqual(resolveMobileEnvironment("test", {}), {
    profile: "test",
    apiBaseUrl: TENCENT_CLOUD_TEST_ORIGIN,
    publicBase: "./",
  });
  assert.throws(
    () =>
      resolveMobileEnvironment("test", {
        XLB_CUSTOMER_MOBILE_API_BASE_URL: "http://example.com",
      }),
    /pinned/u,
  );
});

test("development and production profiles require an explicit HTTPS origin", () => {
  for (const profile of ["development", "production"]) {
    assert.equal(
      resolveMobileEnvironment(profile, {
        XLB_CUSTOMER_MOBILE_API_BASE_URL: "https://api.example.com",
      }).apiBaseUrl,
      "https://api.example.com",
    );
    assert.throws(() => resolveMobileEnvironment(profile, {}), /required/u);
    assert.throws(
      () =>
        resolveMobileEnvironment(profile, {
          XLB_CUSTOMER_MOBILE_API_BASE_URL: "http://api.example.com",
        }),
      /must use HTTPS/u,
    );
  }
});

test("API configuration accepts origins only", () => {
  assert.throws(
    () =>
      resolveMobileEnvironment("production", {
        XLB_CUSTOMER_MOBILE_API_BASE_URL: "https://api.example.com/api",
      }),
    /must be an origin/u,
  );
  assert.throws(
    () =>
      resolveMobileEnvironment("production", {
        XLB_CUSTOMER_MOBILE_API_BASE_URL: "https://user:pass@api.example.com",
      }),
    /must be an origin/u,
  );
});
