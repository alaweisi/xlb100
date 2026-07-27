import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateEngineeringRcEnvironment } from
  "./check-engineering-rc-environment.mjs";
import {
  ENGINEERING_RC_AUDIT_REGISTRY,
  assertEngineeringRcDockerBinding,
  bindEngineeringRcDockerEnvironment,
  createControlledPnpmEnvironment,
  createEngineeringRcEnvironment,
  inspectEngineeringRcDocker,
  resolveControlledPnpmInvocation,
  sha256DirectoryTree,
  sha256File,
  validateControlledPnpmEnvironment,
} from "./engineering-rc-runtime.mjs";

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createRuntimeFixture(t) {
  const fixtureRoot = temporaryDirectory(t, "xlb-engineering-rc-runtime-");
  const repositoryRoot = path.join(fixtureRoot, "repository");
  const nodePath = path.join(fixtureRoot, "node", "node.exe");
  const corepackRoot = path.join(fixtureRoot, "corepack");
  const corepackEntry = path.join(corepackRoot, "dist", "corepack.js");
  const corepackHome = path.join(fixtureRoot, "corepack-home");
  const packageRoot = path.join(corepackHome, "v1", "pnpm", "9.15.0");
  const pnpmEntry = path.join(packageRoot, "bin", "pnpm.cjs");
  const nodeGypBin = path.join(packageRoot, "dist", "node-gyp-bin");
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.mkdirSync(path.dirname(corepackEntry), { recursive: true });
  fs.mkdirSync(path.dirname(pnpmEntry), { recursive: true });
  fs.mkdirSync(nodeGypBin, { recursive: true });
  fs.writeFileSync(nodePath, "fixture node", "utf8");
  fs.writeFileSync(corepackEntry, "fixture corepack", "utf8");
  fs.writeFileSync(pnpmEntry, "fixture pnpm", "utf8");
  writeJson(path.join(repositoryRoot, "package.json"), {
    name: "fixture",
    packageManager: "pnpm@9.15.0",
  });
  writeJson(path.join(corepackRoot, "package.json"), {
    name: "corepack",
    version: "0.34.6",
    bin: { corepack: "./dist/corepack.js" },
  });
  writeJson(path.join(packageRoot, "package.json"), {
    name: "pnpm",
    version: "9.15.0",
    bin: { pnpm: "./bin/pnpm.cjs" },
  });
  const integrity = "sha512.fixture-integrity";
  writeJson(path.join(packageRoot, ".corepack"), {
    locator: { name: "pnpm", reference: "9.15.0" },
    bin: { pnpm: "./bin/pnpm.cjs" },
    hash: integrity,
  });
  const pins = {
    integrity,
    entrySha256: sha256File(pnpmEntry),
    packageTreeSha256: sha256DirectoryTree(packageRoot),
  };
  const corepackPins = {
    version: "0.34.6",
    entrySha256: sha256File(corepackEntry),
    packageTreeSha256: sha256DirectoryTree(corepackRoot),
  };
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: "9.15.0\n", stderr: "" };
  };
  return {
    fixtureRoot,
    repositoryRoot,
    nodePath,
    corepackEntry,
    corepackHome,
    packageRoot,
    pnpmEntry,
    nodeGypBin,
    pins,
    corepackPins,
    calls,
    spawn,
  };
}

