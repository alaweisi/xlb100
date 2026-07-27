import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveJavaHome } from "../packages/mobile-foundation/src/index.mjs";
import {
  mobileReleaseApps,
  mobileSigningPrefix,
} from "./mobile-release-prerequisites.mjs";

const signingDirectoryPrefix = "xlb-engineering-rc-signing-";

function keytoolExecutable(javaHome, platform) {
  return path.join(
    javaHome,
    "bin",
    platform === "win32" ? "keytool.exe" : "keytool",
  );
}

export function createMobileSimulationSigning({
  environment = process.env,
  platform = process.platform,
  temporaryRoot = os.tmpdir(),
  spawn = spawnSync,
  resolveJava = resolveJavaHome,
  apps = mobileReleaseApps,
} = {}) {
  const javaHome = resolveJava({ environment, platform, spawn });
  const keytool = keytoolExecutable(javaHome, platform);
  const signingRoot = fs.mkdtempSync(
    path.join(path.resolve(temporaryRoot), signingDirectoryPrefix),
  );
  const generatedEnvironment = {
    XLB_MOBILE_SIGNING_CLASS: "simulation",
  };
  try {
    for (const app of apps) {
      const prefix = mobileSigningPrefix(app);
      const keystorePath = path.join(signingRoot, `${app.key}-simulation.jks`);
      const password = randomBytes(24).toString("base64url");
      const alias = `${app.key}-engineering-rc`;
      const result = spawn(
        keytool,
        [
          "-genkeypair",
          "-noprompt",
          "-storetype",
          "JKS",
          "-keystore",
          keystorePath,
          "-storepass",
          password,
          "-keypass",
          password,
          "-alias",
          alias,
          "-keyalg",
          "RSA",
          "-keysize",
          "2048",
          "-validity",
          "2",
          "-dname",
          `CN=XLB ${app.key} Engineering RC Simulation, OU=Android Simulation, O=XLB100, C=CN`,
        ],
        {
          encoding: "utf8",
          env: {
            ...environment,
            JAVA_HOME: javaHome,
          },
          windowsHide: true,
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0 || !fs.existsSync(keystorePath)) {
        throw new Error(`failed to generate ${app.key} simulation signing identity`);
      }
      generatedEnvironment[app.environment.apiBaseUrlVariable] =
        `https://${app.key}.engineering-rc.invalid`;
      generatedEnvironment[`${prefix}_KEYSTORE_PATH`] = keystorePath;
      generatedEnvironment[`${prefix}_STORE_PASSWORD`] = password;
      generatedEnvironment[`${prefix}_KEY_ALIAS`] = alias;
      generatedEnvironment[`${prefix}_KEY_PASSWORD`] = password;
    }
    return Object.freeze({
      signingRoot,
      environment: Object.freeze(generatedEnvironment),
    });
  } catch (error) {
    removeMobileSimulationSigning(signingRoot, temporaryRoot);
    throw error;
  }
}

export function removeMobileSimulationSigning(
  signingRoot,
  temporaryRoot = os.tmpdir(),
) {
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedSigningRoot = path.resolve(signingRoot);
  const relative = path.relative(resolvedTemporaryRoot, resolvedSigningRoot);
  if (
    !path.basename(resolvedSigningRoot).startsWith(signingDirectoryPrefix)
    || relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("refusing to remove an unsafe simulation signing directory");
  }
  fs.rmSync(resolvedSigningRoot, { recursive: true, force: true });
}
