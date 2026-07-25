import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  expectedApkPath,
  probeAndroidToolchain,
  resolveMobileEnvironment,
  validateBuiltApk,
} from "../packages/mobile-foundation/src/index.mjs";
import customer from "../apps/customer-mobile/mobile-app.config.mjs";
import worker from "../apps/worker-mobile/mobile-app.config.mjs";
import admin from "../apps/admin-mobile/mobile-app.config.mjs";

const apps = [customer, worker, admin];
const packageManagerEntry = process.env.npm_execpath;
if (!packageManagerEntry) {
  throw new Error("Run the M5 release gate through pnpm");
}

function signingPrefix(app) {
  return `XLB_${app.key.toUpperCase().replaceAll("-", "_")}_ANDROID`;
}

const requiredEnvironment = apps.flatMap((app) => {
  const prefix = signingPrefix(app);
  return [
    app.environment.apiBaseUrlVariable,
    `${prefix}_KEYSTORE_PATH`,
    `${prefix}_STORE_PASSWORD`,
    `${prefix}_KEY_ALIAS`,
    `${prefix}_KEY_PASSWORD`,
  ];
});
const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name]?.trim(),
);
if (missingEnvironment.length > 0) {
  throw new Error(
    `M5 release environment is incomplete; missing: ${missingEnvironment.join(", ")}`,
  );
}

for (const app of apps) {
  const result = spawnSync(
    process.execPath,
    [
      packageManagerEntry,
      "--filter",
      `@xlb/${app.key}-mobile`,
      "build:release",
    ],
    {
      cwd: app.paths.workspaceRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${app.key} release build failed with exit code ${result.status ?? 1}`);
  }
}

function containsText(root, expected) {
  return fs.readdirSync(root, { withFileTypes: true }).some((entry) => {
    const entryPath = `${root}/${entry.name}`;
    if (entry.isDirectory()) return containsText(entryPath, expected);
    if (!entry.isFile() || !/\.(?:html|js|json)$/u.test(entry.name)) return false;
    return fs.readFileSync(entryPath, "utf8").includes(expected);
  });
}

for (const app of apps) {
  const { apiBaseUrl } = resolveMobileEnvironment(app, "production");
  if (!containsText(app.web.outputDirectory, apiBaseUrl)) {
    throw new Error(
      `${app.key} release bundle does not contain the approved API origin ${apiBaseUrl}`,
    );
  }
}

const reports = apps.map((app) => {
  const toolchain = probeAndroidToolchain(app);
  const apkPath = expectedApkPath(app, "release");
  const apk = validateBuiltApk(app, apkPath, {
    androidSdk: toolchain.androidSdk,
    variant: "release",
  });
  const bytes = fs.readFileSync(apkPath);
  const { apiBaseUrl } = resolveMobileEnvironment(app, "production");
  return Object.freeze({
    role: app.key,
    appId: apk.appId,
    appName: apk.appName,
    versionCode: apk.versionCode,
    versionName: apk.versionName,
    apiBaseUrl,
    apkPath: apk.apkPath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    certificateDn: apk.certificateDn,
    certificateSha256: apk.certificateSha256,
    publicKeySha256: apk.publicKeySha256,
  });
});

const certificateFingerprints = new Set(
  reports.map((report) => report.certificateSha256),
);
if (
  certificateFingerprints.has(undefined) ||
  certificateFingerprints.size !== reports.length
) {
  throw new Error("Customer, Worker and Admin release certificates must be distinct");
}
const publicKeyFingerprints = new Set(
  reports.map((report) => report.publicKeySha256),
);
if (
  publicKeyFingerprints.has(undefined) ||
  publicKeyFingerprints.size !== reports.length
) {
  throw new Error("Customer, Worker and Admin release public keys must be distinct");
}

console.log(JSON.stringify({
  releaseCandidate: true,
  published: false,
  reports,
}, null, 2));
