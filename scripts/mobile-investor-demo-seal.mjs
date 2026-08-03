import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { verifyInvestorDemoArtifactRoot } from "./mobile-investor-demo-artifact-trust.mjs";

const sharedDemoAccounts = JSON.parse(fs.readFileSync(
  new URL("../packages/types/src/investorDemoIdentities.json", import.meta.url),
  "utf8",
));

export const INVESTOR_DEMO_SEAL_DOCUMENTS = Object.freeze([
  "INSTALLATION.md",
  "DEMO_ACCOUNTS.md",
  "DEMO_SCRIPT.md",
  "DEMO_RESET.md",
  "KNOWN_SCOPE.md",
  "SIMULATION_NOTICE.md",
  "QA_EVIDENCE.md",
]);

export const INVESTOR_DEMO_SEAL_EVIDENCE = Object.freeze([
  "manifest.json",
  "checksums.sha256",
  "signing-verification.json",
  "independent-apk-verification.json",
  "SECURITY_SCAN.json",
  "FILE_INVENTORY.json",
  "HASH_RECHECK.json",
  "RELEASE_STATUS.json",
  "network-443.json",
  "qa/qa-index.json",
]);

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function requireNonemptyFile(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || fs.statSync(filePath).size === 0) {
    throw new Error(`Investor Demo seal evidence is missing: ${relativePath}`);
  }
}

function currentGitCommit(workspaceRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("unable to resolve current source commit");
  return result.stdout.trim();
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
  ].filter(Boolean);
  const sdk = candidates.find((candidate) => fs.existsSync(path.join(candidate, "build-tools")));
  if (!sdk) throw new Error("Android SDK was not found for final seal verification");
  return sdk;
}

function runtimeIsClean(runtimeChecks) {
  const sensitive = runtimeChecks?.sensitiveLogMatches ?? {};
  return [
    runtimeChecks?.crashLines,
    runtimeChecks?.anrLines,
    runtimeChecks?.cleartextViolations,
    runtimeChecks?.tlsFailures,
    sensitive.bearer,
    sensitive.fullPhone,
    sensitive.otp,
  ].every((value) => value === 0);
}

