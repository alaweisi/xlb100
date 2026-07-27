import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ENGINEERING_RC_PNPM_VERSION,
  ENGINEERING_RC_PROVIDER_ISOLATION,
} from "./engineering-rc-contract.mjs";

export const ENGINEERING_RC_AUDIT_REGISTRY =
  "https://registry.npmjs.org/";
export const ENGINEERING_RC_PACKAGE_MANAGER =
  `pnpm@${ENGINEERING_RC_PNPM_VERSION}`;
export const ENGINEERING_RC_LOCAL_MYSQL_CONTAINER = "xlb-mysql-local";
export const ENGINEERING_RC_LOCAL_REDIS_CONTAINER = "xlb-redis-local";

export const ENGINEERING_RC_PNPM_RUNTIME_PINS = Object.freeze({
  integrity:
    "sha512.76e2379760a4328ec4415815bcd6628dee727af3779aaa4c914e3944156c4299921a89f976381ee107d41f12cfa4b66681ca9c718f0668fa0831ed4c6d8ba56c",
  entrySha256:
    "98e6b99a881d64a1cc982c3e60aa260bf02160386b12e74475e06486dc74b090",
  packageTreeSha256:
    "a694540948bcbb104792da61db8d95e12d541628d5e2984d9e719a199db4727e",
});
export const ENGINEERING_RC_COREPACK_RUNTIME_PINS = Object.freeze({
  version: "0.34.6",
  entrySha256:
    "4bd305443b25ccb4c11b0c3f9eefe65d755af39f3545bfec24af428a1f9451b5",
  packageTreeSha256:
    "931322d1efb984d6e7ddf72b8d07dde11d325d7bfdc2596884db682780c4b9ce",
});
export const ENGINEERING_RC_CONTROLLED_NPM_CONFIG_NAMES = Object.freeze([
  "NPM_CONFIG_CACHE",
  "NPM_CONFIG_GLOBALCONFIG",
  "NPM_CONFIG_IGNORE_SCRIPTS",
  "NPM_CONFIG_REGISTRY",
  "NPM_CONFIG_STORE_DIR",
  "NPM_CONFIG_STRICT_SSL",
  "NPM_CONFIG_USERCONFIG",
  "NPM_CONFIG_VERIFY_STORE_INTEGRITY",
]);

const safeHostEnvironmentNames = Object.freeze([
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "PROGRAMDATA",
  "ALLUSERSPROFILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "APPDATA",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "PSModulePath",
  "POWERSHELL_DISTRIBUTION_CHANNEL",
  "OS",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "TERM",
  "COLORTERM",
  "TZ",
  "NO_COLOR",
  "FORCE_COLOR",
  "CI",
  "GITHUB_ACTIONS",
  "GITHUB_REPOSITORY",
  "GITHUB_REPOSITORY_ID",
  "GITHUB_WORKFLOW",
  "GITHUB_WORKFLOW_REF",
  "GITHUB_WORKFLOW_SHA",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_NUMBER",
  "GITHUB_RUN_ATTEMPT",
  "GITHUB_SHA",
  "GITHUB_REF",
  "GITHUB_REF_NAME",
  "GITHUB_REF_TYPE",
  "GITHUB_HEAD_REF",
  "GITHUB_BASE_REF",
  "GITHUB_EVENT_NAME",
  "GITHUB_WORKSPACE",
  "GITHUB_JOB",
  "GITHUB_ACTOR",
  "GITHUB_ACTOR_ID",
  "GITHUB_SERVER_URL",
  "GITHUB_API_URL",
  "GITHUB_GRAPHQL_URL",
  "RUNNER_OS",
  "RUNNER_ARCH",
  "RUNNER_TEMP",
  "RUNNER_TOOL_CACHE",
  "RUNNER_ENVIRONMENT",
  "ImageOS",
  "ImageVersion",
  "AGENT_TOOLSDIRECTORY",
  "JAVA_HOME",
  "ANDROID_HOME",
  "ANDROID_SDK_ROOT",
]);

const providerCredentialName =
  /(?:COS|PAYMENT|SMS|AMAP|GAODE|WECHAT|ALIPAY|TENCENT).*(?:SECRET|KEY|TOKEN|CREDENTIAL|FILE|BUCKET|REGION)/iu;

