import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mobileRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");
}

test("Capacitor uses bundled Customer assets and has no remote server URL", () => {
  const config = read("capacitor.config.ts");
  assert.match(config, /appId: "com\.xlb100\.customer"/u);
  assert.match(config, /appName: "喜乐帮到家"/u);
  assert.match(config, /webDir: "dist"/u);
  assert.doesNotMatch(config, /\bserver\s*:/u);
});

test("Android identity and foundation version are explicit", () => {
  const build = read("android/app/build.gradle");
  const strings = read("android/app/src/main/res/values/strings.xml");
  assert.match(build, /applicationId "com\.xlb100\.customer"/u);
  assert.match(build, /versionCode 1/u);
  assert.match(build, /versionName "0\.1\.0"/u);
  assert.match(strings, /<string name="app_name">喜乐帮到家<\/string>/u);
});

test("Android permissions stay inside the M0 network and foreground-location boundary", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const permissions = [
    ...manifest.matchAll(/<uses-permission android:name="([^"]+)" \/>/gu),
  ].map((match) => match[1]).sort();

  assert.deepEqual(permissions, [
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.INTERNET",
  ]);
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(
    manifest,
    /android:networkSecurityConfig="@xml\/network_security_config"/u,
  );
  assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/u);
});

test("only debug permits HTTP and only for the Tencent Cloud test host", () => {
  const mainConfig = read(
    "android/app/src/main/res/xml/network_security_config.xml",
  );
  const debugConfig = read(
    "android/app/src/debug/res/xml/network_security_config.xml",
  );

  assert.doesNotMatch(mainConfig, /cleartextTrafficPermitted="true"/u);
  assert.match(debugConfig, /<base-config cleartextTrafficPermitted="false" \/>/u);
  assert.equal(
    (debugConfig.match(/cleartextTrafficPermitted="true"/gu) ?? []).length,
    1,
  );
  assert.equal(
    (debugConfig.match(/<domain /gu) ?? []).length,
    1,
  );
  assert.match(
    debugConfig,
    /<domain includeSubdomains="false">123\.207\.198\.136<\/domain>/u,
  );
});
