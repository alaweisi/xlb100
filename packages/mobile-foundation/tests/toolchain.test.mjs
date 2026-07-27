import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REQUIRED_ANDROID_API,
  REQUIRED_JAVA_MAJOR,
  androidSdkCandidates,
  findAndroidBuildTool,
  probeAndroidToolchain,
  resolveAndroidSdk,
  resolveGradleExecutable,
  resolveJavaHome,
} from "../src/index.mjs";

test("Java detection accepts a working JAVA_HOME", () => {
  const javaHome = path.resolve("fixture-jdk");
  assert.equal(
    resolveJavaHome({
      environment: { JAVA_HOME: javaHome },
      platform: "win32",
      exists: (candidate) =>
        [
          path.join(javaHome, "bin", "java.exe"),
          path.join(javaHome, "bin", "javac.exe"),
        ].includes(candidate),
      spawn: (command) => ({
        status: 0,
        stdout: path.basename(command).startsWith("javac")
          ? "javac 21.0.11"
          : "",
        stderr: path.basename(command).startsWith("java.")
          ? 'openjdk version "21.0.11"'
          : "",
      }),
    }),
    javaHome,
  );
});

test("Java detection rejects stale JAVA_HOME and tries every PATH candidate in the supplied environment", () => {
  const staleHome = path.resolve("stale-jbr");
  const stalePathHome = path.resolve("stale-path-jdk");
  const javaHome = path.resolve("temurin-21");
  const environment = {
    JAVA_HOME: staleHome,
    PATH: "fixture-path",
  };
  let finderEnvironment;
  const executables = [
    staleHome,
    stalePathHome,
    javaHome,
  ].flatMap((home) => [
    path.join(home, "bin", "java.exe"),
    path.join(home, "bin", "javac.exe"),
  ]);
  assert.equal(
    resolveJavaHome({
      environment,
      platform: "win32",
      exists: (candidate) => executables.includes(candidate),
      spawn: (command, _args, options) => {
        if (command === "where.exe") {
          finderEnvironment = options.env;
          return {
            status: 0,
            stdout: [
              path.join(stalePathHome, "bin", "javac.exe"),
              path.join(javaHome, "bin", "javac.exe"),
            ].join("\r\n"),
            stderr: "",
          };
        }
        const valid = command.startsWith(javaHome);
        const compiler = path.basename(command).startsWith("javac");
        return {
          status: 0,
          stdout: compiler
            ? `javac ${valid ? "21.0.11" : "17.0.1"}`
            : "",
          stderr: compiler
            ? ""
            : `openjdk version "${valid ? "21.0.11" : "17.0.1"}"`,
        };
      },
    }),
    javaHome,
  );
  assert.equal(finderEnvironment, environment);
});

test("Unix Java detection asks for every PATH candidate", () => {
  const staleHome = path.resolve("unix-stale-jdk");
  const javaHome = path.resolve("unix-temurin-21");
  const executables = [staleHome, javaHome].flatMap((home) => [
    path.join(home, "bin", "java"),
    path.join(home, "bin", "javac"),
  ]);
  let finderArguments;
  assert.equal(
    resolveJavaHome({
      environment: { PATH: "fixture-path" },
      platform: "linux",
      exists: (candidate) => executables.includes(candidate),
      spawn: (command, args) => {
        if (command === "which") {
          finderArguments = args;
          return {
            status: 0,
            stdout: [
              path.join(staleHome, "bin", "javac"),
              path.join(javaHome, "bin", "javac"),
            ].join("\n"),
            stderr: "",
          };
        }
        const valid = command.startsWith(javaHome);
        const compiler = path.basename(command) === "javac";
        return {
          status: 0,
          stdout: compiler
            ? `javac ${valid ? "21.0.11" : "17.0.1"}`
            : "",
          stderr: compiler
            ? ""
            : `openjdk version "${valid ? "21.0.11" : "17.0.1"}"`,
        };
      },
    }),
    javaHome,
  );
  assert.deepEqual(finderArguments, ["-a", "javac"]);
});

test("Android SDK detection checks explicit and standard locations", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-mobile-sdk-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdk = path.join(root, "Sdk");
  fs.mkdirSync(path.join(sdk, "platforms"), { recursive: true });
  fs.mkdirSync(path.join(sdk, "build-tools"), { recursive: true });
  assert.equal(
    resolveAndroidSdk({
      environment: { ANDROID_SDK_ROOT: sdk },
      platform: "linux",
      homeDirectory: root,
    }),
    path.resolve(sdk),
  );
  assert.deepEqual(
    androidSdkCandidates(
      { LOCALAPPDATA: root },
      "win32",
      path.join(root, "home"),
    ),
    [
      path.join(root, "Android", "Sdk"),
      path.join(root, "home", "Android", "Sdk"),
    ],
  );
});

