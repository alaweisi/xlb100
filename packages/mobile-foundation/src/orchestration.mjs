import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveMobileEnvironment } from "./environment.mjs";
import {
  validateAndroidBoundaries,
  validateBuiltApk,
  writeDebugNetworkSecurityConfig,
} from "./android-security.mjs";
import { probeAndroidToolchain } from "./toolchain.mjs";

function packageManagerInvocation(args, options = {}) {
  const packageManagerEntry = options.environment?.npm_execpath ?? process.env.npm_execpath;
  if (!packageManagerEntry) {
    throw new Error("Run mobile commands through pnpm so npm_execpath is available");
  }
  return {
    command: process.execPath,
    args: [packageManagerEntry, ...args],
  };
}

function run(command, args, options) {
  const result = (options.spawn ?? spawnSync)(command, args, {
    cwd: options.cwd,
    env: options.environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${options.label} failed with exit code ${result.status ?? 1}`);
  }
}

export function createWebBuildPlan(app, profileName, environment = process.env) {
  const mobileEnvironment = resolveMobileEnvironment(app, profileName, environment);
  return Object.freeze({
    environment: mobileEnvironment,
    dependencyBuild: Object.freeze({
      cwd: app.paths.workspaceRoot,
      args: ["--filter", `${app.web.packageName}^...`, "build"],
    }),
    webBuild: Object.freeze({
      cwd: app.paths.webRoot,
      args: [
        "exec",
        "vite",
        "build",
        "--mode",
        mobileEnvironment.profile,
        "--base",
        mobileEnvironment.publicBase,
        "--outDir",
        app.web.outputDirectory,
        "--emptyOutDir",
      ],
      environment: Object.freeze({
        [app.web.apiBaseBuildVariable]: mobileEnvironment.apiBaseUrl,
        [app.web.appVersionBuildVariable]: app.version.name,
      }),
    }),
  });
}

export function buildWebAssets(app, profileName, options = {}) {
  const environment = options.environment ?? process.env;
  const plan = createWebBuildPlan(app, profileName, environment);
  const dependencyCommand = packageManagerInvocation(plan.dependencyBuild.args, {
    environment,
  });
  run(dependencyCommand.command, dependencyCommand.args, {
    ...options,
    cwd: plan.dependencyBuild.cwd,
    environment,
    label: `${app.key} web dependency build`,
  });
  const webCommand = packageManagerInvocation(plan.webBuild.args, { environment });
  run(webCommand.command, webCommand.args, {
    ...options,
    cwd: plan.webBuild.cwd,
    environment: {
      ...environment,
      XLB_PUBLIC_BASE: plan.environment.publicBase,
      ...plan.webBuild.environment,
    },
    label: `${app.key} mobile web build`,
  });
  return plan;
}

export function syncCapacitorAndroid(app, options = {}) {
  writeDebugNetworkSecurityConfig(app);
  validateAndroidBoundaries(app);
  const environment = options.environment ?? process.env;
  const invocation = packageManagerInvocation(["exec", "cap", "sync", "android"], {
    environment,
  });
  run(invocation.command, invocation.args, {
    ...options,
    cwd: app.paths.mobileRoot,
    environment,
    label: `${app.key} Capacitor sync`,
  });
  validateAndroidBoundaries(app);
}

export function runGradleTask(app, task, options = {}) {
  if (!["assembleDebug", "assembleRelease"].includes(task)) {
    throw new Error("Expected Gradle task assembleDebug or assembleRelease");
  }
  validateAndroidBoundaries(app);
  const environment = options.environment ?? process.env;
  const toolchain = probeAndroidToolchain(app, {
    ...options,
    environment,
  });
  const windows = (options.platform ?? process.platform) === "win32";
  const command = windows
    ? environment.ComSpec ?? process.env.ComSpec ?? "cmd.exe"
    : toolchain.gradleExecutable;
  const args = windows
    ? ["/d", "/c", toolchain.gradleExecutable, task, "--stacktrace"]
    : [task, "--stacktrace"];
  run(command, args, {
    ...options,
    cwd: app.paths.androidRoot,
    environment: {
      ...environment,
      JAVA_HOME: toolchain.javaHome,
      ANDROID_HOME: toolchain.androidSdk,
      ANDROID_SDK_ROOT: toolchain.androidSdk,
    },
    label: `${app.key} Gradle ${task}`,
  });
  return toolchain;
}

export function buildAndroidApp(app, profileName, variant, options = {}) {
  const expectedProfile = variant === "debug" ? "test" : "production";
  if (!["debug", "release"].includes(variant) || profileName !== expectedProfile) {
    throw new Error(
      "Android build boundary requires test/debug or production/release",
    );
  }
  buildWebAssets(app, profileName, options);
  syncCapacitorAndroid(app, options);
  const toolchain = runGradleTask(
    app,
    variant === "debug" ? "assembleDebug" : "assembleRelease",
    options,
  );
  const apkPath = expectedApkPath(app, variant);
  const apk = validateBuiltApk(app, apkPath, {
    androidSdk: toolchain.androidSdk,
    variant,
    platform: options.platform ?? process.platform,
  });
  return Object.freeze({ toolchain, apk });
}

export function expectedApkPath(app, variant) {
  return path.join(
    app.paths.androidRoot,
    "app",
    "build",
    "outputs",
    "apk",
    variant,
    `app-${variant}.apk`,
  );
}
