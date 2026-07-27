import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findAndroidBuildTool } from "./toolchain.mjs";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Required Android file is missing: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function assertMatch(content, pattern, message) {
  if (!pattern.test(content)) throw new Error(message);
}

function assertNoMatch(content, pattern, message) {
  if (pattern.test(content)) throw new Error(message);
}

export function renderDebugNetworkSecurityConfig(hosts) {
  const domains = [...hosts]
    .sort()
    .map((host) => `        <domain includeSubdomains="false">${xmlEscape(host)}</domain>`)
    .join("\n");
  const domainBlock = domains === ""
    ? ""
    : `\n    <domain-config cleartextTrafficPermitted="true">\n${domains}\n    </domain-config>`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />${domainBlock}\n</network-security-config>\n`;
}

export function writeDebugNetworkSecurityConfig(app) {
  const output = path.join(
    app.paths.androidRoot,
    "app",
    "src",
    "debug",
    "res",
    "xml",
    "network_security_config.xml",
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const expected = renderDebugNetworkSecurityConfig(app.android.debugCleartextHosts);
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== expected) {
    fs.writeFileSync(output, expected, "utf8");
  }
  return output;
}

export function validateAndroidBoundaries(app) {
  const appRoot = path.join(app.paths.androidRoot, "app");
  const build = read(path.join(appRoot, "build.gradle"));
  const manifest = read(path.join(appRoot, "src", "main", "AndroidManifest.xml"));
  const strings = read(path.join(appRoot, "src", "main", "res", "values", "strings.xml"));
  const mainNetwork = read(
    path.join(appRoot, "src", "main", "res", "xml", "network_security_config.xml"),
  );
  const debugNetworkPath = path.join(
    appRoot,
    "src",
    "debug",
    "res",
    "xml",
    "network_security_config.xml",
  );
  const debugNetwork = read(debugNetworkPath);

  assertMatch(
    build,
    new RegExp(`\\bapplicationId\\s*(?:=\\s*)?["']${escapeRegExp(app.appId)}["']`, "u"),
    `Android applicationId must be ${app.appId}`,
  );
  assertMatch(
    build,
    new RegExp(`\\bversionCode\\s*(?:=\\s*)?${app.version.code}\\b`, "u"),
    `Android versionCode must be ${app.version.code}`,
  );
  assertMatch(
    build,
    new RegExp(`\\bversionName\\s*(?:=\\s*)?["']${escapeRegExp(app.version.name)}["']`, "u"),
    `Android versionName must be ${app.version.name}`,
  );
  assertMatch(
    strings,
    new RegExp(`<string\\s+name=["']app_name["']>${escapeRegExp(app.appName)}</string>`, "u"),
    `Android app_name must be ${app.appName}`,
  );

  const permissions = [
    ...manifest.matchAll(
      /<uses-permission\b[^>]*\bandroid:name\s*=\s*"([^"]+)"[^>]*\/?\s*>/gu,
    ),
  ].map((match) => match[1]).sort();
  const expectedPermissions = [...app.android.permissions].sort();
  if (
    permissions.length !== expectedPermissions.length ||
    !permissions.every((permission, index) => permission === expectedPermissions[index])
  ) {
    throw new Error(
      `Android permissions differ from the app-owned descriptor. Expected ${expectedPermissions.join(", ") || "(none)"}; found ${permissions.join(", ") || "(none)"}`,
    );
  }
  assertMatch(manifest, /android:allowBackup="false"/u, "Android backups must be disabled");
  assertMatch(
    manifest,
    /android:usesCleartextTraffic="false"/u,
    "The main Android manifest must deny cleartext traffic",
  );
  assertMatch(
    manifest,
    /android:networkSecurityConfig="@xml\/network_security_config"/u,
    "The main Android manifest must use the app-owned network security config",
  );
  assertNoMatch(
    mainNetwork,
    /cleartextTrafficPermitted="true"/u,
    "The main/production network security config must not allow cleartext",
  );
  assertMatch(
    mainNetwork,
    /cleartextTrafficPermitted="false"/u,
    "The main/production network security config must explicitly deny cleartext",
  );

  const expectedDebug = renderDebugNetworkSecurityConfig(
    app.android.debugCleartextHosts,
  );
  if (debugNetwork !== expectedDebug) {
    throw new Error(
      `Debug cleartext config is stale or broader than the descriptor; regenerate ${debugNetworkPath}`,
    );
  }
  const debugManifest = path.join(appRoot, "src", "debug", "AndroidManifest.xml");
  if (
    fs.existsSync(debugManifest) &&
    /usesCleartextTraffic\s*=\s*"true"/u.test(fs.readFileSync(debugManifest, "utf8"))
  ) {
    throw new Error(
      `Debug Manifest must not enable broad cleartext; use the generated host allowlist: ${debugManifest}`,
    );
  }
  const releaseRoot = path.join(appRoot, "src", "release");
  if (fs.existsSync(releaseRoot)) {
    const pending = [releaseRoot];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(child);
        else if (
          entry.isFile() &&
          /cleartextTrafficPermitted="true"/u.test(fs.readFileSync(child, "utf8"))
        ) {
          throw new Error(`Release source set must not enable cleartext: ${child}`);
        }
      }
    }
  }

  return Object.freeze({
    appId: app.appId,
    appName: app.appName,
    versionCode: app.version.code,
    versionName: app.version.name,
    permissions: expectedPermissions,
    debugCleartextHosts: [...app.android.debugCleartextHosts].sort(),
  });
}