function dockerSpawn({
  context = "desktop-linux",
  endpoint = "npipe:////./pipe/dockerDesktopLinuxEngine",
  mysqlName = "xlb-mysql-local",
  redisName = "xlb-redis-local",
  mysqlImage = "mysql:8",
  redisImage = "redis:7",
  mysqlId = "a".repeat(64),
  redisId = "b".repeat(64),
} = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (args.join(" ") === "context show") {
      return { status: 0, stdout: `${context}\n`, stderr: "" };
    }
    if (args.join(" ") === `context inspect ${context}`) {
      return {
        status: 0,
        stdout: JSON.stringify([{
          Name: context,
          Endpoints: { docker: { Host: endpoint } },
        }]),
        stderr: "",
      };
    }
    const name = args.at(-1);
    if (args.slice(0, 2).join(" ") === "container inspect") {
      const image = name === mysqlName
        ? mysqlImage
        : name === redisName
          ? redisImage
          : null;
      if (!image) {
        return { status: 1, stdout: "", stderr: "unknown container" };
      }
      const mysql = name === mysqlName;
      const containerPort = mysql ? "3306/tcp" : "6379/tcp";
      const hostPort = mysql ? "3306" : "6379";
      return {
        status: 0,
        stdout: JSON.stringify([{
          Id: mysql ? mysqlId : redisId,
          Image: `sha256:${(mysql ? "c" : "d").repeat(64)}`,
          Config: { Image: image },
          State: { Running: true, Health: { Status: "healthy" } },
          HostConfig: {
            Privileged: false,
            NetworkMode: "bridge",
          },
          NetworkSettings: {
            Ports: {
              [containerPort]: [{
                HostIp: "0.0.0.0",
                HostPort: hostPort,
              }],
            },
          },
          ImageManifestDescriptor: {
            digest: `sha256:${(mysql ? "e" : "f").repeat(64)}`,
          },
        }]),
        stderr: "",
      };
    }
    return { status: 1, stdout: "", stderr: "unexpected command" };
  };
  return { calls, spawn };
}

const mobileReport = {
  signingClass: "simulation",
  reports: ["customer", "worker", "admin"].map((role) => ({
    role,
    apiHost: `${role}.engineering-rc.invalid`,
    javaMajor: 21,
    androidApi: 36,
  })),
};

test("engineering RC environment is an allowlist and removes ambient controls", () => {
  const environment = createEngineeringRcEnvironment({
    Path: "C:\\trusted-tools",
    JAVA_HOME: "C:\\jdk-21",
    ANDROID_HOME: "C:\\android",
    DOCKER_HOST: "tcp://attacker.example:2375",
    DOCKER_CONTEXT: "remote",
    DOCKER_CONFIG: "C:\\attacker-docker",
    COMPOSE_FILE: "attacker.yml",
    BUILDKIT_HOST: "tcp://attacker.example",
    MIGRATION_DIR: "C:\\attacker-migrations",
    XLB_AUDIT_REGISTRY: "https://attacker.example/",
    npm_execpath: "C:\\attacker\\pnpm.cjs",
    npm_node_execpath: "C:\\attacker\\node.exe",
    PNPM_HOME: "C:\\attacker-pnpm",
    COREPACK_HOME: "C:\\attacker-corepack",
    COREPACK_INTEGRITY_KEYS: "0",
    NPM_CONFIG_REGISTRY: "https://attacker.example/",
    TURBO_TOKEN: "attacker",
    NODE_OPTIONS: "--require=C:\\attacker.js",
    NODE_PATH: "C:\\attacker-modules",
    GIT_DIR: "C:\\attacker-git",
    HTTP_PROXY: "http://attacker.example:8080",
    SSL_CERT_FILE: "C:\\attacker-ca.pem",
    NODE_EXTRA_CA_CERTS: "C:\\attacker-ca.pem",
    XLB_PAYMENT_SECRET_KEY: "secret",
    UNLISTED_AMBIENT_VALUE: "must-not-survive",
  });
  assert.equal(environment.PATH, "C:\\trusted-tools");
  assert.equal(environment.JAVA_HOME, "C:\\jdk-21");
  assert.equal(environment.ANDROID_HOME, "C:\\android");
  assert.equal(environment.XLB_AUDIT_REGISTRY, ENGINEERING_RC_AUDIT_REGISTRY);
  assert.equal(environment.MYSQL_HOST, "127.0.0.1");
  assert.equal(environment.REDIS_HOST, "127.0.0.1");
  assert.equal(environment.XLB_STAGE4A_MYSQL_CONTAINER, "xlb-mysql-local");
  assert.equal(environment.XLB_STAGE4A_REDIS_CONTAINER, "xlb-redis-local");
  for (const name of [
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
    "COMPOSE_FILE",
    "BUILDKIT_HOST",
    "MIGRATION_DIR",
    "npm_execpath",
    "npm_node_execpath",
    "PNPM_HOME",
    "COREPACK_HOME",
    "COREPACK_INTEGRITY_KEYS",
    "NPM_CONFIG_REGISTRY",
    "TURBO_TOKEN",
    "NODE_OPTIONS",
    "NODE_PATH",
    "GIT_DIR",
    "HTTP_PROXY",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
    "XLB_PAYMENT_SECRET_KEY",
    "UNLISTED_AMBIENT_VALUE",
  ]) {
    assert.equal(environment[name], undefined, `${name} must be removed`);
  }
});