const forbiddenControlName = new RegExp(
  [
    "^DOCKER_(?!CONTEXT$)",
    "^COMPOSE_",
    "^BUILDKIT_",
    "^MIGRATION_DIR$",
    "^COREPACK_",
    "^PNPM_HOME$",
    "^PNPM_STORE_",
    "^NPM_CONFIG_(?:REGISTRY|USERCONFIG|GLOBALCONFIG|PREFIX|CACHE|STORE_DIR|SCRIPT_SHELL|NODE_LINKER|PACKAGE_IMPORT_METHOD|IGNORE_SCRIPTS|VERIFY_STORE_INTEGRITY|STRICT_SSL|CA|CAFILE|PROXY|HTTPS_PROXY|OFFLINE|PREFER_OFFLINE|LOCKFILE|FROZEN_LOCKFILE)$",
    "^TURBO_(?:TOKEN|API|TEAM|REMOTE_ONLY|CACHE_DIR|RUN_SUMMARY|FORCE)$",
    "^NODE_(?:OPTIONS|PATH)$",
    "^(?:HTTP_PROXY|HTTPS_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$",
    "^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|CONFIG_COUNT|CONFIG_KEY_\\d+|CONFIG_VALUE_\\d+)$",
    "^(?:npm_execpath|npm_node_execpath)$",
  ].join("|"),
  "iu",
);

function sourceValue(source, expectedName) {
  if (Object.hasOwn(source, expectedName)) return source[expectedName];
  const matchedName = Object.keys(source).find(
    (name) => name.toUpperCase() === expectedName.toUpperCase(),
  );
  return matchedName ? source[matchedName] : undefined;
}