test("Gradle detection stays inside the app unless an explicit valid override is supplied", (t) => {
  const androidRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "xlb-mobile-gradle-"),
  );
  t.after(() => fs.rmSync(androidRoot, { recursive: true, force: true }));
  const wrapper = path.join(androidRoot, "gradlew.bat");
  fs.writeFileSync(wrapper, "");
  assert.equal(
    resolveGradleExecutable(androidRoot, {
      environment: {},
      platform: "win32",
    }),
    path.resolve(wrapper),
  );
  assert.throws(
    () =>
      resolveGradleExecutable(androidRoot, {
        environment: { XLB_GRADLE_EXECUTABLE: path.join(androidRoot, "tool.exe") },
        platform: "win32",
      }),
    /must point to a Gradle/u,
  );
});

test("Android build tool detection selects the newest installed numeric version", () => {
  const sdk = path.resolve("fixture-sdk");
  const newest = path.join(sdk, "build-tools", "37.0.0", "aapt.exe");
  assert.equal(
    findAndroidBuildTool(sdk, "aapt", {
      platform: "win32",
      exists: (candidate) =>
        candidate === path.join(sdk, "build-tools") || candidate === newest,
      readDirectory: () => [
        { name: "9.0.0", isDirectory: () => true },
        { name: "37.0.0", isDirectory: () => true },
      ],
    }),
    newest,
  );
});

test("Android build tool detection accepts the Windows apksigner batch wrapper", () => {
  const sdk = path.resolve("fixture-sdk");
  const apksigner = path.join(
    sdk,
    "build-tools",
    "37.0.0",
    "apksigner.bat",
  );
  assert.equal(
    findAndroidBuildTool(sdk, "apksigner", {
      platform: "win32",
      exists: (candidate) =>
        candidate === path.join(sdk, "build-tools") || candidate === apksigner,
      readDirectory: () => [
        { name: "37.0.0", isDirectory: () => true },
      ],
    }),
    apksigner,
  );
});

test("Android doctor verifies JDK 21, API 36, aapt, and apksigner with normalized JAVA_HOME", () => {
  const javaHome = path.resolve("fixture-jdk");
  const sdk = path.resolve("fixture-sdk");
  const androidRoot = path.resolve("fixture-android");
  const aapt = path.join(sdk, "build-tools", "36.0.0", "aapt.exe");
  const apksigner = path.join(sdk, "build-tools", "36.0.0", "apksigner.bat");
  const environment = {
    JAVA_HOME: javaHome,
    ANDROID_SDK_ROOT: sdk,
    ComSpec: "fixture-cmd.exe",
  };
  const invocations = [];
  const report = probeAndroidToolchain(
    { paths: { androidRoot } },
    {
      environment,
      platform: "win32",
      exists: (candidate) => [
        path.join(javaHome, "bin", "java.exe"),
        path.join(javaHome, "bin", "javac.exe"),
        path.join(sdk, "platforms"),
        path.join(sdk, "build-tools"),
        path.join(sdk, "platforms", "android-36"),
        path.join(androidRoot, "gradlew.bat"),
      ].includes(candidate),
      findBuildTool: (_sdk, name) => name === "aapt" ? aapt : apksigner,
      spawn: (command, args, options) => {
        invocations.push({ command, args, options });
        const compiler = path.basename(command).startsWith("javac");
        if (
          path.basename(command).startsWith("java.")
          || compiler
        ) {
          return {
            status: 0,
            stdout: compiler ? "javac 21.0.11" : "",
            stderr: compiler ? "" : 'openjdk version "21.0.11"',
          };
        }
        return { status: 0, stdout: "version", stderr: "" };
      },
    },
  );
  assert.equal(report.javaMajor, REQUIRED_JAVA_MAJOR);
  assert.equal(report.androidApi, REQUIRED_ANDROID_API);
  assert.equal(report.aaptExecutable, aapt);
  assert.equal(report.apksignerExecutable, apksigner);
  const signer = invocations.find((entry) => entry.args.includes(apksigner));
  assert.equal(signer.command, "fixture-cmd.exe");
  assert.equal(signer.options.env.JAVA_HOME, javaHome);
});

test("Android doctor fails when API 36 is absent", () => {
  const javaHome = path.resolve("fixture-jdk");
  const sdk = path.resolve("fixture-sdk");
  assert.throws(
    () => probeAndroidToolchain(
      { paths: { androidRoot: path.resolve("fixture-android") } },
      {
        environment: { JAVA_HOME: javaHome, ANDROID_SDK_ROOT: sdk },
        platform: "linux",
        exists: (candidate) => [
          path.join(javaHome, "bin", "java"),
          path.join(javaHome, "bin", "javac"),
          path.join(sdk, "platforms"),
          path.join(sdk, "build-tools"),
        ].includes(candidate),
        spawn: (command) => ({
          status: 0,
          stdout: path.basename(command) === "javac" ? "javac 21.0.11" : "",
          stderr: path.basename(command) === "java"
            ? 'openjdk version "21.0.11"'
            : "",
        }),
      },
    ),
    /android-36 is required/u,
  );
});
