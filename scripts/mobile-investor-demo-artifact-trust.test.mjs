import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  INVESTOR_DEMO_ARTIFACT_ROLES,
  runAndroidVerificationTool,
  verifyInvestorDemoArtifactRoot,
} from "./mobile-investor-demo-artifact-trust.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-investor-trust-"));
  const reports = Object.entries(INVESTOR_DEMO_ARTIFACT_ROLES).map(
    ([role, expected], index) => {
      const bytes = Buffer.from(`${role}-signed-candidate`);
      fs.writeFileSync(path.join(root, expected.fileName), bytes);
      return {
        role,
        appId: expected.appId,
        versionCode: 2,
        versionName: "0.2.0-investor-demo",
        apkPath: expected.fileName,
        sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
        certificateSha256: String(index + 1).repeat(64),
      };
    },
  );
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify({
    profile: "investor-demo",
    releaseCandidate: true,
    sealed: false,
    published: false,
    sourceCommit: "a".repeat(40),
    apiOrigin: "https://123.207.198.136",
    reports,
  }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(root, "checksums.sha256"),
    `${reports.map((report) => `${report.sha256}  ${path.basename(report.apkPath)}`).join("\n")}\n`,
  );
  return { root, reports };
}

function fakeRunTool(_command, args) {
  const apk = args.at(-1);
  const role = path.basename(apk).split("-")[1];
  const report = fixtureState.reports.find((candidate) => candidate.role === role);
  if (args[0] === "dump") {
    return `package: name='${report.appId}' versionCode='2' versionName='${report.versionName}'`;
  }
  return `Verifies\nSigner #1 certificate SHA-256 digest: ${report.certificateSha256}`;
}

let fixtureState;

test("artifact trust executable validator accepts exact role/package/hash/signature binding", () => {
  fixtureState = fixture();
  try {
    const result = verifyInvestorDemoArtifactRoot({
      artifactRoot: fixtureState.root,
      tools: { version: "36.1.0", aapt: "aapt", apksigner: "apksigner" },
      runTool: fakeRunTool,
    });
    assert.deepEqual(result.reports.map((report) => report.role), ["customer", "worker", "admin"]);
    assert.equal(new Set(result.reports.map((report) => report.certificateSha256)).size, 3);
    assert.equal(result.tools.version, "36.1.0");
  } finally {
    fs.rmSync(fixtureState.root, { recursive: true, force: true });
  }
});

test("artifact trust accepts build-tools 37 V2 signer certificate output", () => {
  fixtureState = fixture();
  try {
    const result = verifyInvestorDemoArtifactRoot({
      artifactRoot: fixtureState.root,
      tools: { version: "37.0.0", aapt: "aapt", apksigner: "apksigner.bat" },
      runTool: (_command, args) => {
        const apk = args.at(-1);
        const role = path.basename(apk).split("-")[1];
        const report = fixtureState.reports.find((candidate) => candidate.role === role);
        return args[0] === "dump"
          ? `package: name='${report.appId}' versionCode='2' versionName='${report.versionName}'`
          : `Verifies\nNumber of signers: 1\nV2 Signer: certificate SHA-256 digest: ${report.certificateSha256}`;
      },
    });
    assert.equal(result.tools.version, "37.0.0");
    assert.equal(result.reports.length, 3);
  } finally {
    fs.rmSync(fixtureState.root, { recursive: true, force: true });
  }
});

test("Windows batch execution avoids shell mode and sanitizes failing diagnostics", () => {
  const calls = [];
  const output = runAndroidVerificationTool(
    "C:\\Android SDK\\build-tools\\37.0.0\\apksigner.bat",
    ["verify", "C:\\candidate\\demo.apk"],
    {
      platform: "win32",
      comspec: "cmd.exe",
      spawn: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "verified", stderr: "" };
      },
    },
  );
  assert.match(output, /verified/u);
  assert.equal(calls[0].command, "cmd.exe");
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsVerbatimArguments, true);
  assert.deepEqual(calls[0].args.slice(0, 3), ["/d", "/s", "/c"]);

  assert.throws(
    () => runAndroidVerificationTool("apksigner.bat", ["verify", "demo.apk"], {
      platform: "win32",
      comspec: "cmd.exe",
      spawn: () => ({
        status: 1,
        stdout: "",
        stderr: "certificate parse failed; token=do-not-disclose",
      }),
    }),
    (error) => {
      assert.match(error.message, /certificate parse failed/u);
      assert.match(error.message, /token=\[REDACTED\]/u);
      assert.doesNotMatch(error.message, /do-not-disclose/u);
      return true;
    },
  );
});

test("artifact trust fails on wrong hash, package, path escape, or reused certificate", () => {
  for (const mutate of [
    (state) => { state.reports[0].sha256 = "F".repeat(64); },
    (state) => { state.reports[0].appId = "com.example.fake"; },
    (state) => { state.reports[0].apkPath = path.join(state.root, "..", "outside.apk"); },
    (state) => { state.reports[1].certificateSha256 = state.reports[0].certificateSha256; },
  ]) {
    fixtureState = fixture();
    try {
      mutate(fixtureState);
      fs.writeFileSync(path.join(fixtureState.root, "manifest.json"), `${JSON.stringify({
        profile: "investor-demo",
        releaseCandidate: true,
        sealed: false,
        published: false,
        sourceCommit: "a".repeat(40),
        apiOrigin: "https://123.207.198.136",
        reports: fixtureState.reports,
      })}\n`);
      assert.throws(() => verifyInvestorDemoArtifactRoot({
        artifactRoot: fixtureState.root,
        tools: { version: "fixture", aapt: "aapt", apksigner: "apksigner" },
        runTool: fakeRunTool,
      }));
    } finally {
      fs.rmSync(fixtureState.root, { recursive: true, force: true });
    }
  }
});
