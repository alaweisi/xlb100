import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  toCapacitorConfig,
  validateAndroidBoundaries,
} from "@xlb/mobile-foundation";
import app from "../mobile-app.config.mjs";

const mainActivity = fs.readFileSync(
  new URL(
    "../android/app/src/main/java/com/xlb100/worker/MainActivity.java",
    import.meta.url,
  ),
  "utf8",
);
const buildGradle = fs.readFileSync(
  new URL("../android/app/build.gradle", import.meta.url),
  "utf8",
);

test("Capacitor uses bundled Worker assets and has no remote server URL", () => {
  assert.deepEqual(toCapacitorConfig(app), {
    appId: "com.xlb100.worker",
    appName: "喜乐帮师傅端",
    webDir: "dist",
    loggingBehavior: "none",
    plugins: {
      CapacitorHttp: {
        enabled: true,
      },
    },
  });
});

test("app-owned Android identity, version, permissions, and cleartext stay exact", () => {
  assert.deepEqual(validateAndroidBoundaries(app), {
    appId: "com.xlb100.worker",
    appName: "喜乐帮师傅端",
    versionCode: 1,
    versionName: "0.1.0",
    permissions: [
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.INTERNET",
    ],
    debugCleartextHosts: ["123.207.198.136"],
  });
});

test("Android back navigates WebView history before leaving Worker", () => {
  assert.match(mainActivity, /OnBackPressedCallback/u);
  assert.match(mainActivity, /window\.history\.length > 1/u);
  assert.match(mainActivity, /window\.history\.back\(\)/u);
  assert.match(mainActivity, /getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/u);
});

test("Worker release signing stays external and role-specific", () => {
  assert.match(buildGradle, /XLB_WORKER_ANDROID/u);
  assert.match(buildGradle, /mobile-foundation\/android\/release-signing\.gradle/u);
});
