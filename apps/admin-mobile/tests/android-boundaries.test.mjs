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
    "../android/app/src/main/java/com/xlb100/admin/MainActivity.java",
    import.meta.url,
  ),
  "utf8",
);
const buildGradle = fs.readFileSync(
  new URL("../android/app/build.gradle", import.meta.url),
  "utf8",
);

test("Capacitor uses bundled Admin assets and has no remote server URL", () => {
  assert.deepEqual(toCapacitorConfig(app), {
    appId: "com.xlb100.admin",
    appName: "喜乐帮 · A端",
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
    appId: "com.xlb100.admin",
    appName: "喜乐帮 · A端",
    versionCode: 1,
    versionName: "0.1.0",
    permissions: [
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.INTERNET",
    ],
    debugCleartextHosts: ["123.207.198.136"],
  });
});

test("Android back navigates WebView history before leaving Admin", () => {
  assert.match(mainActivity, /OnBackPressedCallback/u);
  assert.match(mainActivity, /window\.history\.length > 1/u);
  assert.match(mainActivity, /window\.history\.back\(\)/u);
  assert.match(mainActivity, /getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/u);
});

test("Admin release signing stays external and role-specific", () => {
  assert.match(buildGradle, /XLB_ADMIN_ANDROID/u);
  assert.match(buildGradle, /mobile-foundation\/android\/release-signing\.gradle/u);
  assert.match(buildGradle, /XLB_ADMIN_ANDROID_DEMO/u);
  assert.match(buildGradle, /investor-demo-signing\.gradle/u);
  assert.match(buildGradle, /applicationIdSuffix "\.demo"/u);
  assert.match(buildGradle, /versionCode\.set\(2\)/u);
  assert.match(buildGradle, /喜乐帮管理演示/u);
});
