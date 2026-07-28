import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildWebAssets,
  normalizeHttpOrigin,
  probeAndroidToolchain,
  runGradleTask,
  syncCapacitorAndroid,
  validateBuiltApk,
} from "../packages/mobile-foundation/src/index.mjs";
import { mobileReleaseApps } from "./mobile-release-prerequisites.mjs";

export const INVESTOR_DEMO_API_ORIGIN = "https://123.207.198.136";
export const INVESTOR_DEMO_VERSION = Object.freeze({
  code: 2,
  name: "0.2.0-investor-demo",
});
export const INVESTOR_DEMO_SESSION_TTL_SECONDS = 1_800;

const demoIdentityByRole = Object.freeze({
  customer: Object.freeze({
    appId: "com.xlb100.customer.demo",
    appName: "喜乐帮客户演示",
  }),
  worker: Object.freeze({
    appId: "com.xlb100.worker.demo",
    appName: "喜乐帮师傅演示",
  }),
  admin: Object.freeze({
    appId: "com.xlb100.admin.demo",
    appName: "喜乐帮管理演示",
  }),
});

export function investorDemoSigningPrefix(app) {
  return `XLB_${app.key.toUpperCase().replaceAll("-", "_")}_ANDROID_DEMO`;
}

export function requiredInvestorDemoEnvironmentNames(apps = mobileReleaseApps) {
  return apps.flatMap((app) => {
    const prefix = investorDemoSigningPrefix(app);
    return [
      `${prefix}_KEYSTORE_PATH`,
      `${prefix}_STORE_PASSWORD`,
      `${prefix}_KEY_ALIAS`,
      `${prefix}_KEY_PASSWORD`,
    ];
  });
}

export function investorDemoApp(app) {
  const identity = demoIdentityByRole[app.key];
  if (!identity) throw new Error(`Unsupported Investor Demo role: ${app.key}`);
  return Object.freeze({
    ...app,
    ...identity,
    version: INVESTOR_DEMO_VERSION,
  });
}

export function investorDemoArtifactRoot({
  environment = process.env,
  sourceCommit,
  workspaceRoot,
}) {
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit ?? "")) {
    throw new Error("Investor Demo artifact source commit must be a full Git SHA");
  }
  const configuredBase = environment.XLB_INVESTOR_DEMO_ARTIFACT_BASE?.trim();
  if (configuredBase && !path.isAbsolute(configuredBase)) {
    throw new Error("XLB_INVESTOR_DEMO_ARTIFACT_BASE must be an absolute path");
  }
  const artifactBase = configuredBase
    ? path.resolve(configuredBase)
    : path.join(workspaceRoot, ".artifacts", "investor-demo-rc");
  return path.join(artifactBase, sourceCommit);
}

function pathIsInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

export function assertInvestorDemoPrerequisites({
  environment = process.env,
  apps = mobileReleaseApps,
  exists = fs.existsSync,
} = {}) {
  const requestedOrigin = normalizeHttpOrigin(
    environment.XLB_INVESTOR_DEMO_API_ORIGIN ?? INVESTOR_DEMO_API_ORIGIN,
    "XLB_INVESTOR_DEMO_API_ORIGIN",
  );
  if (requestedOrigin !== INVESTOR_DEMO_API_ORIGIN) {
    throw new Error(
      `Investor Demo API origin is pinned to Tencent Staging ${INVESTOR_DEMO_API_ORIGIN}`,
    );
  }
  if (/engineering-rc\.invalid$/iu.test(new URL(requestedOrigin).hostname)) {
    throw new Error("Investor Demo must never use an Engineering RC placeholder origin");
  }

  for (const app of apps) {
    const configuredRoleOrigin = environment[app.environment.apiBaseUrlVariable];
    if (
      configuredRoleOrigin
      && normalizeHttpOrigin(
        configuredRoleOrigin,
        app.environment.apiBaseUrlVariable,
      ) !== requestedOrigin
    ) {
      throw new Error(
        `${app.environment.apiBaseUrlVariable} must match ${requestedOrigin} for Investor Demo`,
      );
    }
  }

  const missing = requiredInvestorDemoEnvironmentNames(apps).filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Investor Demo signing environment is incomplete; missing: ${missing.join(", ")}`,
    );
  }

  const keystorePaths = new Set();
  for (const app of apps) {
    const prefix = investorDemoSigningPrefix(app);
    const keystoreVariable = `${prefix}_KEYSTORE_PATH`;
    const keystorePath = path.resolve(environment[keystoreVariable]);
    if (!exists(keystorePath)) {
      throw new Error(`${keystoreVariable} does not name an existing file`);
    }
    if (pathIsInside(app.paths.workspaceRoot, keystorePath)) {
      throw new Error("Investor Demo keystores must remain outside the XLB workspace");
    }
    const normalized = keystorePath.toLowerCase();
    if (keystorePaths.has(normalized)) {
      throw new Error("each Investor Demo app must use a distinct signing keystore");
    }
    keystorePaths.add(normalized);
  }

  return Object.freeze({
    apiOrigin: requestedOrigin,
    published: false,
  });
}

function git(workspaceRoot, args) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function ensureCleanSource(workspaceRoot) {
  const dirty = git(workspaceRoot, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    throw new Error(
      "Investor Demo release requires a clean tracked worktree so the APK can be bound to one source commit",
    );
  }
  return git(workspaceRoot, ["rev-parse", "HEAD"]);
}

function containsText(root, expected) {
  return fs.readdirSync(root, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return containsText(entryPath, expected);
    if (!entry.isFile() || !/\.(?:html|js|json)$/u.test(entry.name)) return false;
    return fs.readFileSync(entryPath, "utf8").includes(expected);
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function writeSealedFile(filePath, bytes) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath);
    if (!existing.equals(bytes)) {
      throw new Error(`refusing to overwrite different sealed artifact: ${filePath}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
}