test("container overrides require the canonical GitHub Actions provenance", () => {
  assert.throws(
    () => createEngineeringRcEnvironment({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "fork/xlb100",
      GITHUB_REPOSITORY_ID: "999",
      GITHUB_WORKFLOW_REF:
        "fork/xlb100/.github/workflows/ci.yml@refs/heads/main",
      XLB_STAGE4A_MYSQL_CONTAINER: "ci-mysql-id",
      XLB_STAGE4A_REDIS_CONTAINER: "ci-redis-id",
    }),
    /canonical GitHub Actions workflow/u,
  );
  const environment = createEngineeringRcEnvironment({
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "alaweisi/xlb100",
    GITHUB_REPOSITORY_ID: "1287812965",
    GITHUB_WORKFLOW_REF:
      "alaweisi/xlb100/.github/workflows/ci.yml@refs/heads/main",
    XLB_STAGE4A_MYSQL_CONTAINER: "ci-mysql-id",
    XLB_STAGE4A_REDIS_CONTAINER: "ci-redis-id",
  });
  assert.equal(environment.XLB_ENGINEERING_RC_CONTAINER_MODE, "github-actions");
  assert.equal(environment.XLB_STAGE4A_MYSQL_CONTAINER, "ci-mysql-id");
  assert.equal(environment.XLB_STAGE4A_REDIS_CONTAINER, "ci-redis-id");
});

test("controlled pnpm ignores ambient npm_execpath and verifies real package metadata", (t) => {
  const fixture = createRuntimeFixture(t);
  const environment = createEngineeringRcEnvironment({
    PATH: "fixture-path",
    npm_execpath: path.join(fixture.fixtureRoot, "attacker.cjs"),
    COREPACK_HOME: path.join(fixture.fixtureRoot, "attacker-corepack"),
  });
  const runtime = resolveControlledPnpmInvocation({
    root: fixture.repositoryRoot,
    environment,
    execPath: fixture.nodePath,
    corepackCandidates: [fixture.corepackEntry],
    corepackHome: fixture.corepackHome,
    pins: fixture.pins,
    corepackPins: fixture.corepackPins,
    spawn: fixture.spawn,
  });
  assert.equal(runtime.command, fs.realpathSync.native(fixture.nodePath));
  assert.deepEqual(runtime.prefix, [
    fs.realpathSync.native(fixture.pnpmEntry),
  ]);
  assert.equal(runtime.metadata.packageName, "pnpm");
  assert.equal(runtime.metadata.packageVersion, "9.15.0");
  assert.equal(runtime.metadata.entrySha256, fixture.pins.entrySha256);
  assert.equal(
    runtime.metadata.packageTreeSha256,
    fixture.pins.packageTreeSha256,
  );
  assert.deepEqual(
    fixture.calls.map((entry) => entry.args),
    [
      [fs.realpathSync.native(fixture.corepackEntry), "pnpm@9.15.0", "--version"],
      [fs.realpathSync.native(fixture.pnpmEntry), "--version"],
    ],
  );
  assert.equal(
    fixture.calls[0].options.env.COREPACK_HOME,
    path.resolve(fixture.corepackHome),
  );
  assert.equal(fixture.calls[0].options.env.npm_execpath, undefined);
});

test("controlled pnpm rejects a project packageManager mismatch", (t) => {
  const fixture = createRuntimeFixture(t);
  writeJson(path.join(fixture.repositoryRoot, "package.json"), {
    name: "fixture",
    packageManager: "pnpm@10.0.0",
  });
  assert.throws(
    () => resolveControlledPnpmInvocation({
      root: fixture.repositoryRoot,
      environment: {},
      execPath: fixture.nodePath,
      corepackCandidates: [fixture.corepackEntry],
      corepackHome: fixture.corepackHome,
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
      spawn: fixture.spawn,
    }),
    /packageManager must be pnpm@9\.15\.0/u,
  );
  assert.equal(fixture.calls.length, 0);
});

