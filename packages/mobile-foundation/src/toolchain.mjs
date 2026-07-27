import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const REQUIRED_JAVA_MAJOR = 21;
export const REQUIRED_ANDROID_API = 36;

function jdkExecutable(javaHome, name, platform = process.platform) {
  if (!javaHome) return null;
  return path.join(
    javaHome,
    "bin",
    platform === "win32" ? `${name}.exe` : name,
  );
}

function detectedJavaMajor(result) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/\b(?:version\s+"|javac\s+)(\d+)(?:[._][^"\s]+)?/iu);
  return match ? Number(match[1]) : null;
}

function validJavaHome(javaHome, options) {
  const java = jdkExecutable(javaHome, "java", options.platform);
  const javac = jdkExecutable(javaHome, "javac", options.platform);
  if (!java || !javac || !options.exists(java) || !options.exists(javac)) {
    return false;
  }
  const environment = {
    ...options.environment,
    JAVA_HOME: javaHome,
  };
  const javaResult = options.spawn(java, ["-version"], {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  const javacResult = options.spawn(javac, ["-version"], {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  return javaResult.status === 0
    && javacResult.status === 0
    && detectedJavaMajor(javaResult) === REQUIRED_JAVA_MAJOR
    && detectedJavaMajor(javacResult) === REQUIRED_JAVA_MAJOR;
}

export function resolveJavaHome({
  environment = process.env,
  platform = process.platform,
  exists = fs.existsSync,
  spawn = spawnSync,
} = {}) {
  const options = { platform, exists, spawn, environment };
  if (validJavaHome(environment.JAVA_HOME, options)) {
    return path.resolve(environment.JAVA_HOME);
  }

  const finder = platform === "win32" ? "where.exe" : "which";
  const finderArguments = platform === "win32" ? ["javac"] : ["-a", "javac"];
  const located = spawn(finder, finderArguments, {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  for (const executable of located.stdout?.split(/\r?\n/u).filter(Boolean) ?? []) {
    const candidate = path.dirname(path.dirname(executable.trim()));
    if (validJavaHome(candidate, options)) return path.resolve(candidate);
  }
  throw new Error(
    `JDK ${REQUIRED_JAVA_MAJOR} is required; JAVA_HOME and every PATH candidate were unusable`,
  );
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
  const executableNames = platform === "win32"
    ? name === "apksigner"
      ? [`${name}.bat`, `${name}.exe`]
      : [`${name}.exe`, `${name}.bat`]
    : [name];
  const tool = versions
    .flatMap((version) =>
      executableNames.map((executableName) =>
        path.join(buildToolsRoot, version, executableName),
      ),
    )
    .find((candidate) => exists(candidate));
  if (!tool) {
    throw new Error(
      `Android build tool ${executableNames.join(" or ")} was not found under ${buildToolsRoot}`,
    );
  }
  return path.resolve(tool);
}

function verifyBuildTool(
  executable,
  name,
  {
    platform,
    environment,
    javaHome,
    spawn,
  },
) {
  const windowsBatch = platform === "win32" && /\.bat$/iu.test(executable);
  const command = windowsBatch
    ? environment.ComSpec ?? process.env.ComSpec ?? "cmd.exe"
    : executable;
  const args = windowsBatch
    ? ["/d", "/c", executable, "version"]
    : ["version"];
  const result = spawn(command, args, {
    encoding: "utf8",
    env: {
      ...environment,
      JAVA_HOME: javaHome,
    },
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Android build tool ${name} is not executable with the resolved JDK`,
    );
  }
}

export function probeAndroidToolchain(app, options = {}) {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? fs.existsSync;
  const spawn = options.spawn ?? spawnSync;
  const javaHome = resolveJavaHome({
    ...options,
    environment,
    platform,
    exists,
    spawn,
  });
  const androidSdk = resolveAndroidSdk({
    ...options,
    environment,
    platform,
    exists,
  });
  const androidPlatform = path.join(
    androidSdk,
    "platforms",
    `android-${REQUIRED_ANDROID_API}`,
  );
  if (!exists(androidPlatform)) {
    throw new Error(
      `Android SDK platform android-${REQUIRED_ANDROID_API} is required`,
    );
  }
  const findBuildTool = options.findBuildTool ?? findAndroidBuildTool;
  const buildToolOptions = {
    platform,
    exists,
    readDirectory: options.readDirectory ?? fs.readdirSync,
  };
  const aaptExecutable = findBuildTool(
    androidSdk,
    "aapt",
    buildToolOptions,
  );
  const apksignerExecutable = findBuildTool(
    androidSdk,
    "apksigner",
    buildToolOptions,
  );
  verifyBuildTool(aaptExecutable, "aapt", {
    platform,
    environment,
    javaHome,
    spawn,
  });
  verifyBuildTool(apksignerExecutable, "apksigner", {
    platform,
    environment,
    javaHome,
    spawn,
  });
  return Object.freeze({
    javaHome,
    javaMajor: REQUIRED_JAVA_MAJOR,
    androidSdk,
    androidApi: REQUIRED_ANDROID_API,
    aaptExecutable,
    apksignerExecutable,
    gradleExecutable: resolveGradleExecutable(app.paths.androidRoot, options),
  });
}