function expectedInvestorDemoApkPath(app) {
  return path.join(
    app.paths.androidRoot,
    "app",
    "build",
    "outputs",
    "apk",
    "investorDemo",
    "app-investorDemo.apk",
  );
}

export function runInvestorDemoRelease() {
  const packageManagerEntry = process.env.npm_execpath;
  if (!packageManagerEntry) {
    throw new Error("Run the Investor Demo release through pnpm");
  }
  const prerequisites = assertInvestorDemoPrerequisites();
  const workspaceRoot = mobileReleaseApps[0].paths.workspaceRoot;
  const sourceCommit = ensureCleanSource(workspaceRoot);
  const reports = [];

  for (const app of mobileReleaseApps) {
    const demoApp = investorDemoApp(app);
    const environment = {
      ...process.env,
      [app.environment.apiBaseUrlVariable]: prerequisites.apiOrigin,
      VITE_MOBILE_BUILD_PROFILE: "investor-demo",
      VITE_MOBILE_SOURCE_COMMIT: sourceCommit,
      VITE_MOBILE_API_ORIGIN: prerequisites.apiOrigin,
      VITE_APP_VERSION: INVESTOR_DEMO_VERSION.name,
      VITE_DEMO_SESSION_TTL_SECONDS: String(INVESTOR_DEMO_SESSION_TTL_SECONDS),
    };
    buildWebAssets(demoApp, "production", { environment });
    syncCapacitorAndroid(app, { environment });
    const toolchain = runGradleTask(app, "assembleInvestorDemo", { environment });
    const apkPath = expectedInvestorDemoApkPath(app);
    const apk = validateBuiltApk(demoApp, apkPath, {
      androidSdk: toolchain.androidSdk,
      variant: "release",
      environment,
      javaHome: toolchain.javaHome,
    });
    if (!containsText(app.web.outputDirectory, prerequisites.apiOrigin)) {
      throw new Error(
        `${app.key} Investor Demo bundle does not contain ${prerequisites.apiOrigin}`,
      );
    }
    if (!containsText(app.web.outputDirectory, sourceCommit)) {
      throw new Error(
        `${app.key} Investor Demo bundle does not contain source commit ${sourceCommit}`,
      );
    }
    const bytes = fs.readFileSync(apkPath);
    reports.push(Object.freeze({
      role: app.key,
      appId: apk.appId,
      appName: apk.appName,
      versionCode: apk.versionCode,
      versionName: apk.versionName,
      apiOrigin: prerequisites.apiOrigin,
      sourceCommit,
      apkPath: apk.apkPath,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      certificateDn: apk.certificateDn,
      certificateSha256: apk.certificateSha256,
      publicKeySha256: apk.publicKeySha256,
      published: false,
    }));
  }

  const certificateFingerprints = new Set(
    reports.map((report) => report.certificateSha256),
  );
  const publicKeyFingerprints = new Set(
    reports.map((report) => report.publicKeySha256),
  );
  if (
    certificateFingerprints.has(undefined)
    || certificateFingerprints.size !== reports.length
    || publicKeyFingerprints.has(undefined)
    || publicKeyFingerprints.size !== reports.length
  ) {
    throw new Error(
      "Customer, Worker and Admin Investor Demo signing identities must be distinct",
    );
  }

  const artifactRoot = investorDemoArtifactRoot({
    environment: process.env,
    sourceCommit,
    workspaceRoot,
  });
  const sealedReports = reports.map((report) => {
    const targetApk = path.join(
      artifactRoot,
      `xlb-${report.role}-investor-demo-v${report.versionCode}.apk`,
    );
    writeSealedFile(targetApk, fs.readFileSync(report.apkPath));
    return Object.freeze({ ...report, apkPath: targetApk });
  });
  const manifest = Object.freeze({
    profile: "investor-demo",
    releaseCandidate: true,
    published: false,
    sourceCommit,
    apiOrigin: prerequisites.apiOrigin,
    artifactRoot,
    reports: sealedReports,
  });
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeSealedFile(path.join(artifactRoot, "manifest.json"), manifestBytes);
  const checksums = sealedReports
    .map((report) => `${report.sha256}  ${path.basename(report.apkPath)}`)
    .join("\n");
  writeSealedFile(
    path.join(artifactRoot, "checksums.sha256"),
    Buffer.from(`${checksums}\n`, "utf8"),
  );
  const signingVerification = Object.freeze({
    sourceCommit,
    verifiedWith: "apksigner verify --verbose --print-certs",
    signerPolicy: "exactly-one-current-signer-per-apk",
    distinctCertificates: true,
    distinctPublicKeys: true,
    reports: sealedReports.map((report) => Object.freeze({
      role: report.role,
      appId: report.appId,
      apk: path.basename(report.apkPath),
      signatureValid: true,
      certificateDn: report.certificateDn,
      certificateSha256: report.certificateSha256,
      publicKeySha256: report.publicKeySha256,
    })),
  });
  writeSealedFile(
    path.join(artifactRoot, "signing-verification.json"),
    Buffer.from(`${JSON.stringify(signingVerification, null, 2)}\n`, "utf8"),
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`INVESTOR_DEMO_ARTIFACT_ROOT=${artifactRoot}\n`);
  return manifest;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) runInvestorDemoRelease();
