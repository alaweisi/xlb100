import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function jdkExecutable(javaHome, name, platform = process.platform) {
  if (!javaHome) return null;
  return path.join(
    javaHome,
    "bin",
    platform === "win32" ? `${name}.exe` : name,
  );
}

function validJavaHome(javaHome, options) {
  const java = jdkExecutable(javaHome, "java", options.platform);
  const javac = jdkExecutable(javaHome, "javac", options.platform);
  return Boolean(
    java &&
      javac &&
      options.exists(java) &&
      options.exists(javac) &&
      options.spawn(java, ["-version"], { stdio: "ignore" }).status === 0 &&
      options.spawn(javac, ["-version"], { stdio: "ignore" }).status === 0,
  );
}

export function resolveJavaHome({
  environment = process.env,
  platform = process.platform,
  exists = fs.existsSync,
  spawn = spawnSync,
} = {}) {
  const options = { platform, exists, spawn };
  if (validJavaHome(environment.JAVA_HOME, options)) {
    return path.resolve(environment.JAVA_HOME);
  }

  const finder = platform === "win32" ? "where.exe" : "which";
  const located = spawn(finder, ["javac"], { encoding: "utf8" });
  const first = located.stdout?.split(/\r?\n/u).find(Boolean);
  if (first) {
    const candidate = path.dirname(path.dirname(first.trim()));
    if (validJavaHome(candidate, options)) return path.resolve(candidate);
  }
  throw new Error("A valid JDK is required; JAVA_HOME and PATH were both unusable");
}

export function androidSdkCandidates(
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
) {
  return [
    environment.ANDROID_SDK_ROOT,
    environment.ANDROID_HOME,
    platform === "win32" && environment.LOCALAPPDATA
      ? path.join(environment.LOCALAPPDATA, "Android", "Sdk")
      : null,
    platform === "darwin"
      ? path.join(homeDirectory, "Library", "Android", "sdk")
      : path.join(homeDirectory, "Android", "Sdk"),
  ].filter(Boolean);
}

export function resolveAndroidSdk({
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
  exists = fs.existsSync,
} = {}) {
  const sdk = androidSdkCandidates(environment, platform, homeDirectory).find(
    (candidate) =>
      exists(path.join(candidate, "platforms")) &&
      exists(path.join(candidate, "build-tools")),
  );
  if (!sdk) {
    throw new Error(
      "Android SDK not found; set ANDROID_SDK_ROOT to an SDK containing platforms and build-tools",
    );
  }
  return path.resolve(sdk);
}

export function resolveGradleExecutable(
  androidRoot,
  {
    environment = process.env,
    platform = process.platform,
    exists = fs.existsSync,
  } = {},
) {
  const wrapper = path.join(
    androidRoot,
    platform === "win32" ? "gradlew.bat" : "gradlew",
  );
  if (!exists(wrapper)) {
    throw new Error("Android Gradle wrapper is missing from the app-owned Android project");
  }
  const requested = environment.XLB_GRADLE_EXECUTABLE?.trim();
  const executable = requested ? path.resolve(requested) : wrapper;
  if (
    !exists(executable) ||
    !/^gradle(?:w)?(?:\.bat)?$/iu.test(path.basename(executable))
  ) {
    throw new Error(
      "XLB_GRADLE_EXECUTABLE must point to a Gradle or Gradle wrapper executable",
    );
  }
  return path.resolve(executable);
}

export function findAndroidBuildTool(
  androidSdk,
  name,
  {
    platform = process.platform,
    exists = fs.existsSync,
    readDirectory = fs.readdirSync,
  } = {},
) {
  const buildToolsRoot = path.join(androidSdk, "build-tools");
  if (!exists(buildToolsRoot)) {
    throw new Error(`Android SDK build-tools directory is missing: ${buildToolsRoot}`);
  }
  const versions = readDirectory(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) =>
      right.localeCompare(left, "en", { numeric: true, sensitivity: "base" }),
    );
  const executableName = platform === "win32" ? `${name}.exe` : name;
  const tool = versions
    .map((version) => path.join(buildToolsRoot, version, executableName))
    .find((candidate) => exists(candidate));
  if (!tool) {
    throw new Error(`Android build tool ${executableName} was not found under ${buildToolsRoot}`);
  }
  return path.resolve(tool);
}

export function probeAndroidToolchain(app, options = {}) {
  return Object.freeze({
    javaHome: resolveJavaHome(options),
    androidSdk: resolveAndroidSdk(options),
    gradleExecutable: resolveGradleExecutable(app.paths.androidRoot, options),
  });
}