export function validateInvestorDemoSeal({
  artifactRoot,
  currentCommit,
  androidSdk,
  artifactVerifier = verifyInvestorDemoArtifactRoot,
}) {
  const root = fs.realpathSync(path.resolve(artifactRoot));
  for (const relativePath of [...INVESTOR_DEMO_SEAL_DOCUMENTS, ...INVESTOR_DEMO_SEAL_EVIDENCE]) {
    requireNonemptyFile(root, relativePath);
  }
  const manifest = readJson(root, "manifest.json");
  if (
    manifest.releaseCandidate !== true
    || manifest.sealed !== false
    || manifest.dispatchable !== false
    || manifest.releaseDecision !== "INVESTOR_APK_HOLD"
    || manifest.published !== false
  ) {
    throw new Error("only an unpublished HOLD release candidate can enter final seal");
  }
  if (
    !/^[0-9a-f]{40}$/u.test(currentCommit ?? "")
    || manifest.sourceCommit !== currentCommit
    || path.basename(root) !== currentCommit
  ) {
    throw new Error("Investor Demo candidate source commit binding is invalid");
  }
  if (!Number.isInteger(manifest.sessionTtlSeconds) || manifest.sessionTtlSeconds > 1_800) {
    throw new Error("Investor Demo short session TTL is missing or too long");
  }
  if (!isDeepStrictEqual(manifest.demoAccounts, sharedDemoAccounts)) {
    throw new Error("Investor Demo account manifest does not match the shared identity contract");
  }
  const accountDocument = fs.readFileSync(path.join(root, "DEMO_ACCOUNTS.md"), "utf8");
  const publicAccountIdentifiers = [
    sharedDemoAccounts.cityCode,
    sharedDemoAccounts.customer.id,
    sharedDemoAccounts.customer.phone,
    sharedDemoAccounts.worker.id,
    sharedDemoAccounts.worker.phone,
    sharedDemoAccounts.admin.id,
    sharedDemoAccounts.admin.username,
  ];
  if (publicAccountIdentifiers.some((identifier) => !accountDocument.includes(identifier))) {
    throw new Error("Investor Demo account document does not match the shared identity contract");
  }

  const artifactTrust = artifactVerifier({ artifactRoot: root, androidSdk });
  if (
    artifactTrust.sourceCommit !== currentCommit
    || artifactTrust.reports.length !== 3
  ) {
    throw new Error("Investor Demo APK trust verification is incomplete");
  }
  const signing = readJson(root, "signing-verification.json");
  if (
    signing.sourceCommit !== currentCommit
    || signing.distinctCertificates !== true
    || signing.distinctPublicKeys !== true
    || !Array.isArray(signing.reports)
    || signing.reports.length !== 3
    || signing.reports.some((report) => report.signatureValid !== true)
  ) {
    throw new Error("Investor Demo signing verification evidence is invalid");
  }
  const independent = readJson(root, "independent-apk-verification.json");
  if (
    independent.sourceCommit !== currentCommit
    || independent.status !== "PASS"
    || independent.reports?.length !== 3
  ) {
    throw new Error("Investor Demo independent APK verification is incomplete");
  }
  const hashRecheck = readJson(root, "HASH_RECHECK.json");
  if (hashRecheck.sourceCommit !== currentCommit || hashRecheck.status !== "PASS") {
    throw new Error("Investor Demo hash recheck did not pass");
  }
  const security = readJson(root, "SECURITY_SCAN.json");
  if (
    security.sourceCommit !== currentCommit
    || security.status !== "PASS"
    || security.secretMatches !== 0
  ) {
    throw new Error("Investor Demo security scan did not pass");
  }
  const inventory = readJson(root, "FILE_INVENTORY.json");
  if (inventory.sourceCommit !== currentCommit || inventory.status !== "PASS") {
    throw new Error("Investor Demo file inventory is invalid");
  }
  const releaseStatus = readJson(root, "RELEASE_STATUS.json");
  if (
    releaseStatus.sourceCommit !== currentCommit
    || releaseStatus.published !== false
    || releaseStatus.releaseDecision !== "INVESTOR_APK_HOLD"
  ) {
    throw new Error("Investor Demo candidate release status is invalid");
  }
  const network = readJson(root, "network-443.json");
  if (
    network.status !== "PASS"
    || network.tcpConnected !== true
    || network.port !== 443
    || network.apiOrigin !== "https://123.207.198.136"
  ) {
    throw new Error("Tencent Staging HTTPS 443 evidence did not pass");
  }

  const qa = readJson(root, "qa/qa-index.json");
  const physicalSerials = [...new Set(qa.physicalDevices?.serials ?? [])];
  if (
    qa.status !== "PASS"
    || qa.mode !== "FinalSeal"
    || qa.sourceCommit !== currentCommit
    || qa.physicalDevices?.required !== 2
    || qa.physicalDevices?.passed < 2
    || physicalSerials.length < 2
    || qa.authenticatedFlow?.status !== "PASS"
    || qa.authenticatedFlow?.login !== "PASS"
    || qa.authenticatedFlow?.logout !== "PASS"
    || qa.authenticatedFlow?.shortTtlVerification !== "PASS"
    || qa.authenticatedFlow?.fixedBusinessChain !== "PASS"
    || qa.authenticatedFlow?.passedRuns < 2
  ) {
    throw new Error("two-device authenticated FinalSeal QA did not pass");
  }
  if (!Array.isArray(qa.reports) || qa.reports.length < 6) {
    throw new Error("FinalSeal QA must contain all three roles on two physical devices");
  }
  for (const report of qa.reports) {
    if (
      report.status !== "PASS"
      || !physicalSerials.includes(report.serial)
      || !runtimeIsClean(report.runtimeChecks)
      || !runtimeIsClean(report.postAuthenticatedRuntimeChecks)
      || !Array.isArray(report.evidenceFiles)
      || ![".png", ".xml", ".txt"].every(
        (extension) => report.evidenceFiles.some((file) => file.endsWith(extension)),
      )
    ) {
      throw new Error("FinalSeal QA report/evidence/runtime safety is incomplete");
    }
    for (const relativePath of report.evidenceFiles) requireNonemptyFile(root, relativePath);
  }
  return Object.freeze({ root, manifest, artifactTrust, qa });
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(temporary, filePath);
}

export function sealInvestorDemoArtifact(options) {
  const verified = validateInvestorDemoSeal(options);
  const sealedAt = new Date().toISOString();
  const sealedManifest = {
    ...verified.manifest,
    sealed: true,
    dispatchable: true,
    releaseDecision: "INVESTOR_APK_GO",
    published: false,
    sealedAt,
  };
  const releaseStatusPath = path.join(verified.root, "RELEASE_STATUS.json");
  const releaseStatus = readJson(verified.root, "RELEASE_STATUS.json");
  writeJsonAtomic(path.join(verified.root, "manifest.json"), sealedManifest);
  writeJsonAtomic(releaseStatusPath, {
    ...releaseStatus,
    sealed: true,
    dispatchable: true,
    releaseDecision: "INVESTOR_APK_GO",
    published: false,
    sealedAt,
    blockingReasons: [],
  });
  writeJsonAtomic(path.join(verified.root, "seal-verification.json"), {
    status: "PASS",
    sealed: true,
    releaseDecision: "INVESTOR_APK_GO",
    published: false,
    sourceCommit: sealedManifest.sourceCommit,
    sealedAt,
    physicalDeviceCount: verified.qa.physicalDevices.passed,
    authenticatedFlowRuns: verified.qa.authenticatedFlow.passedRuns,
  });
  return sealedManifest;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const artifactRootIndex = process.argv.indexOf("--artifact-root");
  const artifactRoot = artifactRootIndex >= 0 ? process.argv[artifactRootIndex + 1] : process.env.XLB_INVESTOR_DEMO_ARTIFACT_ROOT;
  if (!artifactRoot) throw new Error("mobile:investor-demo:seal requires --artifact-root or XLB_INVESTOR_DEMO_ARTIFACT_ROOT");
  const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const manifest = sealInvestorDemoArtifact({
    artifactRoot,
    currentCommit: currentGitCommit(workspaceRoot),
    androidSdk: resolveAndroidSdk(),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write("INVESTOR_APK_GO\n");
}
