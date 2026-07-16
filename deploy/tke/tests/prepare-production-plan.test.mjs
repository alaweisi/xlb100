import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProductionPlan, writeProductionPlan } from "../prepare-production-plan.mjs";

const digest = character => `sha256:${character.repeat(64)}`;

function validValues() {
  return `global:
  environment: production
runtimeSecrets:
  existingSecret: xlb-production-runtime-secrets
backend:
  image:
    repository: ccr.ccs.tencentyun.com/xlb/backend
    tag: ""
    digest: ${digest("a")}
frontends:
  customer:
    image:
      repository: ccr.ccs.tencentyun.com/xlb/customer
      tag: ""
      digest: ${digest("b")}
  worker:
    image:
      repository: ccr.ccs.tencentyun.com/xlb/worker
      tag: ""
      digest: ${digest("c")}
  admin:
    image:
      repository: ccr.ccs.tencentyun.com/xlb/admin
      tag: ""
      digest: ${digest("d")}
config:
  objectStorage:
    provider: cos
    externalExecutionEnabled: true
    cos:
      bucket: xlb-production-objects-1234567890
      region: ap-guangzhou
ingress:
  tls:
    secretName: xlb-production-tls
  hosts:
    api: api.xlb.test
    customer: customer.xlb.test
    worker: worker.xlb.test
    admin: admin.xlb.test
`;
}

function validN7Evidence() {
  return {
    schemaVersion: 1,
    environment: "staging",
    n7Status: "PASS",
    candidateCommit: "n7-pass-commit",
    completedAt: "2026-07-16T12:00:00+08:00",
    tkeClusterId: "cls-staging123",
    kubeContext: "tke-staging-validated",
    region: "ap-guangzhou",
    validatedImages: {
      backend: { repository: "ccr.ccs.tencentyun.com/xlb/backend", digest: digest("a") },
      customer: { repository: "ccr.ccs.tencentyun.com/xlb/customer", digest: digest("b") },
      worker: { repository: "ccr.ccs.tencentyun.com/xlb/worker", digest: digest("c") },
      admin: { repository: "ccr.ccs.tencentyun.com/xlb/admin", digest: digest("d") },
    },
    validatedChecks: {
      immutableImagePull: true,
      mysqlRedisTls: true,
      cosPrivateReadWrite: true,
      clbTlsIngress: true,
      websocket: true,
      jobsHeartbeat: true,
      rollingUpgradeRollback: true,
      nodeDrainPdb: true,
      alertsAndCostThresholds: true,
      backupMigrationRestore: true,
    },
  };
}

function validManifest() {
  return {
    schemaVersion: 1,
    environment: "production",
    executionMode: "offline-preparation",
    n7EvidenceFile: ".artifacts/tke/production/n7-staging-pass.json",
    valuesFile: ".artifacts/tke/production/values-production.yaml",
    terraformVarFile: ".artifacts/tke/production/production.tfvars",
    backendConfig: ".artifacts/tke/production/production.backend.hcl",
    owner: "production-owner",
    releaseOwner: "release-owner",
    dataOwner: "data-owner",
    onCallOwner: "oncall-owner",
    changeWindow: "2026-08-08T01:00:00+08:00/2026-08-08T05:00:00+08:00",
    approvedKubeContext: "tke-xlb-production-approved",
    dataReadiness: {
      backupId: "backup-production-20260808",
      backupVerifiedAt: "2026-08-08T00:30:00+08:00",
      restoreDrillEvidence: "n7-restore-drill-20260716",
      objectSyncEvidence: "cos-sync-checksum-20260808",
      migrationRunId: "production-20260808-001",
    },
    jobsSingleActive: {
      lighthouseStopProcedure: "stop only the Lighthouse jobs container after queue quiescence",
      tkeStartProcedure: "scale the TKE jobs Deployment from zero to one after migration",
      rollbackProcedure: "scale TKE jobs to zero before restarting the Lighthouse jobs container",
    },
    rollback: {
      lighthouseHealthUrl: "https://rollback.xlb.test/health",
      lighthouseReadinessEvidence: "lighthouse-readonly-smoke-20260808",
      previousHelmRevision: 3,
      dnsTtlSeconds: 60,
    },
    traffic: {
      strategy: "weighted",
      steps: [5, 25, 50, 100],
      observationMinutesPerStep: 30,
      stopConditions: "stop on elevated error rate, latency, data mismatch, jobs duplication or alert firing",
      operatorProcedure: "change the reviewed CLB traffic weight and record evidence at each step",
    },
    costReview: {
      currency: "CNY",
      monthlyMax: 3600,
      sourceUrl: "https://cloud.tencent.com/act/pro/price-calculator",
      reviewedAt: "2026-08-01",
      owner: "finops-owner",
    },
    authorizations: {
      realCloudPlan: false,
      terraformApply: false,
      cloudDeploy: false,
      dataMigration: false,
      trafficCutover: false,
      lighthouseDecommission: false,
    },
  };
}