function runAapt(aapt, args, spawn) {
  const result = spawn(aapt, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`aapt ${args.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
  return result.stdout;
}

function runApkSigner(apksigner, args, spawn, environment) {
  const windowsBatch = /\.bat$/iu.test(apksigner);
  const command = windowsBatch
    ? environment.ComSpec ?? process.env.ComSpec ?? "cmd.exe"
    : apksigner;
  const commandArgs = windowsBatch
    ? ["/d", "/c", apksigner, ...args]
    : args;
  const result = spawn(command, commandArgs, {
    encoding: "utf8",
    env: environment,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(
      `apksigner ${args.join(" ")} failed with exit code ${result.status ?? 1}`
      + (detail ? `: ${detail}` : ""),
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export function validateBuiltApk(
  app,
  apkPath,
  {
    androidSdk,
    variant = "debug",
    platform = process.platform,
    environment = process.env,
    javaHome,
    exists = fs.existsSync,
    spawn = spawnSync,
    findBuildTool = findAndroidBuildTool,
  } = {},
) {
  if (!["debug", "release"].includes(variant)) {
    throw new Error("APK validation variant must be debug or release");
  }
  if (!exists(apkPath)) throw new Error(`Expected APK is missing: ${apkPath}`);
  if (!androidSdk) throw new Error("androidSdk is required to validate a built APK");
  const aapt = findBuildTool(androidSdk, "aapt", { platform, exists });
  const badging = runAapt(aapt, ["dump", "badging", apkPath], spawn);
  const packageMatch = badging.match(
    /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/mu,
  );
  if (!packageMatch) throw new Error("aapt did not report APK package metadata");
  const [, appId, versionCode, versionName] = packageMatch;
  if (
    appId !== app.appId ||
    versionCode !== String(app.version.code) ||
    versionName !== app.version.name
  ) {
    throw new Error(
      `APK identity/version drift: ${appId} versionCode=${versionCode} versionName=${versionName}`,
    );
  }
  const label = badging.match(/^application-label:'([^']*)'/mu)?.[1];
  if (label !== app.appName) {
    throw new Error(`APK application label must be ${app.appName}; found ${label ?? "(missing)"}`);
  }

  const permissions = [
    ...badging.matchAll(/^uses-permission(?:-sdk-\d+)?: name='([^']+)'/gmu),
  ].map((match) => match[1]).sort();
  const generatedPermission =
    `${app.appId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
  const generatedPermissions = permissions.filter(
    (permission) => permission === generatedPermission,
  );
  const requestedPermissions = permissions.filter(
    (permission) => permission !== generatedPermission,
  );
  const expectedPermissions = [...app.android.permissions].sort();
  if (
    requestedPermissions.length !== expectedPermissions.length ||
    !requestedPermissions.every(
      (permission, index) => permission === expectedPermissions[index],
    )
  ) {
    throw new Error(
      `APK permissions differ from the app-owned descriptor. Expected ${expectedPermissions.join(", ") || "(none)"}; found ${requestedPermissions.join(", ") || "(none)"}`,
    );
  }

  const manifestTree = runAapt(
    aapt,
    ["dump", "xmltree", apkPath, "AndroidManifest.xml"],
    spawn,
  );
  assertMatch(
    manifestTree,
    /android:allowBackup[^=\n]*=\(type 0x12\)0x0/u,
    "Merged APK manifest must disable backups",
  );
  assertMatch(
    manifestTree,
    /android:usesCleartextTraffic[^=\n]*=\(type 0x12\)0x0/u,
    "Merged APK manifest must deny broad cleartext traffic",
  );
  assertMatch(
    manifestTree,
    /android:networkSecurityConfig[^=\n]*=@/u,
    "Merged APK manifest must reference a network security config",
  );

  let certificateDn;
  let certificateSha256;
  let publicKeySha256;
  if (variant === "release") {
    if (typeof javaHome !== "string" || !javaHome.trim()) {
      throw new Error(
        "release APK validation requires the resolved JDK through javaHome",
      );
    }
    const apksigner = findBuildTool(androidSdk, "apksigner", {
      platform,
      exists,
    });
    const verification = runApkSigner(
      apksigner,
      ["verify", "--verbose", "--print-certs", apkPath],
      spawn,
      {
        ...environment,
        ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      },
    );
    const signerCount = Number(
      verification.match(/^Number of signers:\s*(\d+)\r?$/imu)?.[1],
    );
    if (signerCount !== 1) {
      throw new Error("Release APK must contain exactly one current signer");
    }
    certificateDn = verification.match(
      /^(?:Signer #\d+ certificate|V[\d.]+ Signer: certificate) DN:\s*(.+?)\r?$/imu,
    )?.[1]?.trim();
    certificateSha256 = verification.match(
      /^(?:Signer #\d+ certificate|V[\d.]+ Signer: certificate) SHA-256 digest:\s*([0-9a-f:]+)\r?$/imu,
    )?.[1]?.replaceAll(":", "").toUpperCase();
    publicKeySha256 = verification.match(
      /^(?:Signer #\d+|V[\d.]+ Signer:) public key SHA-256 digest:\s*([0-9a-f:]+)\r?$/imu,
    )?.[1]?.replaceAll(":", "").toUpperCase();
    if (!certificateDn || !certificateSha256 || !publicKeySha256) {
      throw new Error(
        "apksigner did not report the release signer certificate and public key",
      );
    }
    if (/\bAndroid Debug\b/iu.test(certificateDn)) {
      throw new Error("Release APK must not use an Android Debug certificate");
    }
  }

  return Object.freeze({
    apkPath: path.resolve(apkPath),
    appId,
    appName: label,
    versionCode: Number(versionCode),
    versionName,
    permissions: requestedPermissions,
    generatedPermissions,
    ...(certificateDn ? { certificateDn } : {}),
    ...(certificateSha256 ? { certificateSha256 } : {}),
    ...(publicKeySha256 ? { publicKeySha256 } : {}),
  });
}
