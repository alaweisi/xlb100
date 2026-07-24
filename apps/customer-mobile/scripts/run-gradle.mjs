import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function executable(directory, name) {
  if (!directory) return null;
  const candidate = path.join(
    directory,
    "bin",
    process.platform === "win32" ? `${name}.exe` : name,
  );
  return fs.existsSync(candidate) ? candidate : null;
}

function validJavaHome(directory) {
  const java = executable(directory, "java");
  if (!java) return false;
  return spawnSync(java, ["-version"], { stdio: "ignore" }).status === 0;
}

function resolveJavaHome() {
  if (validJavaHome(process.env.JAVA_HOME)) return process.env.JAVA_HOME;

  const finder = process.platform === "win32" ? "where.exe" : "which";
  const located = spawnSync(finder, ["javac"], { encoding: "utf8" });
  const first = located.stdout?.split(/\r?\n/u).find(Boolean);
  if (first) {
    const candidate = path.dirname(path.dirname(first.trim()));
    if (validJavaHome(candidate)) return candidate;
  }
  throw new Error("A valid JDK is required; JAVA_HOME and PATH were both unusable");
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Android", "sdk")
      : path.join(os.homedir(), "Android", "Sdk"),
  ];
  const sdk = candidates.find(
    (candidate) =>
      candidate &&
      fs.existsSync(path.join(candidate, "platforms")) &&
      fs.existsSync(path.join(candidate, "build-tools")),
  );
  if (!sdk) {
    throw new Error(
      "Android SDK not found; set ANDROID_SDK_ROOT to an SDK containing platforms and build-tools",
    );
  }
  return sdk;
}

const task = process.argv[2];
if (!["assembleDebug", "assembleRelease"].includes(task)) {
  throw new Error("Expected Gradle task assembleDebug or assembleRelease");
}

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = path.join(mobileRoot, "android");
const wrapper = path.join(
  androidRoot,
  process.platform === "win32" ? "gradlew.bat" : "gradlew",
);
if (!fs.existsSync(wrapper)) {
  throw new Error("Android project is missing; run pnpm cap add android first");
}
const requestedGradle = process.env.XLB_GRADLE_EXECUTABLE?.trim();
const gradleExecutable = requestedGradle
  ? path.resolve(requestedGradle)
  : wrapper;
if (
  !fs.existsSync(gradleExecutable) ||
  !/^gradle(?:w)?(?:\.bat)?$/iu.test(path.basename(gradleExecutable))
) {
  throw new Error(
    "XLB_GRADLE_EXECUTABLE must point to a Gradle or Gradle wrapper executable",
  );
}

const javaHome = resolveJavaHome();
const androidSdk = resolveAndroidSdk();
const command = process.platform === "win32"
  ? process.env.ComSpec ?? "cmd.exe"
  : gradleExecutable;
const argumentsList = process.platform === "win32"
  ? ["/d", "/c", gradleExecutable, task, "--stacktrace"]
  : [task, "--stacktrace"];
const result = spawnSync(command, argumentsList, {
  cwd: androidRoot,
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
