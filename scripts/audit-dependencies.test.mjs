import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  advisoriesAtOrAbove,
  buildBulkPayload,
  bulkAdvisoryUrl,
  collectDependencyVersions,
  resolvePnpmListInvocation,
} from "./audit-dependencies.mjs";

test("collects and deduplicates installed dependency versions", () => {
  const versions = collectDependencyVersions([
    {
      dependencies: {
        alpha: {
          version: "1.0.0",
          dependencies: { beta: { version: "2.0.0" } },
        },
      },
      devDependencies: { alpha: { version: "1.1.0" } },
    },
  ]);

  assert.deepEqual(buildBulkPayload(versions), {
    alpha: ["1.0.0", "1.1.0"],
    beta: ["2.0.0"],
  });
});

test("filters advisories at the configured severity and deduplicates ids", () => {
  const response = {
    alpha: [
      { id: 1, severity: "high", title: "high advisory" },
      { id: 2, severity: "critical", title: "critical advisory" },
    ],
    beta: [{ id: 2, severity: "critical", title: "duplicate advisory" }],
  };

  assert.equal(advisoriesAtOrAbove(response, "critical").length, 1);
  assert.equal(advisoriesAtOrAbove(response, "high").length, 2);
});

test("builds the npm Bulk Advisory endpoint without losing registry paths", () => {
  assert.equal(
    bulkAdvisoryUrl("https://registry.example.test/npm"),
    "https://registry.example.test/npm/-/npm/v1/security/advisories/bulk",
  );
});

test("resolves pnpm list without spawn shell mode on every platform", () => {
  const directInvocation = resolvePnpmListInvocation({
    platform: "linux",
    npmExecPath: null,
  });
  assert.deepEqual(directInvocation, {
    command: "pnpm",
    args: ["list", "--recursive", "--json", "--depth", "Infinity"],
    shell: false,
  });
  assert.notEqual(directInvocation.shell, true);

  const trustedPnpmExecPath = path.join(
    process.cwd(),
    ".cache",
    "node",
    "corepack",
    "v1",
    "pnpm",
    "9.15.0",
    "bin",
    "pnpm.cjs",
  );
  const corepackInvocation = resolvePnpmListInvocation({
    platform: "linux",
    npmExecPath: trustedPnpmExecPath,
    nodeExecPath: process.execPath,
    isRegularFile: candidatePath => candidatePath === trustedPnpmExecPath,
  });
  assert.deepEqual(corepackInvocation, {
    command: process.execPath,
    args: [
      trustedPnpmExecPath,
      "list",
      "--recursive",
      "--json",
      "--depth",
      "Infinity",
    ],
    shell: false,
  });
  assert.notEqual(corepackInvocation.shell, true);

  const windowsInvocation = resolvePnpmListInvocation({
    platform: "win32",
    npmExecPath: null,
    comSpec: "C:\\Windows\\System32\\cmd.exe",
  });
  assert.deepEqual(windowsInvocation, {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: [
      "/d",
      "/s",
      "/c",
      "pnpm",
      "list",
      "--recursive",
      "--json",
      "--depth",
      "Infinity",
    ],
    shell: false,
  });
  assert.notEqual(windowsInvocation.shell, true);

  assert.throws(
    () => resolvePnpmListInvocation({
      npmExecPath: path.resolve("untrusted", "pnpm.cjs"),
      isRegularFile: () => true,
    }),
    /Refusing untrusted npm_execpath/,
  );
  assert.throws(
    () => resolvePnpmListInvocation({
      npmExecPath: trustedPnpmExecPath,
      isRegularFile: () => false,
    }),
    /Refusing untrusted npm_execpath/,
  );
});
