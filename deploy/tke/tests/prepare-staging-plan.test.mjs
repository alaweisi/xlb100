import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildStagingPlan, N6_ACCEPTANCE_COMMIT, writeStagingPlan } from "../prepare-staging-plan.mjs";

const digest = character => `sha256:${character.repeat(64)}`;

function validTfvars() {
  return `environment = "staging"
region = "ap-guangzhou"
enable_billable_resources = true
billable_resources_acknowledgement = "CREATE-TKE-STAGING"
deletion_protection = true
create_tke_cluster = true
existing_tke_cluster_id = ""
vpc_id = "vpc-reviewed123"
subnet_ids = ["subnet-zonea123", "subnet-zoneb123"]
cluster_version = "1.32.2"
cluster_level = "L5"
cluster_network_type = "CiliumOverlay"
create_node_pool = true
node_instance_type = "SA5.MEDIUM4"
node_pool_min_size = 1
node_pool_desired_capacity = 2
node_pool_max_size = 3
create_tcr_instance = true
existing_tcr_instance_id = ""
existing_tcr_internal_endpoint = ""
manage_tcr_repositories = true
create_cos_bucket = true
cos_bucket_name = "xlb-staging-objects-1234567890"
existing_cos_bucket_name = ""
mysql_instance_id = "cdb-reviewed123"
mysql_internal_host = "mysql.staging.internal"
redis_instance_id = "crs-reviewed123"
redis_internal_host = "redis.staging.internal"
runtime_secret_name = "xlb-staging-runtime-secrets"
`;
}

function validBackend() {
  return `region = "ap-guangzhou"
bucket = "xlb-terraform-state-1234567890"
prefix = "xlb/staging/tke-infra"
encrypt = true
acl = "private"
`;
}

function validValues() {
  return `global:
  environment: staging
runtimeSecrets:
  existingSecret: xlb-staging-runtime-secrets
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
  mysql:
      host: mysql.staging.internal
  redis:
      host: redis.staging.internal
  objectStorage:
    provider: cos
    externalExecutionEnabled: true
    cos:
      bucket: xlb-staging-objects-1234567890
      region: ap-guangzhou
ingress:
  enabled: true
  className: qcloud
  annotations:
    ingress.cloud.tencent.com/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    ingress.cloud.tencent.com/auto-rewrite: "true"
  tls:
    secretName: xlb-staging-tls
  hosts:
    api: api.staging.xlb.test
    customer: customer.staging.xlb.test
    worker: worker.staging.xlb.test
    admin: admin.staging.xlb.test
`;
}

function validManifest() {
  return {
    schemaVersion: 1,
    environment: "staging",
    executionMode: "offline-preparation",
    n6AcceptanceCommit: N6_ACCEPTANCE_COMMIT,
    owner: "staging-owner",
    costOwner: "finops-owner",
    changeWindow: "2026-08-01T02:00:00+08:00/2026-08-01T06:00:00+08:00",
    approvedKubeContext: "tke-xlb-staging-approved",
    terraformVarFile: ".artifacts/tke/staging/staging.tfvars",
    backendConfig: ".artifacts/tke/staging/staging.backend.hcl",
    valuesFile: ".artifacts/tke/staging/values-staging.yaml",
    costReview: {
      currency: "CNY",
      monthlyMin: 800,
      monthlyMax: 1600,
      sourceUrl: "https://cloud.tencent.com/act/pro/price-calculator",
      reviewedAt: "2026-07-16",
      owner: "finops-owner",
    },
    authorizations: {
      realCloudPlan: false,
      terraformApply: false,
      cloudDeploy: false,
      dataMigration: false,
      trafficCutover: false,
    },
  };
}

function createBundle({ tfvars = validTfvars(), backend = validBackend(), values = validValues() } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-n7-"));
  const bundle = path.join(root, ".artifacts", "tke", "staging");
  mkdirSync(bundle, { recursive: true });
  writeFileSync(path.join(bundle, "staging.tfvars"), tfvars);
  writeFileSync(path.join(bundle, "staging.backend.hcl"), backend);
  writeFileSync(path.join(bundle, "values-staging.yaml"), values);
  return root;
}

test("valid offline bundle produces a reviewable N7 plan without granting cloud authority", () => {
  const repoRoot = createBundle();
  const plan = buildStagingPlan({ repoRoot, manifest: validManifest(), headCommit: "n7-test-head" });
  assert.equal(plan.n7Status, "PREPARED_OFFLINE");
  assert.equal(plan.n6AcceptanceCommit, N6_ACCEPTANCE_COMMIT);
  assert.equal(plan.cloudContract.region, "ap-guangzhou");
  assert.equal(plan.cloudContract.tke.mode, "create");
  assert.equal(plan.cloudContract.immutableImageDigests.length, 4);
  assert.deepEqual(plan.authorizations, validManifest().authorizations);
  assert.match(plan.commands.realCloudPlanAfterAuthorization, /-ExecutePlan/);
  assert.doesNotMatch(plan.commands.realCloudPlanAfterAuthorization, /terraform\s+apply/i);

  const output = path.join(repoRoot, ".artifacts", "tke", "staging-plan");
  writeStagingPlan(plan, output);
  const evidence = readFileSync(path.join(output, "N7_STAGING_PLAN.md"), "utf8");
  assert.match(evidence, /PREPARED_OFFLINE/);
  assert.match(evidence, /No Tencent Cloud API/);
});

test("offline preparation rejects placeholders before any cloud operation", () => {
  const repoRoot = createBundle({ tfvars: validTfvars().replace("vpc-reviewed123", "vpc-REPLACE") });
  assert.throws(() => buildStagingPlan({ repoRoot, manifest: validManifest() }), /replacement marker/);
});

test("offline preparation rejects Tencent credentials in reviewed files", () => {
  const repoRoot = createBundle({ tfvars: `${validTfvars()}\nTENCENTCLOUD_SECRET_ID = "do-not-store"\n` });
  assert.throws(() => buildStagingPlan({ repoRoot, manifest: validManifest() }), /Tencent credential name/);
});

test("offline preparation rejects region drift between Terraform and Helm", () => {
  const repoRoot = createBundle({ values: validValues().replace("region: ap-guangzhou", "region: ap-shanghai") });
  assert.throws(() => buildStagingPlan({ repoRoot, manifest: validManifest() }), /regions must match/);
});

test("offline preparation cannot self-authorize plan, apply, deploy, migration or cutover", () => {
  const repoRoot = createBundle();
  const manifest = validManifest();
  manifest.authorizations.realCloudPlan = true;
  assert.throws(() => buildStagingPlan({ repoRoot, manifest }), /must be explicitly false/);
});

test("reviewed inputs must remain under the ignored artifact root", () => {
  const repoRoot = createBundle();
  const manifest = validManifest();
  manifest.valuesFile = "deploy/environments/tke/values-staging.yaml";
  assert.throws(() => buildStagingPlan({ repoRoot, manifest }), /gitignored \.artifacts/);
});
