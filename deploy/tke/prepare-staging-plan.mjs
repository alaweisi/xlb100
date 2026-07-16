import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateDeploymentValues } from "../../scripts/check-tke-delivery-line.mjs";

export const N6_ACCEPTANCE_COMMIT = "cfcfc2e21c2570f6b33abf2f654d373870643fb6";

const fail = message => {
  throw new Error(message);
};

const stripQuotes = value => value.trim().replace(/^(["'])(.*)\1$/, "$2");

function parseHclScalar(content, name, required = true) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (!match) {
    if (required) fail(`missing required Terraform input: ${name}`);
    return undefined;
  }
  const raw = match[1].replace(/\s+#.*$/, "").trim();
  if (raw === "true" || raw === "false") return raw === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return [...raw.matchAll(/["']([^"']+)["']/g)].map(item => item[1]);
  }
  return stripQuotes(raw);
}

function yamlScalar(content, pattern, label) {
  const match = content.match(pattern);
  if (!match) fail(`missing required Helm values field: ${label}`);
  return stripQuotes(match[1].replace(/\s+#.*$/, "").trim());
}

function assertNoUnsafeContent(content, label) {
  const forbidden = [
    [/placeholder/i, "placeholder"],
    [/REPLACE(?:_WITH)?/i, "replacement marker"],
    [/example\.invalid/i, "example.invalid"],
    [/sha256:0{64}/i, "all-zero digest"],
    [/TENCENTCLOUD_SECRET_(?:ID|KEY)/i, "Tencent credential name"],
    [/TENCENTCLOUD_SECURITY_TOKEN/i, "Tencent security token name"],
    [/\b(?:mysql|redis)_password\s*=/i, "database password"],
  ];
  for (const [pattern, name] of forbidden) {
    if (pattern.test(content)) fail(`${label} contains forbidden ${name}`);
  }
}

function resolveArtifactFile(repoRoot, candidate, label) {
  if (!candidate) fail(`${label} is required`);
  const resolved = path.resolve(repoRoot, candidate);
  const relative = path.relative(repoRoot, resolved).replaceAll("\\", "/");
  if (relative.startsWith("../") || path.isAbsolute(relative)) fail(`${label} must stay inside the repository`);
  if (!relative.startsWith(".artifacts/")) fail(`${label} must be stored under the gitignored .artifacts directory`);
  if (!existsSync(resolved)) fail(`${label} not found: ${relative}`);
  return { absolute: resolved, relative };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function requirePlainText(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  if (/placeholder|replace|example\.invalid/i.test(value)) fail(`${label} still contains a placeholder`);
  return value.trim();
}

function parseTerraformInputs(content) {
  const input = {
    environment: parseHclScalar(content, "environment"),
    region: parseHclScalar(content, "region"),
    enableBillableResources: parseHclScalar(content, "enable_billable_resources"),
    acknowledgement: parseHclScalar(content, "billable_resources_acknowledgement"),
    deletionProtection: parseHclScalar(content, "deletion_protection"),
    createTkeCluster: parseHclScalar(content, "create_tke_cluster"),
    existingTkeClusterId: parseHclScalar(content, "existing_tke_cluster_id"),
    vpcId: parseHclScalar(content, "vpc_id"),
    subnetIds: parseHclScalar(content, "subnet_ids"),
    clusterVersion: parseHclScalar(content, "cluster_version"),
    clusterLevel: parseHclScalar(content, "cluster_level"),
    clusterNetworkType: parseHclScalar(content, "cluster_network_type"),
    createNodePool: parseHclScalar(content, "create_node_pool"),
    nodeInstanceType: parseHclScalar(content, "node_instance_type"),
    nodePoolMinSize: parseHclScalar(content, "node_pool_min_size"),
    nodePoolDesiredCapacity: parseHclScalar(content, "node_pool_desired_capacity"),
    nodePoolMaxSize: parseHclScalar(content, "node_pool_max_size"),
    createTcrInstance: parseHclScalar(content, "create_tcr_instance"),
    existingTcrInstanceId: parseHclScalar(content, "existing_tcr_instance_id", false) ?? "",
    existingTcrInternalEndpoint: parseHclScalar(content, "existing_tcr_internal_endpoint", false) ?? "",
    manageTcrRepositories: parseHclScalar(content, "manage_tcr_repositories"),
    createCosBucket: parseHclScalar(content, "create_cos_bucket"),
    cosBucketName: parseHclScalar(content, "cos_bucket_name", false) ?? "",
    existingCosBucketName: parseHclScalar(content, "existing_cos_bucket_name"),
    mysqlInstanceId: parseHclScalar(content, "mysql_instance_id"),
    mysqlHost: parseHclScalar(content, "mysql_internal_host"),
    redisInstanceId: parseHclScalar(content, "redis_instance_id"),
    redisHost: parseHclScalar(content, "redis_internal_host"),
    runtimeSecretName: parseHclScalar(content, "runtime_secret_name"),
  };

  if (input.environment !== "staging") fail("Terraform environment must be staging");
  if (input.createTkeCluster === Boolean(input.existingTkeClusterId)) {
    fail("select exactly one TKE source: create or existing cluster");
  }
  if (input.createTcrInstance === Boolean(input.existingTcrInstanceId)) {
    fail("staging requires exactly one TCR source: create or existing instance");
  }
  if (!input.createTcrInstance && !input.existingTcrInternalEndpoint) {
    fail("an existing TCR source requires its private internal endpoint");
  }
  if (input.createCosBucket === Boolean(input.existingCosBucketName)) {
    fail("select exactly one COS source: create or existing bucket");
  }
  if (!/^vpc-/.test(input.vpcId) || (input.createNodePool && input.subnetIds.length < 1)) {
    fail("staging requires a reviewed VPC and private subnet list");
  }
  if (input.createNodePool && !input.subnetIds.every(value => /^subnet-/.test(value))) {
    fail("every managed-node subnet must be a Tencent subnet ID");
  }
  if (!(input.nodePoolMinSize >= 1 && input.nodePoolDesiredCapacity >= input.nodePoolMinSize && input.nodePoolMaxSize >= input.nodePoolDesiredCapacity)) {
    fail("node pool capacity must satisfy 1 <= min <= desired <= max");
  }

  const creates = [input.createTkeCluster, input.createNodePool, input.createTcrInstance, input.createCosBucket];
  if (creates.some(Boolean) && (!input.enableBillableResources || input.acknowledgement !== "CREATE-TKE-STAGING")) {
    fail("billable staging resources require the exact CREATE-TKE-STAGING acknowledgement");
  }
  if (!input.deletionProtection) fail("staging deletion protection must remain enabled");
  for (const [name, value] of [
    ["cluster_version", input.clusterVersion],
    ["cluster_level", input.clusterLevel],
    ["cluster_network_type", input.clusterNetworkType],
    ["node_instance_type", input.nodeInstanceType],
    ["mysql_instance_id", input.mysqlInstanceId],
    ["mysql_internal_host", input.mysqlHost],
    ["redis_instance_id", input.redisInstanceId],
    ["redis_internal_host", input.redisHost],
    ["runtime_secret_name", input.runtimeSecretName],
  ]) requirePlainText(String(value), name);

  return input;
}

function parseHelmValues(content) {
  validateDeploymentValues(content, "staging");
  const hosts = [...content.matchAll(/^\s{6}host:\s*(.+?)\s*$/gm)].map(match => stripQuotes(match[1]));
  if (hosts.length < 2) fail("staging Helm values must contain MySQL and Redis hosts");
  const ingressHosts = {
    api: yamlScalar(content, /^\s{4}api:\s*(.+?)\s*$/m, "ingress.hosts.api"),
    customer: yamlScalar(content, /^\s{4}customer:\s*(.+?)\s*$/m, "ingress.hosts.customer"),
    worker: yamlScalar(content, /^\s{4}worker:\s*(.+?)\s*$/m, "ingress.hosts.worker"),
    admin: yamlScalar(content, /^\s{4}admin:\s*(.+?)\s*$/m, "ingress.hosts.admin"),
  };
  if (new Set(Object.values(ingressHosts)).size !== 4) fail("all four staging ingress hosts must be distinct");
  return {
    environment: yamlScalar(content, /^\s{2}environment:\s*(.+?)\s*$/m, "global.environment"),
    runtimeSecretName: yamlScalar(content, /^\s{2}existingSecret:\s*(.+?)\s*$/m, "runtimeSecrets.existingSecret"),
    mysqlHost: hosts[0],
    redisHost: hosts[1],
    cosBucket: yamlScalar(content, /^\s{6}bucket:\s*(.+?)\s*$/m, "config.objectStorage.cos.bucket"),
    cosRegion: yamlScalar(content, /^\s{6}region:\s*(.+?)\s*$/m, "config.objectStorage.cos.region"),
    digests: content.match(/sha256:[a-f0-9]{64}\b/gi) ?? [],
    ingressHosts,
  };
}

function parseBackend(content) {
  return {
    region: parseHclScalar(content, "region"),
    bucket: parseHclScalar(content, "bucket"),
    prefix: parseHclScalar(content, "prefix"),
    encrypt: parseHclScalar(content, "encrypt"),
    acl: parseHclScalar(content, "acl"),
  };
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1) fail("staging plan manifest schemaVersion must be 1");
  if (manifest.environment !== "staging") fail("staging plan manifest environment must be staging");
  if (manifest.executionMode !== "offline-preparation") fail("executionMode must be offline-preparation");
  if (manifest.n6AcceptanceCommit !== N6_ACCEPTANCE_COMMIT) fail("manifest must pin the accepted N6 commit");
  requirePlainText(manifest.owner, "owner");
  requirePlainText(manifest.costOwner, "costOwner");
  requirePlainText(manifest.changeWindow, "changeWindow");
  requirePlainText(manifest.approvedKubeContext, "approvedKubeContext");

  const approvals = manifest.authorizations ?? {};
  for (const name of ["realCloudPlan", "terraformApply", "cloudDeploy", "dataMigration", "trafficCutover"]) {
    if (approvals[name] !== false) fail(`authorizations.${name} must be explicitly false during offline preparation`);
  }

  const cost = manifest.costReview ?? {};
  if (cost.currency !== "CNY") fail("costReview.currency must be CNY");
  if (!Number.isFinite(cost.monthlyMin) || !Number.isFinite(cost.monthlyMax) || cost.monthlyMin < 0 || cost.monthlyMax < cost.monthlyMin) {
    fail("costReview monthly range is invalid");
  }
  requirePlainText(cost.sourceUrl, "costReview.sourceUrl");
  requirePlainText(cost.reviewedAt, "costReview.reviewedAt");
  requirePlainText(cost.owner, "costReview.owner");
  let costUrl;
  try {
    costUrl = new URL(cost.sourceUrl);
  } catch {
    fail("costReview.sourceUrl must be a valid HTTPS URL");
  }
  if (costUrl.protocol !== "https:") fail("costReview.sourceUrl must be a valid HTTPS URL");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cost.reviewedAt)) fail("costReview.reviewedAt must use YYYY-MM-DD");
  return manifest;
}

const psQuote = value => `'${String(value).replaceAll("'", "''")}'`;

export function buildStagingPlan({ repoRoot, manifest, headCommit = N6_ACCEPTANCE_COMMIT }) {
  validateManifest(manifest);
  const tfvarsFile = resolveArtifactFile(repoRoot, manifest.terraformVarFile, "terraformVarFile");
  const backendFile = resolveArtifactFile(repoRoot, manifest.backendConfig, "backendConfig");
  const valuesFile = resolveArtifactFile(repoRoot, manifest.valuesFile, "valuesFile");

  const tfvarsContent = readFileSync(tfvarsFile.absolute, "utf8");
  const backendContent = readFileSync(backendFile.absolute, "utf8");
  const valuesContent = readFileSync(valuesFile.absolute, "utf8");
  for (const [content, label] of [[tfvarsContent, "Terraform tfvars"], [backendContent, "Terraform backend"], [valuesContent, "Helm values"]]) {
    assertNoUnsafeContent(content, label);
  }

  const terraform = parseTerraformInputs(tfvarsContent);
  const backend = parseBackend(backendContent);
  const helm = parseHelmValues(valuesContent);
  if (backend.region !== terraform.region || helm.cosRegion !== terraform.region) fail("Terraform, backend and Helm COS regions must match");
  if (backend.encrypt !== true || backend.acl !== "private") fail("Terraform state backend must be encrypted and private");
  if (helm.environment !== "staging") fail("Helm values environment must be staging");
  if (helm.runtimeSecretName !== terraform.runtimeSecretName) fail("runtime Secret name differs between Terraform and Helm");
  if (helm.mysqlHost !== terraform.mysqlHost || helm.redisHost !== terraform.redisHost) fail("MySQL/Redis hosts differ between Terraform and Helm");
  const selectedBucket = terraform.createCosBucket ? terraform.cosBucketName : terraform.existingCosBucketName;
  if (helm.cosBucket !== selectedBucket) fail("COS bucket differs between Terraform and Helm");

  const createsBillableResources = [terraform.createTkeCluster, terraform.createNodePool, terraform.createTcrInstance, terraform.createCosBucket].some(Boolean);
  if (createsBillableResources && manifest.costReview.monthlyMax <= 0) fail("a non-zero reviewed monthly cost ceiling is required for managed staging resources");

  const commands = {
    offlinePrepare: `pwsh deploy/tke/xlb-tke.ps1 -Action PrepareStaging -Environment staging -StagingManifest ${psQuote(manifest.__relativePath ?? ".artifacts/tke/staging/manifest.json")}`,
    realCloudPlanAfterAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action PlanInfrastructure -Environment staging -ExecutePlan -TerraformVarFile ${psQuote(tfvarsFile.relative)} -BackendConfig ${psQuote(backendFile.relative)} -Confirmation PLAN-INFRASTRUCTURE-STAGING`,
    helmRender: `helm template xlb-staging deploy/helm/xlb --namespace xlb-staging -f ${psQuote(valuesFile.relative)}`,
    deployAfterSeparateAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action Deploy -Environment staging -ValuesFile ${psQuote(valuesFile.relative)} -KubeContext ${psQuote(manifest.approvedKubeContext)} -Apply -Confirmation DEPLOY-XLB-STAGING`,
  };

  return {
    schemaVersion: 1,
    n7Status: "PREPARED_OFFLINE",
    generatedAt: new Date().toISOString(),
    n6AcceptanceCommit: N6_ACCEPTANCE_COMMIT,
    headCommit,
    environment: "staging",
    owner: manifest.owner,
    costOwner: manifest.costOwner,
    changeWindow: manifest.changeWindow,
    approvedKubeContext: manifest.approvedKubeContext,
    inputs: {
      terraformVarFile: { path: tfvarsFile.relative, sha256: sha256(tfvarsFile.absolute) },
      backendConfig: { path: backendFile.relative, sha256: sha256(backendFile.absolute) },
      valuesFile: { path: valuesFile.relative, sha256: sha256(valuesFile.absolute) },
    },
    cloudContract: {
      region: terraform.region,
      tke: terraform.createTkeCluster ? { mode: "create", clusterVersion: terraform.clusterVersion, clusterLevel: terraform.clusterLevel, networkType: terraform.clusterNetworkType } : { mode: "reference", id: terraform.existingTkeClusterId },
      nodePool: { create: terraform.createNodePool, instanceType: terraform.nodeInstanceType, min: terraform.nodePoolMinSize, desired: terraform.nodePoolDesiredCapacity, max: terraform.nodePoolMaxSize, subnetIds: terraform.subnetIds },
      tcr: { mode: terraform.createTcrInstance ? "create" : "reference", manageRepositories: terraform.manageTcrRepositories },
      cos: { mode: terraform.createCosBucket ? "create" : "reference", bucket: selectedBucket },
      dependencies: { vpcId: terraform.vpcId, mysqlInstanceId: terraform.mysqlInstanceId, redisInstanceId: terraform.redisInstanceId, runtimeSecretName: terraform.runtimeSecretName },
      immutableImageDigests: helm.digests,
      ingressHosts: helm.ingressHosts,
      stateBackend: { region: backend.region, bucket: backend.bucket, prefix: backend.prefix, encrypted: true, acl: "private" },
    },
    costReview: manifest.costReview,
    authorizations: manifest.authorizations,
    commands,
    externalGates: [
      "Human authorization for a real Tencent Cloud Terraform plan and remote-state refresh",
      "Reviewed Terraform plan summary, resource count, price estimate and rollback impact",
      "Separate Human authorization for terraform apply and billable resource creation",
      "Separate Human authorization for TKE staging deployment",
      "Backup/restore evidence before staging migration",
      "Separate production authorization for production data or traffic cutover",
    ],
  };
}

function renderMarkdown(plan) {
  const creates = [
    ["TKE cluster", plan.cloudContract.tke.mode === "create"],
    ["TKE node pool", plan.cloudContract.nodePool.create],
    ["TCR instance", plan.cloudContract.tcr.mode === "create"],
    ["COS bucket", plan.cloudContract.cos.mode === "create"],
  ];
  return `# N7 TKE staging offline plan evidence

Status: **${plan.n7Status}**  
Generated: ${plan.generatedAt}  
N6 baseline: \`${plan.n6AcceptanceCommit}\`  
Current commit: \`${plan.headCommit}\`

No Tencent Cloud API, credential, remote state, cluster or billable resource was accessed while generating this evidence.

## Reviewed cloud contract

| Item | Decision |
| --- | --- |
| Region | ${plan.cloudContract.region} |
| TKE | ${plan.cloudContract.tke.mode} |
| Node pool | ${plan.cloudContract.nodePool.create ? "create" : "do not create"}; ${plan.cloudContract.nodePool.instanceType}; ${plan.cloudContract.nodePool.min}/${plan.cloudContract.nodePool.desired}/${plan.cloudContract.nodePool.max} |
| TCR | ${plan.cloudContract.tcr.mode} |
| COS | ${plan.cloudContract.cos.mode}: ${plan.cloudContract.cos.bucket} |
| Immutable digests | ${plan.cloudContract.immutableImageDigests.length} |
| Monthly cost ceiling | ${plan.costReview.currency} ${plan.costReview.monthlyMin}–${plan.costReview.monthlyMax} |

## Potentially billable managed resources

${creates.map(([name, enabled]) => `- [${enabled ? "x" : " "}] ${name}`).join("\n")}

## Commands held behind explicit authorization

Real cloud plan (does not apply, but reads the real account and remote state):

\`\`\`powershell
${plan.commands.realCloudPlanAfterAuthorization}
\`\`\`

Staging deploy (separate authorization after plan/apply and prerequisite review):

\`\`\`powershell
${plan.commands.deployAfterSeparateAuthorization}
\`\`\`

## Remaining gates

${plan.externalGates.map(item => `- [ ] ${item}`).join("\n")}
`;
}

export function writeStagingPlan(plan, outputRoot) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(path.join(outputRoot, "n7-staging-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeFileSync(path.join(outputRoot, "N7_STAGING_PLAN.md"), renderMarkdown(plan), "utf8");
  writeFileSync(path.join(outputRoot, "terraform-plan-command.txt"), `${plan.commands.realCloudPlanAfterAuthorization}\n`, "utf8");
  writeFileSync(path.join(outputRoot, "helm-render-command.txt"), `${plan.commands.helmRender}\n`, "utf8");
}

function parseArguments(argv) {
  const options = { manifest: "", output: ".artifacts/tke/staging-plan" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--manifest") options.manifest = argv[++index] ?? "";
    else if (argv[index] === "--output") options.output = argv[++index] ?? "";
    else fail(`unknown argument: ${argv[index]}`);
  }
  return options;
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const options = parseArguments(process.argv.slice(2));
  const manifestFile = resolveArtifactFile(repoRoot, options.manifest, "staging manifest");
  const outputRoot = path.resolve(repoRoot, options.output);
  const outputRelative = path.relative(repoRoot, outputRoot).replaceAll("\\", "/");
  if (!outputRelative.startsWith(".artifacts/")) fail("output must stay under the gitignored .artifacts directory");

  execFileSync("git", ["merge-base", "--is-ancestor", N6_ACCEPTANCE_COMMIT, "HEAD"], { cwd: repoRoot, stdio: "ignore" });
  const headCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const manifest = JSON.parse(readFileSync(manifestFile.absolute, "utf8"));
  manifest.__relativePath = manifestFile.relative;
  const plan = buildStagingPlan({ repoRoot, manifest, headCommit });
  writeStagingPlan(plan, outputRoot);
  console.log(`tke-n7: offline staging plan prepared at ${outputRelative}`);
  console.log("tke-n7: no Tencent Cloud API, remote state, credential, resource or cluster was accessed");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`tke-n7: FAILED - ${error.message}`);
    process.exitCode = 1;
  }
}
