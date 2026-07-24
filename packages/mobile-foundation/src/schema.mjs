import path from "node:path";

export const MOBILE_PROFILES = Object.freeze([
  "development",
  "test",
  "production",
]);

const APP_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]+$/u;
const PACKAGE_PATTERN = /^@xlb\/[a-z0-9-]+$/u;
const PERMISSION_PATTERN = /^android\.permission\.[A-Z0-9_]+$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(`Invalid mobile app descriptor: ${message}`);
}

function assertKeys(value, keys, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  invariant(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    `${label} keys must be exactly: ${expected.join(", ")}`,
  );
}

function assertOrigin(value, label) {
  invariant(typeof value === "string" && value.trim() !== "", `${label} must be a non-empty origin`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    invariant(false, `${label} must be an absolute HTTP(S) origin`);
  }
  invariant(
    ["http:", "https:"].includes(parsed.protocol) &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "",
    `${label} must be an origin without credentials, path, query, or hash`,
  );
  return parsed;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function defineMobileApp(input) {
  assertKeys(
    input,
    ["key", "appId", "appName", "version", "paths", "web", "environment", "android"],
    "root",
  );
  invariant(/^[a-z][a-z0-9-]*$/u.test(input.key), "key must be lower kebab-case");
  invariant(APP_ID_PATTERN.test(input.appId), "appId must be a reverse-DNS Android identifier");
  invariant(typeof input.appName === "string" && input.appName.trim() !== "", "appName is required");

  assertKeys(input.version, ["code", "name"], "version");
  invariant(Number.isInteger(input.version.code) && input.version.code > 0, "version.code must be a positive integer");
  invariant(VERSION_PATTERN.test(input.version.name), "version.name must be a semantic version");

  assertKeys(input.paths, ["workspaceRoot", "mobileRoot", "webRoot", "androidRoot"], "paths");
  for (const [name, value] of Object.entries(input.paths)) {
    invariant(typeof value === "string" && path.isAbsolute(value), `paths.${name} must be absolute`);
  }
  for (const name of ["mobileRoot", "webRoot"]) {
    const relative = path.relative(input.paths.workspaceRoot, input.paths[name]);
    invariant(
      relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
      `paths.${name} must be a child of paths.workspaceRoot`,
    );
  }
  invariant(
    path.resolve(input.paths.androidRoot) === path.join(path.resolve(input.paths.mobileRoot), "android"),
    "paths.androidRoot must be the app-owned android directory under paths.mobileRoot",
  );

  assertKeys(
    input.web,
    ["packageName", "outputDirectory", "publicBase", "apiBaseBuildVariable", "appVersionBuildVariable"],
    "web",
  );
  invariant(PACKAGE_PATTERN.test(input.web.packageName), "web.packageName must use @xlb/*");
  invariant(path.isAbsolute(input.web.outputDirectory), "web.outputDirectory must be absolute");
  invariant(
    path.resolve(input.web.outputDirectory) === path.join(path.resolve(input.paths.mobileRoot), "dist"),
    "web.outputDirectory must be the mobile shell's dist directory",
  );
  invariant(input.web.publicBase === "./", "web.publicBase must be ./ for bundled Capacitor assets");
  invariant(ENVIRONMENT_VARIABLE_PATTERN.test(input.web.apiBaseBuildVariable), "web.apiBaseBuildVariable is invalid");
  invariant(ENVIRONMENT_VARIABLE_PATTERN.test(input.web.appVersionBuildVariable), "web.appVersionBuildVariable is invalid");

  assertKeys(input.environment, ["apiBaseUrlVariable", "profiles"], "environment");
  invariant(ENVIRONMENT_VARIABLE_PATTERN.test(input.environment.apiBaseUrlVariable), "environment.apiBaseUrlVariable is invalid");
  assertKeys(input.environment.profiles, MOBILE_PROFILES, "environment.profiles");

  const httpHosts = new Set();
  for (const profileName of MOBILE_PROFILES) {
    const profile = input.environment.profiles[profileName];
    const allowedKeys = profile.source === "fixed"
      ? ["source", "apiBaseUrl", "requireHttps"]
      : ["source", "requireHttps"];
    assertKeys(profile, allowedKeys, `environment.profiles.${profileName}`);
    invariant(["fixed", "environment"].includes(profile.source), `${profileName}.source is invalid`);
    invariant(typeof profile.requireHttps === "boolean", `${profileName}.requireHttps must be boolean`);
    if (profile.source === "environment") {
      invariant(
        profile.requireHttps === true,
        `${profileName} environment-sourced origins must require HTTPS`,
      );
    }
    if (profile.source === "fixed") {
      const origin = assertOrigin(profile.apiBaseUrl, `${profileName}.apiBaseUrl`);
      if (profile.requireHttps) {
        invariant(origin.protocol === "https:", `${profileName}.apiBaseUrl must use HTTPS`);
      } else if (origin.protocol === "http:") {
        invariant(
          profileName === "test",
          "only the test profile may use a fixed HTTP origin",
        );
        httpHosts.add(origin.hostname);
      }
    }
  }
  invariant(
    input.environment.profiles.production.requireHttps === true,
    "production must require HTTPS",
  );

  assertKeys(input.android, ["permissions", "debugCleartextHosts"], "android");
  invariant(Array.isArray(input.android.permissions), "android.permissions must be an array");
  invariant(
    input.android.permissions.every((permission) => PERMISSION_PATTERN.test(permission)),
    "android.permissions contains an invalid permission",
  );
  invariant(
    new Set(input.android.permissions).size === input.android.permissions.length,
    "android.permissions must not contain duplicates",
  );
  invariant(Array.isArray(input.android.debugCleartextHosts), "android.debugCleartextHosts must be an array");
  for (const host of input.android.debugCleartextHosts) {
    invariant(
      typeof host === "string" &&
        /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/u.test(host),
      `invalid cleartext host: ${String(host)}`,
    );
  }
  invariant(
    new Set(input.android.debugCleartextHosts).size === input.android.debugCleartextHosts.length,
    "android.debugCleartextHosts must not contain duplicates",
  );
  const configuredHosts = [...input.android.debugCleartextHosts].sort();
  const requiredHosts = [...httpHosts].sort();
  invariant(
    configuredHosts.length === requiredHosts.length &&
      configuredHosts.every((host, index) => host === requiredHosts[index]),
    "android.debugCleartextHosts must exactly match fixed HTTP profile hosts",
  );

  return deepFreeze(structuredClone(input));
}
