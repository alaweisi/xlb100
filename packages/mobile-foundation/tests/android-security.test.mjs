import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  defineMobileApp,
  renderDebugNetworkSecurityConfig,
  validateAndroidBoundaries,
  validateBuiltApk,
  writeDebugNetworkSecurityConfig,
} from "../src/index.mjs";

function fixture(t) {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "xlb-mobile-security-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const mobileRoot = path.join(workspaceRoot, "apps", "role-mobile");
  const androidRoot = path.join(mobileRoot, "android");
  const appRoot = path.join(androidRoot, "app");
  const write = (relativePath, content) => {
    const output = path.join(appRoot, relativePath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content, "utf8");
  };
  write(
    "build.gradle",
    'applicationId "com.xlb100.role"\nversionCode 7\nversionName "2.3.4"\n',
  );
  write(
    "src/main/AndroidManifest.xml",
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
<uses-permission android:name="android.permission.INTERNET" />
<application android:allowBackup="false" android:usesCleartextTraffic="false" android:networkSecurityConfig="@xml/network_security_config" />
</manifest>
`,
  );
  write(
    "src/main/res/values/strings.xml",
    '<resources><string name="app_name">Role</string></resources>\n',
  );
  write(
    "src/main/res/xml/network_security_config.xml",
    '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />\n</network-security-config>\n',
  );
  const app = defineMobileApp({
    key: "role",
    appId: "com.xlb100.role",
    appName: "Role",
    version: { code: 7, name: "2.3.4" },
    paths: {
      workspaceRoot,
      mobileRoot,
      webRoot: path.join(workspaceRoot, "apps", "role"),
      androidRoot,
    },
    web: {
      packageName: "@xlb/role",
      outputDirectory: path.join(mobileRoot, "dist"),
      publicBase: "./",
      apiBaseBuildVariable: "VITE_API_BASE",
      appVersionBuildVariable: "VITE_APP_VERSION",
    },
    environment: {
      apiBaseUrlVariable: "XLB_ROLE_API",
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
  });
  return { app, appRoot };
}

test("debug XML generation is exact, host-only, and deny-by-default", (t) => {
  const { app } = fixture(t);
  const output = writeDebugNetworkSecurityConfig(app);
  assert.equal(
    fs.readFileSync(output, "utf8"),
    renderDebugNetworkSecurityConfig(["192.0.2.10"]),
  );
  assert.deepEqual(validateAndroidBoundaries(app).debugCleartextHosts, [
    "192.0.2.10",
  ]);
});

test("permission drift and production cleartext fail closed", (t) => {
  const { app, appRoot } = fixture(t);
  writeDebugNetworkSecurityConfig(app);
  fs.appendFileSync(
    path.join(appRoot, "src/main/AndroidManifest.xml"),
    '<uses-permission android:name="android.permission.CAMERA" />\n',
  );
  assert.throws(() => validateAndroidBoundaries(app), /permissions differ/u);

  const manifestPath = path.join(appRoot, "src/main/AndroidManifest.xml");
  fs.writeFileSync(
    manifestPath,
    fs
      .readFileSync(manifestPath, "utf8")
      .replace(
        '<uses-permission android:name="android.permission.CAMERA" />\n',
        "",
      ),
  );
  const mainNetwork = path.join(
    appRoot,
    "src/main/res/xml/network_security_config.xml",
  );
  fs.writeFileSync(
    mainNetwork,
    '<network-security-config><base-config cleartextTrafficPermitted="true" /></network-security-config>',
  );
  assert.throws(
    () => validateAndroidBoundaries(app),
    /production network security config must not allow cleartext/u,
  );
});

test("final APK validation checks merged identity, version, permissions, and cleartext", (t) => {
  const { app } = fixture(t);
  const badging = `package: name='com.xlb100.role' versionCode='7' versionName='2.3.4'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='com.xlb100.role.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
application-label:'Role'
`;
  const manifestTree = `A: android:allowBackup(0x01010280)=(type 0x12)0x0
A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0
A: android:networkSecurityConfig(0x01010527)=@0x7f100002
`;
  const spawn = (_command, args) => ({
    status: 0,
    stdout: args.includes("badging") ? badging : manifestTree,
  });
  assert.deepEqual(
    validateBuiltApk(app, "fixture.apk", {
      androidSdk: "fixture-sdk",
      exists: () => true,
      findBuildTool: () => "aapt",
      spawn,
    }),
    {
      apkPath: path.resolve("fixture.apk"),
      appId: "com.xlb100.role",
      appName: "Role",
      versionCode: 7,
      versionName: "2.3.4",
      permissions: ["android.permission.INTERNET"],
      generatedPermissions: [
        "com.xlb100.role.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
      ],
    },
  );
});

test("release APK validation requires a non-debug signer certificate", (t) => {
  const { app } = fixture(t);
  const badging = `package: name='com.xlb100.role' versionCode='7' versionName='2.3.4'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='com.xlb100.role.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
application-label:'Role'
`;
  const manifestTree = `A: android:allowBackup(0x01010280)=(type 0x12)0x0
A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0
A: android:networkSecurityConfig(0x01010527)=@0x7f100002
`;
  const releaseCertificate = `Verifies
Number of signers: 1
V3 Signer: certificate DN: CN=XLB Customer RC, O=XLB, C=CN
V3 Signer: certificate SHA-256 digest: 11:22:aa:bb
V3 Signer: public key SHA-256 digest: 55:66:cc:dd
`.replaceAll("\n", "\r\n");
  const spawn = (command, args) => ({
    status: 0,
    stdout: command === "apksigner"
      ? releaseCertificate
      : args.includes("badging")
        ? badging
        : manifestTree,
    stderr: "",
  });
  assert.deepEqual(
    validateBuiltApk(app, "fixture-release.apk", {
      androidSdk: "fixture-sdk",
      variant: "release",
      exists: () => true,
      findBuildTool: (_sdk, name) => name,
      spawn,
    }),
    {
      apkPath: path.resolve("fixture-release.apk"),
      appId: "com.xlb100.role",
      appName: "Role",
      versionCode: 7,
      versionName: "2.3.4",
      permissions: ["android.permission.INTERNET"],
      generatedPermissions: [
        "com.xlb100.role.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
      ],
      certificateDn: "CN=XLB Customer RC, O=XLB, C=CN",
      certificateSha256: "1122AABB",
      publicKeySha256: "5566CCDD",
    },
  );

  const debugSpawn = (command, args) => ({
    status: 0,
    stdout: command === "apksigner"
      ? `Number of signers: 1
Signer #1 certificate DN: CN=Android Debug, O=Android, C=US
Signer #1 certificate SHA-256 digest: 00:11
Signer #1 public key SHA-256 digest: 22:33
`
      : args.includes("badging")
        ? badging
        : manifestTree,
    stderr: "",
  });
  assert.throws(
    () => validateBuiltApk(app, "fixture-release.apk", {
      androidSdk: "fixture-sdk",
      variant: "release",
      exists: () => true,
      findBuildTool: (_sdk, name) => name,
      spawn: debugSpawn,
    }),
    /must not use an Android Debug certificate/u,
  );
});