test("controlled pnpm rejects Corepack tampering before execution", (t) => {
  const fixture = createRuntimeFixture(t);
  fs.appendFileSync(fixture.corepackEntry, "\ntampered\n", "utf8");
  assert.throws(
    () => resolveControlledPnpmInvocation({
      root: fixture.repositoryRoot,
      environment: {},
      execPath: fixture.nodePath,
      corepackCandidates: [fixture.corepackEntry],
      corepackHome: fixture.corepackHome,
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
      spawn: fixture.spawn,
    }),
    /Corepack does not match the pinned runtime/u,
  );
  assert.equal(fixture.calls.length, 0);
});

test("controlled pnpm environment pins nested pnpm to a verified shim", (t) => {
  const fixture = createRuntimeFixture(t);
  const runtime = resolveControlledPnpmInvocation({
    root: fixture.repositoryRoot,
    environment: { PATH: "fixture-path" },
    execPath: fixture.nodePath,
    corepackCandidates: [fixture.corepackEntry],
    corepackHome: fixture.corepackHome,
    pins: fixture.pins,
    corepackPins: fixture.corepackPins,
    spawn: fixture.spawn,
  });
  const environment = createControlledPnpmEnvironment(
    {
      PATH: "fixture-path",
      HOME: path.join(fixture.fixtureRoot, "attacker-home"),
    },
    runtime,
    { shimRoot: path.join(fixture.fixtureRoot, "trusted-bin") },
  );
  assert.equal(environment.npm_execpath, runtime.metadata.entryPath);
  assert.equal(environment.npm_node_execpath, runtime.metadata.nodePath);
  assert.equal(
    environment.PATH.split(path.delimiter)[0],
    fs.realpathSync.native(path.join(fixture.fixtureRoot, "trusted-bin")),
  );
  assert.equal(environment.NPM_CONFIG_REGISTRY, ENGINEERING_RC_AUDIT_REGISTRY);
  assert.equal(environment.NPM_CONFIG_STRICT_SSL, "true");
  assert.equal(environment.NPM_CONFIG_VERIFY_STORE_INTEGRITY, "true");
  assert.equal(environment.NPM_CONFIG_IGNORE_SCRIPTS, "false");
  assert.match(
    environment.NPM_CONFIG_USERCONFIG,
    /[\\/]config[\\/]user\.npmrc$/u,
  );
  assert.deepEqual(
    validateControlledPnpmEnvironment(environment, {
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
    }),
    [],
  );
  const workspaceBin = path.join(
    fixture.repositoryRoot,
    "node_modules",
    ".bin",
  );
  fs.mkdirSync(workspaceBin, { recursive: true });
  const scriptEnvironment = {
    ...environment,
    PATH: [
      "./node_modules/.bin",
      workspaceBin,
      fixture.nodeGypBin,
      environment.PATH,
    ].join(path.delimiter),
    npm_config_frozen_lockfile: "",
  };
  assert.deepEqual(
    validateControlledPnpmEnvironment(scriptEnvironment, {
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
    }),
    [],
  );
  fs.writeFileSync(path.join(workspaceBin, "pnpm.cmd"), "attacker", "utf8");
  assert.ok(
    validateControlledPnpmEnvironment(scriptEnvironment, {
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
    }).includes("workspace bin directories must not shadow pnpm or pnpx"),
  );
  fs.unlinkSync(path.join(workspaceBin, "pnpm.cmd"));
  assert.ok(
    validateControlledPnpmEnvironment({
      ...scriptEnvironment,
      npm_config_frozen_lockfile: "attacker",
    }, {
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
    }).some((error) => error.includes("frozen-lockfile propagation")),
  );
  fs.appendFileSync(fixture.pnpmEntry, "\ntampered\n", "utf8");
  assert.ok(
    validateControlledPnpmEnvironment(environment, {
      pins: fixture.pins,
      corepackPins: fixture.corepackPins,
    }).some((error) => /SHA-256/u.test(error)),
  );
});

