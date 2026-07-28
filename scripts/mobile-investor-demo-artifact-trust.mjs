import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const INVESTOR_DEMO_ARTIFACT_ROLES = Object.freeze({
  customer: Object.freeze({ appId: "com.xlb100.customer.demo", fileName: "xlb-customer-investor-demo-v2.apk" }),
  worker: Object.freeze({ appId: "com.xlb100.worker.demo", fileName: "xlb-worker-investor-demo-v2.apk" }),
  admin: Object.freeze({ appId: "com.xlb100.admin.demo", fileName: "xlb-admin-investor-demo-v2.apk" }),
});

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function normalizeFingerprint(value) {
  return String(value ?? "").replaceAll(":", "").trim().toUpperCase();
}

function pathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function parseChecksums(text) {
  const checksums = new Map();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})\s+\*?([^\\/]+)$/iu.exec(line.trim());
    if (!match) throw new Error("checksums.sha256 contains an invalid line");
    if (checksums.has(match[2])) throw new Error("checksums.sha256 contains a duplicate filename");
    checksums.set(match[2], match[1].toUpperCase());
  }
  return checksums;
}

export function resolveAndroidVerificationTools(androidSdk) {
  const buildToolsRoot = path.join(path.resolve(androidSdk), "build-tools");
  const versions = fs.readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const root = path.join(buildToolsRoot, version);
    const aapt = path.join(root, process.platform === "win32" ? "aapt.exe" : "aapt");
    const apksigner = path.join(root, process.platform === "win32" ? "apksigner.bat" : "apksigner");
    if (fs.existsSync(aapt) && fs.existsSync(apksigner)) {
      return Object.freeze({ version, aapt, apksigner });
    }
  }
  throw new Error("Android build-tools with aapt and apksigner were not found");
}

function quoteWindowsCommandArgument(value) {
  const text = String(value);
  if (/[\0\r\n]/u.test(text)) throw new Error("Android verification argument is invalid");
  return `"${text.replaceAll("%", "%%").replaceAll("\"", "\"\"")}"`;
}

function sanitizeToolDiagnostic(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
    .replace(
      /((?:password|secret|token|pass(?:word)?)[\s]*[=:][\s]*)[^\s]+/giu,
      "$1[REDACTED]",
    )
    .replace(/\b1[3-9]\d{9}\b/gu, "[REDACTED_PHONE]")
    .trim()
    .slice(0, 1_200);
}

