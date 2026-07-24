import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  androidSdkCandidates,
  findAndroidBuildTool,
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
      spawn: () => ({ status: 0 }),
    }),
    javaHome,
  );
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
