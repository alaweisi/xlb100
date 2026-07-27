import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  expectedApkPath,
  probeAndroidToolchain,
  resolveMobileEnvironment,
  validateBuiltApk,
} from "../packages/mobile-foundation/src/index.mjs";
import {
  assertMobileReleasePrerequisites,
  mobileReleaseApps,
} from "./mobile-release-prerequisites.mjs";

const apps = mobileReleaseApps;
const packageManagerEntry = process.env.npm_execpath;
if (!packageManagerEntry) {
  throw new Error("Run the M5 release gate through pnpm");
}
const prerequisites = assertMobileReleasePrerequisites();

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
    environment: process.env,
    javaHome: toolchain.javaHome,
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
if (
  prerequisites.signingClass === "simulation"
  && reports.some((report) =>
    !String(report.certificateDn ?? "").toLowerCase().includes(
      `CN=XLB ${report.role} Engineering RC Simulation`.toLowerCase(),
    ))
) {
  throw new Error(
    "simulation RC APKs must use the role-bound Engineering RC Simulation certificate",
  );
}

const sourceCommitResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: apps[0].paths.workspaceRoot,
  encoding: "utf8",
  windowsHide: true,
});
if (sourceCommitResult.error) throw sourceCommitResult.error;
if (sourceCommitResult.status !== 0) {
  throw new Error("cannot bind mobile M5 evidence to the source commit");
}
const payload = {
  releaseCandidate: true,
  published: false,
  signingClass: prerequisites.signingClass,
  sourceCommit: sourceCommitResult.stdout.trim(),
  toolchains: prerequisites.reports,
  reports,
};
const artifactsRoot = path.join(apps[0].paths.workspaceRoot, ".artifacts");
const requestedEvidencePath = process.env.XLB_MOBILE_M5_EVIDENCE_PATH?.trim();
const evidencePath = requestedEvidencePath
  ? path.resolve(requestedEvidencePath)
  : path.join(
    artifactsRoot,
    "mobile-m5",
    `release-${new Date().toISOString().replaceAll(/[:.]/gu, "-")}.json`,
  );
const relativeEvidencePath = path.relative(artifactsRoot, evidencePath);
if (
  relativeEvidencePath === ""
  || relativeEvidencePath === ".."
  || relativeEvidencePath.startsWith(`..${path.sep}`)
  || path.isAbsolute(relativeEvidencePath)
) {
  throw new Error("mobile M5 evidence path must stay inside .artifacts");
}
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));
console.log(`MOBILE_M5_EVIDENCE=${evidencePath}`);