export function runAndroidVerificationTool(
  command,
  args,
  {
    spawn = spawnSync,
    platform = process.platform,
    comspec = process.env.ComSpec || "cmd.exe",
  } = {},
) {
  const isWindowsBatch = platform === "win32" && /\.(?:bat|cmd)$/iu.test(command);
  const executable = isWindowsBatch ? comspec : command;
  const windowsCommandLine = isWindowsBatch
    ? [command, ...args].map(quoteWindowsCommandArgument).join(" ")
    : "";
  const executableArgs = isWindowsBatch
    ? [
        "/d",
        "/s",
        "/c",
        `"${windowsCommandLine}"`,
      ]
    : args;
  const result = spawn(executable, executableArgs, {
    encoding: "utf8",
    windowsHide: true,
    windowsVerbatimArguments: isWindowsBatch,
    shell: false,
  });
  if (result.error) {
    const diagnostic = sanitizeToolDiagnostic(result.error.message);
    throw new Error(
      `Android artifact verification command failed: ${path.basename(command)}`
      + (diagnostic ? `: ${diagnostic}` : ""),
    );
  }
  if (result.status !== 0) {
    const diagnostic = sanitizeToolDiagnostic(
      result.stderr || result.stdout || result.error?.message,
    );
    throw new Error(
      `Android artifact verification command failed: ${path.basename(command)}`
      + (diagnostic ? `: ${diagnostic}` : ""),
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export function verifyInvestorDemoArtifactRoot({
  artifactRoot,
  androidSdk,
  runTool = runAndroidVerificationTool,
  tools = resolveAndroidVerificationTools(androidSdk),
}) {
  const root = fs.realpathSync(path.resolve(artifactRoot));
  const manifestPath = path.join(root, "manifest.json");
  const checksumsPath = path.join(root, "checksums.sha256");
  if (!fs.statSync(manifestPath).isFile() || !fs.statSync(checksumsPath).isFile()) {
    throw new Error("Investor Demo manifest/checksums are missing");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    manifest.profile !== "investor-demo"
    || manifest.releaseCandidate !== true
    || manifest.published !== false
    || manifest.apiOrigin !== "https://123.207.198.136"
    || !/^[0-9a-f]{40}$/u.test(manifest.sourceCommit ?? "")
  ) {
    throw new Error("Investor Demo candidate manifest boundary is invalid");
  }
  if (!Array.isArray(manifest.reports) || manifest.reports.length !== 3) {
    throw new Error("Investor Demo manifest must contain exactly three role reports");
  }
  const checksums = parseChecksums(fs.readFileSync(checksumsPath, "utf8"));
  if (checksums.size !== 3) {
    throw new Error("checksums.sha256 must contain exactly three APK entries");
  }

  const seenRoles = new Set();
  const certificates = new Set();
  const reports = [];
  for (const report of manifest.reports) {
    const expected = INVESTOR_DEMO_ARTIFACT_ROLES[report.role];
    if (!expected || seenRoles.has(report.role)) {
      throw new Error("Investor Demo manifest role set is invalid");
    }
    seenRoles.add(report.role);
    if (report.appId !== expected.appId || report.versionCode !== 2) {
      throw new Error(`Investor Demo ${report.role} package/version is invalid`);
    }
    const declaredPath = path.isAbsolute(report.apkPath)
      ? path.resolve(report.apkPath)
      : path.resolve(root, report.apkPath);
    const realApkPath = fs.realpathSync(declaredPath);
    if (
      !pathInside(root, realApkPath)
      || path.basename(realApkPath) !== expected.fileName
      || !fs.statSync(realApkPath).isFile()
    ) {
      throw new Error(`Investor Demo ${report.role} APK path/filename is invalid`);
    }
    const actualHash = sha256(realApkPath);
    if (
      normalizeFingerprint(report.sha256) !== actualHash
      || checksums.get(expected.fileName) !== actualHash
    ) {
      throw new Error(`Investor Demo ${report.role} APK SHA-256 mismatch`);
    }

    const badging = runTool(tools.aapt, ["dump", "badging", realApkPath]);
    const packageMatch = /package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/u.exec(badging);
    if (
      !packageMatch
      || packageMatch[1] !== expected.appId
      || Number(packageMatch[2]) !== report.versionCode
      || packageMatch[3] !== report.versionName
    ) {
      throw new Error(`Investor Demo ${report.role} aapt identity mismatch`);
    }
    const signerOutput = runTool(tools.apksigner, ["verify", "--verbose", "--print-certs", realApkPath]);
    const signerMatches = [...signerOutput.matchAll(
      /(?:Signer #(\d+)|V\d+(?:\.\d+)? Signer):?\s+certificate SHA-256 digest:\s*([0-9a-f:]+)/giu,
    )];
    const signerDigests = [...new Set(
      signerMatches.map((match) => normalizeFingerprint(match[2])),
    )];
    const numberedSigners = new Set(
      signerMatches.map((match) => match[1]).filter(Boolean),
    );
    const signerCountMatch = /Number of signers:\s*(\d+)/iu.exec(signerOutput);
    if (
      (signerCountMatch && Number(signerCountMatch[1]) !== 1)
      || numberedSigners.size > 1
      || signerDigests.length !== 1
      || signerDigests[0] !== normalizeFingerprint(report.certificateSha256)
    ) {
      throw new Error(`Investor Demo ${report.role} signer certificate mismatch`);
    }
    certificates.add(signerDigests[0]);
    reports.push(Object.freeze({
      role: report.role,
      appId: expected.appId,
      apkPath: realApkPath,
      fileName: expected.fileName,
      versionCode: report.versionCode,
      versionName: report.versionName,
      sha256: actualHash,
      certificateSha256: signerDigests[0],
    }));
  }
  if (seenRoles.size !== 3 || certificates.size !== 3) {
    throw new Error("Investor Demo APK certificates must be distinct across all three roles");
  }
  return Object.freeze({
    artifactRoot: root,
    sourceCommit: manifest.sourceCommit,
    apiOrigin: manifest.apiOrigin,
    reports: Object.freeze(reports),
    tools: Object.freeze({ version: tools.version }),
  });
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("invalid artifact trust arguments");
    options[key.slice(2)] = value;
  }
  return options;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = parseCli(process.argv.slice(2));
  const result = verifyInvestorDemoArtifactRoot({
    artifactRoot: args["artifact-root"],
    androidSdk: args["android-sdk"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
