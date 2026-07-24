import assert from "node:assert/strict";
import test from "node:test";
import {
  toCapacitorConfig,
  validateAndroidBoundaries,
} from "@xlb/mobile-foundation";
import app from "../mobile-app.config.mjs";

test("Capacitor uses bundled Customer assets and has no remote server URL", () => {
  assert.deepEqual(toCapacitorConfig(app), {
    appId: "com.xlb100.customer",
    appName: "喜乐帮到家",
    webDir: "dist",
  });
});

test("app-owned Android identity, version, permissions, and cleartext stay exact", () => {
  assert.deepEqual(validateAndroidBoundaries(app), {
    appId: "com.xlb100.customer",
    appName: "喜乐帮到家",
    versionCode: 1,
    versionName: "0.1.0",
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.INTERNET",
    ],
    debugCleartextHosts: ["123.207.198.136"],
  });
});
