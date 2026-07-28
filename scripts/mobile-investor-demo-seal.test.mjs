import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  INVESTOR_DEMO_ARTIFACT_ROLES,
  verifyInvestorDemoArtifactRoot,
} from "./mobile-investor-demo-artifact-trust.mjs";
import {
  INVESTOR_DEMO_SEAL_DOCUMENTS,
  sealInvestorDemoArtifact,
  validateInvestorDemoSeal,
} from "./mobile-investor-demo-seal.mjs";

const commit = "b".repeat(40);

function buildFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "xlb-investor-seal-"));
  const root = path.join(base, commit);
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  const reports = Object.entries(INVESTOR_DEMO_ARTIFACT_ROLES).map(
    ([role, expected], index) => {
      const bytes = Buffer.from(`${role}-candidate`);
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
  const manifest = {
    profile: "investor-demo",
    releaseCandidate: true,
    sealed: false,
    dispatchable: false,
    releaseDecision: "INVESTOR_APK_HOLD",
    published: false,
    sourceCommit: commit,
    apiOrigin: "https://123.207.198.136",
    sessionTtlSeconds: 1_800,
    artifactRoot: root,
    reports,
  };
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  fs.writeFileSync(
    path.join(root, "checksums.sha256"),
    `${reports.map((report) => `${report.sha256}  ${report.apkPath}`).join("\n")}\n`,
  );
  for (const document of INVESTOR_DEMO_SEAL_DOCUMENTS) {
    fs.writeFileSync(path.join(root, document), `# ${document}\nfixture\n`);
  }
  fs.writeFileSync(path.join(root, "signing-verification.json"), JSON.stringify({
    sourceCommit: commit,
    distinctCertificates: true,
    distinctPublicKeys: true,
    reports: reports.map((report) => ({ role: report.role, signatureValid: true })),
  }));
  fs.writeFileSync(path.join(root, "independent-apk-verification.json"), JSON.stringify({
    sourceCommit: commit, status: "PASS", reports,
  }));
  fs.writeFileSync(path.join(root, "HASH_RECHECK.json"), JSON.stringify({
    sourceCommit: commit, status: "PASS",
  }));
  fs.writeFileSync(path.join(root, "SECURITY_SCAN.json"), JSON.stringify({
    sourceCommit: commit, status: "PASS", secretMatches: 0,
  }));
  fs.writeFileSync(path.join(root, "FILE_INVENTORY.json"), JSON.stringify({
    sourceCommit: commit, status: "PASS",
  }));
  fs.writeFileSync(path.join(root, "RELEASE_STATUS.json"), JSON.stringify({
    sourceCommit: commit,
    sealed: false,
    releaseDecision: "INVESTOR_APK_HOLD",
    published: false,
    blockingReasons: ["awaiting strict seal"],
  }));
  fs.writeFileSync(path.join(root, "network-443.json"), JSON.stringify({
    status: "PASS",
    tcpConnected: true,
    apiOrigin: "https://123.207.198.136",
    port: 443,
  }));
  const serials = ["physical-one", "physical-two"];
  const qaReports = serials.flatMap((serial) => reports.map((report) => {
    const prefix = `qa/evidence/${serial}-${report.role}`;
    const evidenceFiles = [`${prefix}.png`, `${prefix}.xml`, `${prefix}-summary.txt`, `${prefix}-logcat-sanitized.txt`];
    for (const file of evidenceFiles) fs.writeFileSync(path.join(root, file), "fixture\n");
    return {
      serial,
      role: report.role,
      status: "PASS",
      runtimeChecks: {
        crashLines: 0,
        anrLines: 0,
        cleartextViolations: 0,
        tlsFailures: 0,
        sensitiveLogMatches: { bearer: 0, fullPhone: 0, otp: 0 },
      },
      postAuthenticatedRuntimeChecks: {
        crashLines: 0,
        anrLines: 0,
        cleartextViolations: 0,
        tlsFailures: 0,
        sensitiveLogMatches: { bearer: 0, fullPhone: 0, otp: 0 },
      },
      evidenceFiles,
    };
  }));
  fs.writeFileSync(path.join(root, "qa", "qa-index.json"), JSON.stringify({
    status: "PASS",
    mode: "FinalSeal",
    sourceCommit: commit,
    physicalDevices: { required: 2, passed: 2, serials },
    authenticatedFlow: {
      status: "PASS",
      login: "PASS",
      logout: "PASS",
      shortTtlVerification: "PASS",
      fixedBusinessChain: "PASS",
      passedRuns: 2,
    },
    reports: qaReports,
  }));
  return { base, root, reports };
}

let state;
function artifactVerifier(options) {
  return verifyInvestorDemoArtifactRoot({
    ...options,
    tools: { version: "fixture", aapt: "aapt", apksigner: "apksigner" },
    runTool: (_command, args) => {
      const role = path.basename(args.at(-1)).split("-")[1];
      const report = state.reports.find((candidate) => candidate.role === role);
      return args[0] === "dump"
        ? `package: name='${report.appId}' versionCode='2' versionName='${report.versionName}'`
        : `Signer #1 certificate SHA-256 digest: ${report.certificateSha256}`;
    },
  });
}

test("strict seal rejects missing evidence", () => {
  state = buildFixture();
  try {
    fs.rmSync(path.join(state.root, "DEMO_SCRIPT.md"));
    assert.throws(() => validateInvestorDemoSeal({
      artifactRoot: state.root,
      currentCommit: commit,
      artifactVerifier,
    }), /evidence is missing/u);
  } finally {
    fs.rmSync(state.base, { recursive: true, force: true });
  }
});

test("strict seal rejects a fake manifest and wrong APK hash", () => {
  for (const mutate of [
    (fixture) => { fixture.reports[0].appId = "com.example.fake"; },
    (fixture) => { fixture.reports[0].sha256 = "0".repeat(64); },
  ]) {
    state = buildFixture();
    try {
      mutate(state);
      const manifest = JSON.parse(fs.readFileSync(path.join(state.root, "manifest.json"), "utf8"));
      manifest.reports = state.reports;
      fs.writeFileSync(path.join(state.root, "manifest.json"), JSON.stringify(manifest));
      assert.throws(() => validateInvestorDemoSeal({
        artifactRoot: state.root,
        currentCommit: commit,
        artifactVerifier,
      }));
    } finally {
      fs.rmSync(state.base, { recursive: true, force: true });
    }
  }
});

test("complete two-device fixture is sealed GO without becoming published", () => {
  state = buildFixture();
  try {
    const sealed = sealInvestorDemoArtifact({
      artifactRoot: state.root,
      currentCommit: commit,
      artifactVerifier,
    });
    assert.equal(sealed.sealed, true);
    assert.equal(sealed.dispatchable, true);
    assert.equal(sealed.releaseDecision, "INVESTOR_APK_GO");
    assert.equal(sealed.published, false);
    assert.equal(JSON.parse(fs.readFileSync(
      path.join(state.root, "seal-verification.json"),
      "utf8",
    )).status, "PASS");
  } finally {
    fs.rmSync(state.base, { recursive: true, force: true });
  }
});