test("Docker preflight accepts only a local daemon and canonical local containers", () => {
  const environment = createEngineeringRcEnvironment({ PATH: "fixture" });
  const docker = dockerSpawn();
  const metadata = inspectEngineeringRcDocker({
    environment,
    spawn: docker.spawn,
  });
  assert.equal(metadata.context, "desktop-linux");
  assert.equal(
    metadata.endpoint,
    "npipe:////./pipe/dockerDesktopLinuxEngine",
  );
  assert.equal(metadata.containers.mysql.image, "mysql:8");
  assert.equal(metadata.containers.redis.image, "redis:7");
  assert.equal(metadata.containers.mysql.port.host, "3306");
  assert.match(metadata.containers.mysql.imageId, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(
    docker.calls.map((entry) => entry.args.slice(0, 2).join(" ")),
    [
      "context show",
      "context inspect",
      "container inspect",
      "container inspect",
    ],
  );

  const remote = dockerSpawn({ endpoint: "tcp://docker.example:2376" });
  assert.throws(
    () => inspectEngineeringRcDocker({
      environment,
      spawn: remote.spawn,
    }),
    /local unix:\/\/ or npipe:\/\//u,
  );
});

test("Docker preflight verifies canonical workflow service images", () => {
  const environment = createEngineeringRcEnvironment({
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "alaweisi/xlb100",
    GITHUB_REPOSITORY_ID: "1287812965",
    GITHUB_WORKFLOW_REF:
      "alaweisi/xlb100/.github/workflows/ci.yml@refs/heads/main",
    XLB_STAGE4A_MYSQL_CONTAINER: "ci-mysql-id",
    XLB_STAGE4A_REDIS_CONTAINER: "ci-redis-id",
  });
  const valid = dockerSpawn({
    mysqlName: "ci-mysql-id",
    redisName: "ci-redis-id",
  });
  assert.doesNotThrow(() => inspectEngineeringRcDocker({
    environment,
    spawn: valid.spawn,
  }));
  const wrongImage = dockerSpawn({
    mysqlName: "ci-mysql-id",
    redisName: "ci-redis-id",
    mysqlImage: "mysql:latest",
  });
  assert.throws(
    () => inspectEngineeringRcDocker({
      environment,
      spawn: wrongImage.spawn,
    }),
    /healthy, unprivileged mysql:8 instance/u,
  );
});

test("Docker binding rejects a replaced container instance", () => {
  const environment = createEngineeringRcEnvironment({ PATH: "fixture" });
  const original = dockerSpawn();
  const expected = inspectEngineeringRcDocker({
    environment,
    spawn: original.spawn,
  });
  const replacement = dockerSpawn({ mysqlId: "9".repeat(64) });
  assert.throws(
    () => assertEngineeringRcDockerBinding({
      environment,
      expected,
      spawn: replacement.spawn,
    }),
    /changed during the engineering RC/u,
  );
});

test("environment preflight rechecks fixed Docker and rejects restored controls", () => {
  const base = createEngineeringRcEnvironment({ PATH: "fixture" });
  const docker = {
    context: "desktop-linux",
    endpoint: "unix:///var/run/docker.sock",
    containers: {},
  };
  const environment = bindEngineeringRcDockerEnvironment(base, docker);
  const options = {
    runtimeCheck: () => [],
    dockerCheck: () => docker,
    mobileCheck: () => mobileReport,
  };
  assert.deepEqual(
    validateEngineeringRcEnvironment(environment, options).errors,
    [],
  );
  const poisoned = {
    ...environment,
    DOCKER_HOST: "tcp://attacker.example:2375",
    XLB_AUDIT_REGISTRY: "https://attacker.example/",
  };
  const errors = validateEngineeringRcEnvironment(poisoned, options).errors;
  assert.ok(errors.some((error) => error.includes("DOCKER_HOST")));
  assert.ok(errors.some((error) => error.includes("canonical npm registry")));
});