function createBundle({ values = validValues(), evidence = validN7Evidence() } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-n8-"));
  const bundle = path.join(root, ".artifacts", "tke", "production");
  mkdirSync(bundle, { recursive: true });
  writeFileSync(path.join(bundle, "values-production.yaml"), values);
  writeFileSync(path.join(bundle, "n7-staging-pass.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(path.join(bundle, "production.tfvars"), 'environment = "production"\nregion = "ap-guangzhou"\n');
  writeFileSync(path.join(bundle, "production.backend.hcl"), 'region = "ap-guangzhou"\nbucket = "xlb-production-state-1234567890"\nencrypt = true\nacl = "private"\n');
  return root;
}

test("valid N7 PASS evidence and matching digests produce an offline N8 plan", () => {
  const repoRoot = createBundle();
  const plan = buildProductionPlan({ repoRoot, manifest: validManifest(), headCommit: "n8-test-head" });
  assert.equal(plan.n8Status, "PREPARED_OFFLINE");
  assert.equal(plan.n7.candidateCommit, "n7-pass-commit");
  assert.deepEqual(plan.traffic.steps, [5, 25, 50, 100]);
  assert.equal(plan.immutableImages.backend.digest, digest("a"));
  assert.match(plan.commands.noTrafficDeployAfterAuthorization, /DEPLOY-XLB-PRODUCTION/);
  assert.match(plan.commands.migrateAfterAuthorization, /BackupConfirmed/);
  assert.doesNotMatch(plan.commands.noTrafficDeployAfterAuthorization, /traffic|dns/i);

  const output = path.join(repoRoot, ".artifacts", "tke", "production-plan");
  writeProductionPlan(plan, output);
  const evidence = readFileSync(path.join(output, "N8_PRODUCTION_PLAN.md"), "utf8");
  assert.match(evidence, /PREPARED_OFFLINE/);
  assert.match(evidence, /5 -> 25 -> 50 -> 100/);
});

test("N8 rejects N7 PREPARED_OFFLINE evidence", () => {
  const evidence = validN7Evidence();
  evidence.n7Status = "PREPARED_OFFLINE";
  const repoRoot = createBundle({ evidence });
  assert.throws(() => buildProductionPlan({ repoRoot, manifest: validManifest() }), /requires real N7 TKE staging status PASS/);
});

test("N8 rejects a production image that differs from the N7 validated digest", () => {
  const repoRoot = createBundle({ values: validValues().replace(digest("d"), digest("e")) });
  assert.throws(() => buildProductionPlan({ repoRoot, manifest: validManifest() }), /image drifted.*admin/);
});

test("N8 offline preparation cannot self-authorize any external or production operation", () => {
  const repoRoot = createBundle();
  const manifest = validManifest();
  manifest.authorizations.trafficCutover = true;
  assert.throws(() => buildProductionPlan({ repoRoot, manifest }), /trafficCutover.*explicitly false/);
});

test("N8 requires the fixed weighted rollout staircase", () => {
  const repoRoot = createBundle();
  const manifest = validManifest();
  manifest.traffic.steps = [10, 50, 100];
  assert.throws(() => buildProductionPlan({ repoRoot, manifest }), /exactly 5,25,50,100/);
});

test("N8 rejects production placeholders before any external operation", () => {
  const repoRoot = createBundle({ values: validValues().replace("api.xlb.test", "api.example.invalid") });
  assert.throws(() => buildProductionPlan({ repoRoot, manifest: validManifest() }), /example.invalid/);
});

test("N8 inputs must stay under the ignored artifact root", () => {
  const repoRoot = createBundle();
  const manifest = validManifest();
  manifest.valuesFile = "deploy/environments/tke/values-production.yaml";
  assert.throws(() => buildProductionPlan({ repoRoot, manifest }), /gitignored \.artifacts/);
});

