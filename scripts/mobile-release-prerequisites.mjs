import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  probeAndroidToolchain,
  resolveMobileEnvironment,
} from "../packages/mobile-foundation/src/index.mjs";
import customer from "../apps/customer-mobile/mobile-app.config.mjs";
import worker from "../apps/worker-mobile/mobile-app.config.mjs";
import admin from "../apps/admin-mobile/mobile-app.config.mjs";

export const mobileReleaseApps = Object.freeze([customer, worker, admin]);

export function mobileSigningPrefix(app) {
  return `XLB_${app.key.toUpperCase().replaceAll("-", "_")}_ANDROID`;
}

export function requiredMobileReleaseEnvironmentNames(
  apps = mobileReleaseApps,
) {
  return apps.flatMap((app) => {
    const prefix = mobileSigningPrefix(app);
    return [
      app.environment.apiBaseUrlVariable,
      `${prefix}_KEYSTORE_PATH`,
      `${prefix}_STORE_PASSWORD`,
      `${prefix}_KEY_ALIAS`,
      `${prefix}_KEY_PASSWORD`,
    ];
  });
}

export function assertMobileReleasePrerequisites({
  environment = process.env,
  apps = mobileReleaseApps,
  exists = fs.existsSync,
  probe = probeAndroidToolchain,
} = {}) {
  const signingClass = environment.XLB_MOBILE_SIGNING_CLASS?.trim();
  if (signingClass !== "simulation" && signingClass !== "release") {
    throw new Error(
      "XLB_MOBILE_SIGNING_CLASS must explicitly be simulation or release",
    );
  }
  const missing = requiredMobileReleaseEnvironmentNames(apps).filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `mobile release environment is incomplete; missing: ${missing.join(", ")}`,
    );
  }

  const keystorePaths = new Set();
  const reports = apps.map((app) => {
    const prefix = mobileSigningPrefix(app);
    const keystoreVariable = `${prefix}_KEYSTORE_PATH`;
    const keystorePath = path.resolve(environment[keystoreVariable]);
    if (!exists(keystorePath)) {
      throw new Error(`${keystoreVariable} does not name an existing file`);
    }
    if (keystorePaths.has(keystorePath.toLowerCase())) {
      throw new Error("each mobile app must use a distinct signing keystore");
    }
    keystorePaths.add(keystorePath.toLowerCase());
    const mobileEnvironment = resolveMobileEnvironment(
      app,
      "production",
      environment,
    );
    const toolchain = probe(app, { environment });
    return Object.freeze({
      role: app.key,
      apiHost: new URL(mobileEnvironment.apiBaseUrl).hostname,
      javaMajor: toolchain.javaMajor,
      androidApi: toolchain.androidApi,
    });
  });

  return Object.freeze({
    signingClass,
    reports: Object.freeze(reports),
  });
}

function run() {
  const report = assertMobileReleasePrerequisites();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) run();