function nonEmptySourceValue(source, name, fallback) {
  const value = sourceValue(source, name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function portValue(source, name, fallback) {
  const value = sourceValue(source, name);
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const normalized = String(value).trim();
  const number = Number(normalized);
  if (!/^\d{1,5}$/u.test(normalized) || number < 1 || number > 65_535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return normalized;
}

function safeContainerName(value, variableName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value)) {
    throw new Error(`${variableName} is not a safe Docker container name or id`);
  }
  return value;
}

export function isForbiddenEngineeringRcControlName(name) {
  return forbiddenControlName.test(name);
}

export function isTrustedEngineeringRcGithubActions(environment) {
  return environment.GITHUB_ACTIONS === "true"
    && environment.GITHUB_REPOSITORY === "alaweisi/xlb100"
    && environment.GITHUB_REPOSITORY_ID === "1287812965"
    && String(environment.GITHUB_WORKFLOW_REF ?? "")
      .includes("/.github/workflows/ci.yml@");
}

export function createEngineeringRcEnvironment(source = process.env) {
  const environment = {};
  for (const name of safeHostEnvironmentNames) {
    const value = sourceValue(source, name);
    if (value !== undefined && value !== null) {
      environment[name] = String(value);
    }
  }

  const mysqlPort = portValue(
    source,
    "XLB_ENGINEERING_RC_MYSQL_PORT",
    "3306",
  );
  const redisPort = portValue(
    source,
    "XLB_ENGINEERING_RC_REDIS_PORT",
    "6379",
  );
  const githubActions = isTrustedEngineeringRcGithubActions(environment);
  const requestedMysqlContainer = nonEmptySourceValue(
    source,
    "XLB_STAGE4A_MYSQL_CONTAINER",
    ENGINEERING_RC_LOCAL_MYSQL_CONTAINER,
  );
  const requestedRedisContainer = nonEmptySourceValue(
    source,
    "XLB_STAGE4A_REDIS_CONTAINER",
    ENGINEERING_RC_LOCAL_REDIS_CONTAINER,
  );
  if (
    !githubActions
    && (
      requestedMysqlContainer !== ENGINEERING_RC_LOCAL_MYSQL_CONTAINER
      || requestedRedisContainer !== ENGINEERING_RC_LOCAL_REDIS_CONTAINER
    )
  ) {
    throw new Error(
      "Stage 4A container overrides require the canonical GitHub Actions workflow",
    );
  }
  const mysqlContainer = safeContainerName(
    githubActions
      ? requestedMysqlContainer
      : ENGINEERING_RC_LOCAL_MYSQL_CONTAINER,
    "XLB_STAGE4A_MYSQL_CONTAINER",
  );
  const redisContainer = safeContainerName(
    githubActions
      ? requestedRedisContainer
      : ENGINEERING_RC_LOCAL_REDIS_CONTAINER,
    "XLB_STAGE4A_REDIS_CONTAINER",
  );

  Object.assign(environment, {
    NODE_ENV: "test",
    BACKEND_HOST: "127.0.0.1",
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: mysqlPort,
    MYSQL_DATABASE: "xlb_local",
    MYSQL_USER: nonEmptySourceValue(
      source,
      "XLB_ENGINEERING_RC_MYSQL_USER",
      "xlb",
    ),
    MYSQL_PASSWORD:
      sourceValue(source, "XLB_ENGINEERING_RC_MYSQL_PASSWORD")
      ?? "xlb_local_password",
    MYSQL_ROOT_USER: nonEmptySourceValue(
      source,
      "XLB_ENGINEERING_RC_MYSQL_ROOT_USER",
      "root",
    ),
    MYSQL_ROOT_PASSWORD:
      sourceValue(source, "XLB_ENGINEERING_RC_MYSQL_ROOT_PASSWORD")
      ?? "xlb_root_password",
    MYSQL_TLS_ENABLED: "false",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: redisPort,
    REDIS_PASSWORD:
      sourceValue(source, "XLB_ENGINEERING_RC_REDIS_PASSWORD") ?? "",
    REDIS_TLS_ENABLED: "false",
    XLB_STAGE2C3_REDIS_PORT: redisPort,
    XLB_SKIP_DB_TESTS: "0",
    XLB_EXCLUDE_TKE_TESTS: "1",
    XLB_ENGINEERING_RC: "1",
    XLB_ENGINEERING_RC_CONTAINER_MODE:
      githubActions ? "github-actions" : "local",
    XLB_PLAYWRIGHT_REUSE_EXISTING_SERVER: "false",
    XLB_AUDIT_REGISTRY: ENGINEERING_RC_AUDIT_REGISTRY,
    PAYMENT_MOCK_WEBHOOK_ENABLED: "false",
    PAYMENT_MOCK_WEBHOOK_SECRET: "",
    MYSQL_CONTAINER: mysqlContainer,
    XLB_STAGE4A_MYSQL_CONTAINER: mysqlContainer,
    XLB_STAGE4A_REDIS_CONTAINER: redisContainer,
    ...ENGINEERING_RC_PROVIDER_ISOLATION,
  });

  for (const name of Object.keys(environment)) {
    if (
      providerCredentialName.test(name)
      && name !== "PAYMENT_MOCK_WEBHOOK_SECRET"
    ) {
      delete environment[name];
    }
  }
  return environment;
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function pathInsideOrEqual(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function realFile(filePath, label) {
  if (!filePath || !path.isAbsolute(filePath) || !fs.existsSync(filePath)) {
    throw new Error(`${label} is unavailable`);
  }
  const resolved = fs.realpathSync.native(filePath);
  if (!fs.statSync(resolved).isFile()) throw new Error(`${label} is not a file`);
  return resolved;
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

export function sha256DirectoryTree(directory) {
  const root = fs.realpathSync.native(directory);
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("pnpm package tree must not contain symbolic links");
      }
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      } else {
        throw new Error("pnpm package tree contains an unsupported entry");
      }
    }
  };
  visit(root);
  files.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const hash = createHash("sha256");
  for (const filePath of files) {
    hash.update(path.relative(root, filePath).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function defaultCorepackCandidates(nodePath) {
  const nodeDirectory = path.dirname(nodePath);
  return [
    path.join(
      nodeDirectory,
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    ),
    path.resolve(
      nodeDirectory,
      "..",
      "lib",
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    ),
    path.resolve(
      nodeDirectory,
      "..",
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    ),
  ];
}

function defaultCorepackHome(platform = process.platform) {
  const home = os.userInfo().homedir;
  if (!path.isAbsolute(home)) {
    throw new Error("the operating-system user home is unavailable");
  }
  return platform === "win32"
    ? path.join(home, "AppData", "Local", "node", "corepack")
    : path.join(home, ".cache", "node", "corepack");
}

function probeVersion(
  spawn,
  command,
  args,
  { cwd, environment, label },
) {
  const result = spawn(command, args, {
    cwd,
    encoding: "utf8",
    env: environment,
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
  const version = String(result.stdout ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (version !== ENGINEERING_RC_PNPM_VERSION) {
    throw new Error(
      `${label} returned ${version ?? "no version"}; expected ${ENGINEERING_RC_PNPM_VERSION}`,
    );
  }
}

function corepackMetadata(corepackEntry) {
  const entry = realFile(corepackEntry, "Node-adjacent Corepack entry");
  const packageRoot = fs.realpathSync.native(
    path.resolve(path.dirname(entry), ".."),
  );
  const manifest = readJsonFile(
    path.join(packageRoot, "package.json"),
    "Corepack package manifest",
  );
  if (
    manifest.name !== "corepack"
    || !/^\d+\.\d+\.\d+(?:[-+].+)?$/u.test(manifest.version ?? "")
  ) {
    throw new Error("Node-adjacent Corepack package identity is invalid");
  }
  const declaredEntry = typeof manifest.bin === "object"
    ? manifest.bin?.corepack
    : manifest.bin;
  if (typeof declaredEntry !== "string") {
    throw new Error("Corepack package does not declare its entry");
  }
  const declaredRealEntry = realFile(
    path.resolve(packageRoot, declaredEntry),
    "declared Corepack entry",
  );
  if (
    declaredRealEntry !== entry
    || !pathInsideOrEqual(packageRoot, declaredRealEntry)
  ) {
    throw new Error("Corepack entry does not match its package manifest");
  }
  return {
    packageName: manifest.name,
    packageVersion: manifest.version,
    packageRoot,
    entryPath: entry,
    entrySha256: sha256File(entry),
    packageTreeSha256: sha256DirectoryTree(packageRoot),
  };
}

export function resolveControlledPnpmInvocation({
  root,
  environment,
  execPath = process.execPath,
  spawn = spawnSync,
  corepackCandidates,
  corepackHome = defaultCorepackHome(),
  pins = ENGINEERING_RC_PNPM_RUNTIME_PINS,
  corepackPins = ENGINEERING_RC_COREPACK_RUNTIME_PINS,
} = {}) {
  if (!root || !path.isAbsolute(root)) {
    throw new Error("repository root must be absolute");
  }
  const projectManifest = readJsonFile(
    path.join(root, "package.json"),
    "project package manifest",
  );
  if (projectManifest.packageManager !== ENGINEERING_RC_PACKAGE_MANAGER) {
    throw new Error(
      `project packageManager must be ${ENGINEERING_RC_PACKAGE_MANAGER}`,
    );
  }

  const nodePath = realFile(execPath, "Node executable");
  const candidates = corepackCandidates ?? defaultCorepackCandidates(nodePath);
  const corepackEntry = candidates.find(
    (candidate) => path.isAbsolute(candidate) && fs.existsSync(candidate),
  );
  if (!corepackEntry) {
    throw new Error("Node-adjacent Corepack entry is unavailable");
  }
  const launcher = corepackMetadata(corepackEntry);
  if (
    launcher.packageVersion !== corepackPins.version
    || launcher.entrySha256 !== corepackPins.entrySha256
    || launcher.packageTreeSha256 !== corepackPins.packageTreeSha256
  ) {
    throw new Error("Node-adjacent Corepack does not match the pinned runtime");
  }

  const controlledCorepackHome = path.resolve(corepackHome);
  fs.mkdirSync(controlledCorepackHome, { recursive: true });
  const corepackEnvironment = {
    ...environment,
    COREPACK_HOME: controlledCorepackHome,
  };
  probeVersion(
    spawn,
    nodePath,
    [launcher.entryPath, ENGINEERING_RC_PACKAGE_MANAGER, "--version"],
    {
      cwd: root,
      environment: corepackEnvironment,
      label: `Corepack ${ENGINEERING_RC_PACKAGE_MANAGER}`,
    },
  );

  const packageRoot = fs.realpathSync.native(
    path.join(
      controlledCorepackHome,
      "v1",
      "pnpm",
      ENGINEERING_RC_PNPM_VERSION,
    ),
  );
  const manifest = readJsonFile(
    path.join(packageRoot, "package.json"),
    "pnpm package manifest",
  );
  const corepackRecord = readJsonFile(
    path.join(packageRoot, ".corepack"),
    "pnpm Corepack record",
  );
  if (
    manifest.name !== "pnpm"
    || manifest.version !== ENGINEERING_RC_PNPM_VERSION
    || corepackRecord.locator?.name !== "pnpm"
    || corepackRecord.locator?.reference !== ENGINEERING_RC_PNPM_VERSION
    || corepackRecord.hash !== pins.integrity
  ) {
    throw new Error("resolved pnpm package identity or integrity is invalid");
  }
  const manifestEntry = typeof manifest.bin === "object"
    ? manifest.bin?.pnpm
    : manifest.bin;
  const recordedEntry = corepackRecord.bin?.pnpm;
  if (
    typeof manifestEntry !== "string"
    || typeof recordedEntry !== "string"
    || path.normalize(manifestEntry) !== path.normalize(recordedEntry)
  ) {
    throw new Error("pnpm entry does not match package and Corepack metadata");
  }
  const entryPath = realFile(
    path.resolve(packageRoot, manifestEntry),
    "pnpm entry",
  );
  if (!pathInsideOrEqual(packageRoot, entryPath)) {
    throw new Error("pnpm entry escapes its authenticated package");
  }
  const entrySha256 = sha256File(entryPath);
  if (entrySha256 !== pins.entrySha256) {
    throw new Error("pnpm entry SHA-256 does not match the pinned runtime");
  }
  const packageTreeSha256 = sha256DirectoryTree(packageRoot);
  if (packageTreeSha256 !== pins.packageTreeSha256) {
    throw new Error("pnpm package tree SHA-256 does not match the pinned runtime");
  }
  probeVersion(spawn, nodePath, [entryPath, "--version"], {
    cwd: root,
    environment,
    label: "resolved pnpm entry",
  });

  return {
    command: nodePath,
    prefix: [entryPath],
    metadata: {
      packageManager: ENGINEERING_RC_PACKAGE_MANAGER,
      packageName: manifest.name,
      packageVersion: manifest.version,
      packageRoot,
      packageIntegrity: corepackRecord.hash,
      packageTreeSha256,
      entryPath,
      entrySha256,
      nodePath,
      launcher,
    },
  };
}

function quotePosix(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function writeExecutable(filePath, content, mode) {
  fs.writeFileSync(filePath, content, { encoding: "utf8", mode });
  if (mode) fs.chmodSync(filePath, mode);
}

export function createControlledPnpmEnvironment(
  environment,
  runtime,
  {
    shimRoot,
    configRoot = path.join(path.dirname(shimRoot ?? ""), "config"),
    platform = process.platform,
  } = {},
) {
  if (!shimRoot || !path.isAbsolute(shimRoot)) {
    throw new Error("controlled pnpm shim root must be absolute");
  }
  fs.mkdirSync(shimRoot, { recursive: true });
  const resolvedShimRoot = fs.realpathSync.native(shimRoot);
  if (!configRoot || !path.isAbsolute(configRoot)) {
    throw new Error("controlled pnpm config root must be absolute");
  }
  fs.mkdirSync(configRoot, { recursive: true });
  const resolvedConfigRoot = fs.realpathSync.native(configRoot);
  const userConfigPath = path.join(resolvedConfigRoot, "user.npmrc");
  const globalConfigPath = path.join(resolvedConfigRoot, "global.npmrc");
  writeExecutable(
    userConfigPath,
    "# XLB engineering RC controlled user configuration\n",
  );
  writeExecutable(
    globalConfigPath,
    "# XLB engineering RC controlled global configuration\n",
  );
  const cachePath = path.join(resolvedConfigRoot, "cache");
  const storePath = path.join(resolvedConfigRoot, "store");
  fs.mkdirSync(cachePath, { recursive: true });
  fs.mkdirSync(storePath, { recursive: true });
  const { nodePath, entryPath } = runtime.metadata;
  let shimPath;
  if (platform === "win32") {
    if (/[\r\n"%]/u.test(nodePath) || /[\r\n"%]/u.test(entryPath)) {
      throw new Error("controlled pnpm paths are unsafe for a Windows shim");
    }
    shimPath = path.join(resolvedShimRoot, "pnpm.cmd");
    writeExecutable(
      shimPath,
      `@echo off\r\n"${nodePath}" "${entryPath}" %*\r\n`,
    );
    writeExecutable(
      path.join(resolvedShimRoot, "pnpx.cmd"),
      `@echo off\r\n"${nodePath}" "${entryPath}" dlx %*\r\n`,
    );
  } else {
    shimPath = path.join(resolvedShimRoot, "pnpm");
    writeExecutable(
      shimPath,
      `#!/bin/sh\nexec ${quotePosix(nodePath)} ${quotePosix(entryPath)} "$@"\n`,
      0o755,
    );
    writeExecutable(
      path.join(resolvedShimRoot, "pnpx"),
      `#!/bin/sh\nexec ${quotePosix(nodePath)} ${quotePosix(entryPath)} dlx "$@"\n`,
      0o755,
    );
  }
  const pathValue = environment.PATH ?? "";
  return {
    ...environment,
    PATH: pathValue
      ? `${resolvedShimRoot}${path.delimiter}${pathValue}`
      : resolvedShimRoot,
    npm_execpath: entryPath,
    npm_node_execpath: nodePath,
    NPM_CONFIG_CACHE: cachePath,
    NPM_CONFIG_GLOBALCONFIG: globalConfigPath,
    NPM_CONFIG_IGNORE_SCRIPTS: "false",
    NPM_CONFIG_REGISTRY: ENGINEERING_RC_AUDIT_REGISTRY,
    NPM_CONFIG_STORE_DIR: storePath,
    NPM_CONFIG_STRICT_SSL: "true",
    NPM_CONFIG_USERCONFIG: userConfigPath,
    NPM_CONFIG_VERIFY_STORE_INTEGRITY: "true",
    XLB_ENGINEERING_RC_NODE_ENTRY: nodePath,
    XLB_ENGINEERING_RC_PNPM_ENTRY: entryPath,
    XLB_ENGINEERING_RC_PNPM_ENTRY_SHA256:
      runtime.metadata.entrySha256,
    XLB_ENGINEERING_RC_PNPM_PACKAGE_ROOT:
      runtime.metadata.packageRoot,
    XLB_ENGINEERING_RC_PNPM_PACKAGE_TREE_SHA256:
      runtime.metadata.packageTreeSha256,
    XLB_ENGINEERING_RC_PNPM_PACKAGE_INTEGRITY:
      runtime.metadata.packageIntegrity,
    XLB_ENGINEERING_RC_PNPM_PACKAGE_MANAGER:
      runtime.metadata.packageManager,
    XLB_ENGINEERING_RC_COREPACK_ENTRY:
      runtime.metadata.launcher.entryPath,
    XLB_ENGINEERING_RC_COREPACK_ENTRY_SHA256:
      runtime.metadata.launcher.entrySha256,
    XLB_ENGINEERING_RC_COREPACK_VERSION:
      runtime.metadata.launcher.packageVersion,
    XLB_ENGINEERING_RC_COREPACK_PACKAGE_TREE_SHA256:
      runtime.metadata.launcher.packageTreeSha256,
    XLB_ENGINEERING_RC_PNPM_SHIM_ROOT: resolvedShimRoot,
    XLB_ENGINEERING_RC_PNPM_SHIM_SHA256: sha256File(shimPath),
  };
}

export function validateControlledPnpmEnvironment(
  environment,
  {
    pins = ENGINEERING_RC_PNPM_RUNTIME_PINS,
    corepackPins = ENGINEERING_RC_COREPACK_RUNTIME_PINS,
  } = {},
) {
  const errors = [];
  const checkExact = (name, expected) => {
    if (environment[name] !== expected) {
      errors.push(`${name} must match the controlled pnpm runtime`);
    }
  };
  checkExact(
    "XLB_ENGINEERING_RC_PNPM_PACKAGE_MANAGER",
    ENGINEERING_RC_PACKAGE_MANAGER,
  );
  checkExact(
    "XLB_ENGINEERING_RC_PNPM_PACKAGE_INTEGRITY",
    pins.integrity,
  );
  checkExact(
    "XLB_ENGINEERING_RC_PNPM_ENTRY_SHA256",
    pins.entrySha256,
  );
  checkExact(
    "XLB_ENGINEERING_RC_PNPM_PACKAGE_TREE_SHA256",
    pins.packageTreeSha256,
  );
  checkExact(
    "XLB_ENGINEERING_RC_COREPACK_VERSION",
    corepackPins.version,
  );
  checkExact(
    "XLB_ENGINEERING_RC_COREPACK_ENTRY_SHA256",
    corepackPins.entrySha256,
  );
  checkExact(
    "XLB_ENGINEERING_RC_COREPACK_PACKAGE_TREE_SHA256",
    corepackPins.packageTreeSha256,
  );
  checkExact("NPM_CONFIG_REGISTRY", ENGINEERING_RC_AUDIT_REGISTRY);
  checkExact("NPM_CONFIG_STRICT_SSL", "true");
  checkExact("NPM_CONFIG_VERIFY_STORE_INTEGRITY", "true");
  checkExact("NPM_CONFIG_IGNORE_SCRIPTS", "false");

  try {
    const nodePath = realFile(
      environment.XLB_ENGINEERING_RC_NODE_ENTRY,
      "controlled Node entry",
    );
    const pnpmEntry = realFile(
      environment.XLB_ENGINEERING_RC_PNPM_ENTRY,
      "controlled pnpm entry",
    );
    const packageRoot = fs.realpathSync.native(
      environment.XLB_ENGINEERING_RC_PNPM_PACKAGE_ROOT,
    );
    if (!pathInsideOrEqual(packageRoot, pnpmEntry)) {
      throw new Error("controlled pnpm entry escapes its package");
    }
    checkExact("npm_execpath", pnpmEntry);
    checkExact("npm_node_execpath", nodePath);
    if (sha256File(pnpmEntry) !== pins.entrySha256) {
      errors.push("controlled pnpm entry SHA-256 is invalid");
    }
    if (sha256DirectoryTree(packageRoot) !== pins.packageTreeSha256) {
      errors.push("controlled pnpm package tree SHA-256 is invalid");
    }
    const manifest = readJsonFile(
      path.join(packageRoot, "package.json"),
      "controlled pnpm package manifest",
    );
    if (
      manifest.name !== "pnpm"
      || manifest.version !== ENGINEERING_RC_PNPM_VERSION
    ) {
      errors.push("controlled pnpm package name or version is invalid");
    }

    const corepackEntry = realFile(
      environment.XLB_ENGINEERING_RC_COREPACK_ENTRY,
      "controlled Corepack entry",
    );
    if (
      sha256File(corepackEntry)
      !== environment.XLB_ENGINEERING_RC_COREPACK_ENTRY_SHA256
    ) {
      errors.push("controlled Corepack entry SHA-256 is invalid");
    }
    const corepack = corepackMetadata(corepackEntry);
    if (
      corepack.packageVersion !== corepackPins.version
      || corepack.entrySha256 !== corepackPins.entrySha256
      || corepack.packageTreeSha256 !== corepackPins.packageTreeSha256
    ) {
      errors.push("controlled Corepack runtime is invalid");
    }

    const shimRoot = fs.realpathSync.native(
      environment.XLB_ENGINEERING_RC_PNPM_SHIM_ROOT,
    );
    const firstPath = String(environment.PATH ?? "").split(path.delimiter)[0];
    if (fs.realpathSync.native(firstPath) !== shimRoot) {
      errors.push("controlled pnpm shim must be first on PATH");
    }
    const shimName = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    if (
      sha256File(path.join(shimRoot, shimName))
      !== environment.XLB_ENGINEERING_RC_PNPM_SHIM_SHA256
    ) {
      errors.push("controlled pnpm shim SHA-256 is invalid");
    }

    const expectedConfig =
      "# XLB engineering RC controlled user configuration\n";
    const userConfig = realFile(
      environment.NPM_CONFIG_USERCONFIG,
      "controlled npm user config",
    );
    const globalConfig = realFile(
      environment.NPM_CONFIG_GLOBALCONFIG,
      "controlled npm global config",
    );
    if (
      fs.readFileSync(userConfig, "utf8") !== expectedConfig
      || fs.readFileSync(globalConfig, "utf8")
        !== "# XLB engineering RC controlled global configuration\n"
    ) {
      errors.push("controlled npm configuration files are invalid");
    }
    for (const [name, label] of [
      ["NPM_CONFIG_CACHE", "controlled npm cache"],
      ["NPM_CONFIG_STORE_DIR", "controlled pnpm store"],
    ]) {
      const directory = fs.realpathSync.native(environment[name]);
      if (!fs.statSync(directory).isDirectory()) {
        errors.push(`${label} is not a directory`);
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

function dockerCommand(spawn, args, environment) {
  const result = spawn("docker", args, {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed`);
  }
  return String(result.stdout ?? "").trim();
}

export function isLocalDockerEndpoint(endpoint) {
  const normalized = String(endpoint ?? "").toLowerCase();
  if (normalized.startsWith("unix:///")) {
    const socketPath = normalized.slice("unix://".length);
    return socketPath.startsWith("/")
      && !socketPath.startsWith("//")
      && !/[?#]/u.test(socketPath);
  }
  if (normalized.startsWith("npipe:////./pipe/")) {
    const pipeName = normalized.slice("npipe:////./pipe/".length);
    return Boolean(pipeName) && !/[/?#]/u.test(pipeName);
  }
  return false;
}

function inspectContainer(
  spawn,
  environment,
  name,
  expectedImage,
  containerPort,
  hostPort,
  role,
) {
  const payload = readDockerJson(
    dockerCommand(
      spawn,
      ["container", "inspect", name],
      environment,
    ),
    `${role} Docker container inspection`,
  );
  const container = Array.isArray(payload) ? payload[0] : null;
  const portKey = `${containerPort}/tcp`;
  const bindings = container?.NetworkSettings?.Ports?.[portKey];
  const matchingBindings = Array.isArray(bindings)
    ? bindings
      .filter((binding) =>
        binding?.HostPort === hostPort
        && ["", "0.0.0.0", "::", "127.0.0.1", "::1"]
          .includes(binding?.HostIp ?? ""))
      .map((binding) => ({
        hostIp: binding.HostIp ?? "",
        hostPort: binding.HostPort,
      }))
      .sort((left, right) =>
        `${left.hostIp}:${left.hostPort}`
          .localeCompare(`${right.hostIp}:${right.hostPort}`))
    : [];
  if (
    !container
    || !/^[a-f0-9]{64}$/u.test(container.Id ?? "")
    || container.Config?.Image !== expectedImage
    || !/^sha256:[a-f0-9]{64}$/u.test(container.Image ?? "")
    || container.State?.Running !== true
    || (
      container.State?.Health
      && container.State.Health.Status !== "healthy"
    )
    || container.HostConfig?.Privileged !== false
    || container.HostConfig?.NetworkMode === "host"
    || matchingBindings.length === 0
  ) {
    throw new Error(
      `${role} container must be a healthy, unprivileged ${expectedImage} instance bound to local port ${hostPort}`,
    );
  }
  const manifestDigest = container.ImageManifestDescriptor?.digest ?? null;
  if (
    manifestDigest !== null
    && !/^sha256:[a-f0-9]{64}$/u.test(manifestDigest)
  ) {
    throw new Error(`${role} container manifest digest is invalid`);
  }
  return {
    name,
    id: container.Id,
    image: container.Config.Image,
    imageId: container.Image,
    manifestDigest,
    running: true,
    healthy:
      !container.State.Health || container.State.Health.Status === "healthy",
    privileged: false,
    networkMode: container.HostConfig.NetworkMode,
    port: {
      container: portKey,
      host: hostPort,
      bindings: matchingBindings,
    },
  };
}

function readDockerJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

export function inspectEngineeringRcDocker({
  environment,
  spawn = spawnSync,
} = {}) {
  const context = dockerCommand(spawn, ["context", "show"], environment);
  if (
    !context
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(context)
  ) {
    throw new Error("Docker context name is invalid");
  }
  if (
    environment.DOCKER_CONTEXT
    && environment.DOCKER_CONTEXT !== context
  ) {
    throw new Error("DOCKER_CONTEXT does not match docker context show");
  }
  const contextPayload = readDockerJson(
    dockerCommand(
      spawn,
      ["context", "inspect", context],
      environment,
    ),
    "Docker context inspection",
  );
  const inspectedContext = Array.isArray(contextPayload)
    ? contextPayload[0]
    : null;
  const endpoint = inspectedContext?.Endpoints?.docker?.Host;
  if (!isLocalDockerEndpoint(endpoint)) {
    throw new Error("engineering RC requires a local unix:// or npipe:// Docker daemon");
  }

  const githubActions = isTrustedEngineeringRcGithubActions(environment);
  if (
    environment.XLB_ENGINEERING_RC_CONTAINER_MODE
    !== (githubActions ? "github-actions" : "local")
  ) {
    throw new Error("engineering RC container mode does not match CI provenance");
  }
  const mysqlContainer = environment.XLB_STAGE4A_MYSQL_CONTAINER;
  const redisContainer = environment.XLB_STAGE4A_REDIS_CONTAINER;
  if (
    !githubActions
    && (
      mysqlContainer !== ENGINEERING_RC_LOCAL_MYSQL_CONTAINER
      || redisContainer !== ENGINEERING_RC_LOCAL_REDIS_CONTAINER
    )
  ) {
    throw new Error("local engineering RC must use the canonical XLB containers");
  }
  safeContainerName(mysqlContainer, "XLB_STAGE4A_MYSQL_CONTAINER");
  safeContainerName(redisContainer, "XLB_STAGE4A_REDIS_CONTAINER");

  return {
    context,
    endpoint,
    containers: {
      mysql: inspectContainer(
        spawn,
        environment,
        mysqlContainer,
        "mysql:8",
        "3306",
        environment.MYSQL_PORT,
        "MySQL",
      ),
      redis: inspectContainer(
        spawn,
        environment,
        redisContainer,
        "redis:7",
        "6379",
        environment.REDIS_PORT,
        "Redis",
      ),
    },
  };
}

export function assertEngineeringRcDockerBinding({
  environment,
  expected,
  spawn = spawnSync,
} = {}) {
  const current = inspectEngineeringRcDocker({ environment, spawn });
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error(
      "Docker context, container instance, image, or port binding changed during the engineering RC",
    );
  }
  return current;
}

export function bindEngineeringRcDockerEnvironment(environment, docker) {
  return {
    ...environment,
    DOCKER_CONTEXT: docker.context,
    XLB_ENGINEERING_RC_DOCKER_CONTEXT: docker.context,
    XLB_ENGINEERING_RC_DOCKER_ENDPOINT: docker.endpoint,
  };
}
