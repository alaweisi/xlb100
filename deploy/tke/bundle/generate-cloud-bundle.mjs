import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";

import { validateDeploymentValues } from "../../../scripts/check-tke-delivery-line.mjs";
import { validateContract } from "../../../scripts/check-tke-release-contracts.mjs";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(sourceRoot, "../../..");
const inputSchema = JSON.parse(readFileSync(path.join(sourceRoot, "reviewed-cloud-input.schema.json"), "utf8"));
const validateInputSchema = new Ajv({ allErrors: true, strict: true }).compile(inputSchema);
const components = ["backend", "customer", "worker", "admin", "oa", "dashboard"];

const fail = message => {
  throw new Error(message);
};

const normalizeRelative = value => value.replaceAll("\\", "/");
const sha256Content = content => createHash("sha256").update(content).digest("hex");
const sha256File = file => sha256Content(readFileSync(file));
const jsonLine = value => `${JSON.stringify(value, null, 2)}\n`;
const hclString = value => JSON.stringify(value);
const yamlString = value => JSON.stringify(value);

function resolveIgnoredPath(repoRoot, candidate, label, { mustExist = true, directory = false } = {}) {
  if (typeof candidate !== "string" || !candidate) fail(`${label} is required`);
  const absolute = path.resolve(repoRoot, candidate);
  const relative = normalizeRelative(path.relative(repoRoot, absolute));
  if (relative.startsWith("../") || path.isAbsolute(relative)) fail(`${label} must stay inside the repository`);
  if (relative !== ".artifacts" && !relative.startsWith(".artifacts/")) {
    fail(`${label} must be stored under the gitignored .artifacts directory`);
  }
  if (mustExist && !existsSync(absolute)) fail(`${label} not found: ${relative}`);
  if (directory && path.extname(relative)) fail(`${label} must be a directory`);
  return { absolute, relative };
}

function scanNoSecretsOrPlaceholders(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanNoSecretsOrPlaceholders(child, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:password|passwd|secret|secretId|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKey|accessKeyId|accessKeySecret|authorizations)$/i.test(key)) {
        fail(`${location}.${key} is forbidden secret, credential, or runtime authority material`);
      }
      scanNoSecretsOrPlaceholders(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (/placeholder|replace(?:_with)?|example\.invalid|change[-_ ]?me|\btodo\b/i.test(value)) {
    fail(`${location} contains a placeholder marker`);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:^|\W)AKID[A-Za-z0-9]{12,}(?:$|\W)/.test(value)) {
    fail(`${location} contains credential-like material`);
  }
  if (/\b(?:localhost|127\.0\.0\.1|host\.docker\.internal)\b/i.test(value)) {
    fail(`${location} contains a local-only host`);
  }
  if (/^sha256:0{64}$/.test(value)) fail(`${location} contains an all-zero image digest`);
}

function assertInputSchema(input) {
  if (!validateInputSchema(input)) {
    const details = validateInputSchema.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ") ?? "unknown error";
    fail(`reviewed cloud input schema validation failed: ${details}`);
  }
}

function assertNoDrift(input, imageLock) {
  for (const [label, actual] of [
    ["reviewedScope.environment", input.reviewedScope.environment],
    ["terraform.environment", input.terraform.environment],
    ["helm.environment", input.helm.environment],
  ]) {
    if (actual !== input.environment) fail(`${label} drifted from environment ${input.environment}`);
  }
  for (const [label, actual] of [
    ["reviewedScope.region", input.reviewedScope.region],
    ["registry.region", input.registry.region],
    ["terraform.region", input.terraform.region],
    ["stateBackend.region", input.stateBackend.region],
    ["helm.region", input.helm.region],
  ]) {
    if (actual !== input.region) fail(`${label} drifted from region ${input.region}`);
  }
  for (const [label, actual] of [
    ["reviewedScope.vpcId", input.reviewedScope.vpcId],
    ["terraform.vpcId", input.terraform.vpcId],
  ]) {
    if (actual !== input.network.vpcId) fail(`${label} drifted from VPC ${input.network.vpcId}`);
  }
  if (imageLock.releaseId !== input.releaseId) fail("image lock releaseId drifted from reviewed releaseId");
  if (imageLock.sourceCommit !== input.sourceCommit) fail("image lock sourceCommit drifted from reviewed sourceCommit");
  for (const name of components) {
    const expected = `${input.registry.host}/${input.registry.namespace}/${name}`;
    if (imageLock.images[name].repository !== expected) {
      fail(`${name} image repository drifted from reviewed registry: expected ${expected}`);
    }
  }
}

function assertTerraformSemantics(input) {
  const tf = input.terraform;
  if (tf.createTkeCluster === Boolean(tf.existingTkeClusterId)) {
    fail("select exactly one TKE source: createTkeCluster or existingTkeClusterId");
  }
  if (tf.createNodePool && tf.nodeSshKeyIds.length === 0) fail("managed node pool requires at least one SSH key ID");
  if (!(tf.nodePoolMinSize <= tf.nodePoolDesiredCapacity && tf.nodePoolDesiredCapacity <= tf.nodePoolMaxSize)) {
    fail("node pool capacity must satisfy min <= desired <= max");
  }
  if (tf.manageTcrRepositories && tf.createTcrInstance === Boolean(tf.existingTcrInstanceId)) {
    fail("managed TCR repositories require exactly one TCR source");
  }
  if (!tf.createTcrInstance && tf.manageTcrRepositories && !tf.existingTcrInternalEndpoint) {
    fail("existing TCR source requires existingTcrInternalEndpoint");
  }
  if (tf.createCosBucket === Boolean(tf.existingCosBucketName)) {
    fail("select exactly one COS source: createCosBucket or existingCosBucketName");
  }
  const selectedCosBucket = tf.createCosBucket ? tf.cosBucketName : tf.existingCosBucketName;
  if (selectedCosBucket !== input.dependencies.cosBucket) fail("COS bucket drifted between Terraform and Helm dependencies");
  if (input.costReview.monthlyMin > input.costReview.monthlyMax) fail("costReview monthlyMin must not exceed monthlyMax");
  if (new Set(Object.values(input.helm.hosts)).size !== components.length) fail("all API and five product ingress hosts must be distinct");
  if (input.environment === "production") {
    for (const name of ["backend", "customer", "worker", "admin", "oa", "dashboard"]) {
      if (input.helm.replicas[name] < 2) fail(`production ${name} requires at least two replicas`);
    }
  }
}

function renderTfvars(input) {
  const tf = input.terraform;
  const d = input.dependencies;
  const managedCreation = [tf.createTkeCluster, tf.createNodePool, tf.createTcrInstance, tf.manageTcrRepositories, tf.createCosBucket].some(Boolean);
  const tags = Object.entries(input.tags).sort(([left], [right]) => left.localeCompare(right));
  return `project_name = "xlb"
environment  = ${hclString(input.environment)}
region       = ${hclString(input.region)}

enable_billable_resources          = ${managedCreation}
billable_resources_acknowledgement = ${hclString(managedCreation ? `CREATE-TKE-${input.environment.toUpperCase()}` : "")}
deletion_protection                = true

create_tke_cluster      = ${tf.createTkeCluster}
existing_tke_cluster_id = ${hclString(tf.existingTkeClusterId)}
vpc_id                  = ${hclString(input.network.vpcId)}
vpc_cidr                = ${hclString(input.network.vpcCidr)}
subnet_ids              = ${JSON.stringify(input.network.subnetIds)}
cluster_version         = ${hclString(tf.clusterVersion)}
cluster_level           = ${hclString(tf.clusterLevel)}
cluster_network_type    = ${hclString(tf.clusterNetworkType)}
pod_cidr                = ${hclString(tf.podCidr)}
service_cidr            = ${hclString(tf.serviceCidr)}
cluster_os              = ${hclString(tf.clusterOs)}

create_node_pool                   = ${tf.createNodePool}
create_node_security_group         = ${tf.createNodeSecurityGroup}
existing_node_security_group_ids   = ${JSON.stringify(tf.existingNodeSecurityGroupIds)}
node_instance_type                 = ${hclString(tf.nodeInstanceType)}
node_ssh_key_ids                   = ${JSON.stringify(tf.nodeSshKeyIds)}
node_pool_min_size                 = ${tf.nodePoolMinSize}
node_pool_desired_capacity         = ${tf.nodePoolDesiredCapacity}
node_pool_max_size                 = ${tf.nodePoolMaxSize}
node_pool_enable_autoscaling       = ${tf.nodePoolEnableAutoscaling}
node_system_disk_type              = ${hclString(tf.nodeSystemDiskType)}
node_system_disk_size              = ${tf.nodeSystemDiskSize}

create_tcr_instance           = ${tf.createTcrInstance}
existing_tcr_instance_id      = ${hclString(tf.existingTcrInstanceId)}
existing_tcr_internal_endpoint = ${hclString(tf.existingTcrInternalEndpoint)}
tcr_instance_type             = ${hclString(tf.tcrInstanceType)}
manage_tcr_repositories       = ${tf.manageTcrRepositories}
tcr_namespace                 = ${hclString(input.registry.namespace)}

create_cos_bucket        = ${tf.createCosBucket}
cos_bucket_name          = ${hclString(tf.cosBucketName)}
existing_cos_bucket_name = ${hclString(tf.existingCosBucketName)}

mysql_instance_id    = ${hclString(d.mysql.instanceId)}
mysql_internal_host  = ${hclString(d.mysql.host)}
mysql_port           = ${d.mysql.port}
redis_instance_id    = ${hclString(d.redis.instanceId)}
redis_internal_host  = ${hclString(d.redis.host)}
redis_port           = ${d.redis.port}
runtime_secret_name  = ${hclString(input.secretReferences.runtimeSecretName)}

tags = {
${tags.map(([key, value]) => `  ${hclString(key)} = ${hclString(value)}`).join("\n")}
}
`;
}

function renderBackend(input) {
  const backend = input.stateBackend;
  return `region  = ${hclString(input.region)}
bucket  = ${hclString(backend.bucket)}
prefix  = ${hclString(backend.prefix)}
encrypt = true
acl     = "private"
`;
}

function imageYaml(image, indent) {
  const pad = " ".repeat(indent);
  return `${pad}image:
${pad}  repository: ${yamlString(image.repository)}
${pad}  tag: ""
${pad}  digest: ${image.digest}
${pad}  pullPolicy: IfNotPresent`;
}

function renderValues(input, imageLock) {
  const { helm, dependencies: d, secretReferences } = input;
  return `global:
  environment: ${input.environment}

runtimeSecrets:
  existingSecret: ${secretReferences.runtimeSecretName}

backend:
  replicaCount: ${helm.replicas.backend}
${imageYaml(imageLock.images.backend, 2)}

jobs:
  replicaCount: 1

frontends:
  customer:
    replicaCount: ${helm.replicas.customer}
${imageYaml(imageLock.images.customer, 4)}
  worker:
    replicaCount: ${helm.replicas.worker}
${imageYaml(imageLock.images.worker, 4)}
  admin:
    replicaCount: ${helm.replicas.admin}
${imageYaml(imageLock.images.admin, 4)}
  oa:
    replicaCount: ${helm.replicas.oa}
${imageYaml(imageLock.images.oa, 4)}
  dashboard:
    replicaCount: ${helm.replicas.dashboard}
${imageYaml(imageLock.images.dashboard, 4)}

config:
  nodeEnv: production
  mysql:
    host: ${yamlString(d.mysql.host)}
    port: ${d.mysql.port}
    database: ${yamlString(d.mysql.database)}
    user: ${yamlString(d.mysql.user)}
    tlsEnabled: true
  redis:
    host: ${yamlString(d.redis.host)}
    port: ${d.redis.port}
    tlsEnabled: true
  rateLimitBackend: redis
  trustProxyHops: 1
  auth:
    debugCodeEnabled: false
  objectStorage:
    provider: cos
    externalExecutionEnabled: true
    localRoot: /tmp/xlb-object-storage
    cos:
      bucket: ${yamlString(d.cosBucket)}
      region: ${input.region}

ingress:
  enabled: true
  className: ${yamlString(helm.ingressClass)}
  annotations:
    ingress.cloud.tencent.com/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    ingress.cloud.tencent.com/auto-rewrite: "true"
  tls:
    enabled: true
    secretName: ${secretReferences.tlsSecretName}
  hosts:
    api: ${yamlString(helm.hosts.api)}
    customer: ${yamlString(helm.hosts.customer)}
    worker: ${yamlString(helm.hosts.worker)}
    admin: ${yamlString(helm.hosts.admin)}
    oa: ${yamlString(helm.hosts.oa)}
    dashboard: ${yamlString(helm.hosts.dashboard)}

networkPolicy:
  enabled: false

podDisruptionBudget:
  enabled: true
  minAvailable: 1

autoscaling:
  backend:
    enabled: false
  frontends:
    enabled: false

serviceMonitor:
  enabled: false
`;
}

export function buildCloudBundle({ repoRoot = defaultRepoRoot, input, outputDirectory }) {
  assertInputSchema(input);
  scanNoSecretsOrPlaceholders(input);
  const imageLockPath = resolveIgnoredPath(repoRoot, input.imageLockFile, "imageLockFile");
  let imageLock;
  try {
    imageLock = JSON.parse(readFileSync(imageLockPath.absolute, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("imageLockFile must contain valid JSON");
    throw error;
  }
  validateContract("imageLock", imageLock, path.join(repoRoot, "deploy/tke/contracts"));
  scanNoSecretsOrPlaceholders(imageLock);
  assertNoDrift(input, imageLock);
  assertTerraformSemantics(input);

  const output = resolveIgnoredPath(repoRoot, outputDirectory ?? `.artifacts/tke/${input.environment}`, "output", { mustExist: false, directory: true });
  const expectedOutput = `.artifacts/tke/${input.environment}`;
  if (output.relative !== expectedOutput) fail(`output must exactly match ${expectedOutput} to prevent environment drift`);

  const paths = {
    terraformVarFile: `${output.relative}/${input.environment}.tfvars`,
    backendConfig: `${output.relative}/${input.environment}.backend.hcl`,
    valuesFile: `${output.relative}/values-${input.environment}.yaml`,
    imageLockFile: imageLockPath.relative,
  };
  const rendered = {
    [paths.terraformVarFile]: renderTfvars(input),
    [paths.backendConfig]: renderBackend(input),
    [paths.valuesFile]: renderValues(input, imageLock),
  };
  validateDeploymentValues(rendered[paths.valuesFile], input.environment);
  for (const [file, content] of Object.entries(rendered)) scanNoSecretsOrPlaceholders(content, file);

  const hashedFiles = Object.entries(rendered)
    .map(([file, content]) => ({ file, sha256: sha256Content(content) }))
    .concat({ file: imageLockPath.relative, sha256: sha256File(imageLockPath.absolute) })
    .sort((left, right) => left.file.localeCompare(right.file));
  const manifestCore = {
    schemaVersion: 1,
    environment: input.environment,
    region: input.region,
    accountId: input.accountId,
    approvedKubeContext: input.approvedKubeContext,
    network: { vpcId: input.network.vpcId, subnetIds: input.network.subnetIds },
    files: paths,
    secretReferences: input.secretReferences,
    costReview: input.costReview,
  };
  const bundleSha256 = sha256Content(JSON.stringify({
    releaseId: input.releaseId,
    sourceCommit: input.sourceCommit,
    cloudBundle: manifestCore,
    payloadFiles: hashedFiles,
  }));
  const manifest = {
    ...manifestCore,
    bundleSha256,
  };
  validateContract("cloudBundle", manifest, path.join(repoRoot, "deploy/tke/contracts"));

  return {
    repoRoot,
    manifest,
    rendered,
    inventory: {
      schemaVersion: 1,
      releaseId: input.releaseId,
      sourceCommit: input.sourceCommit,
      environment: input.environment,
      region: input.region,
      bundleSha256,
      files: hashedFiles,
      note: "Hash covers the cloud manifest fields plus ordered payload file hashes; only the digest field and inventory file are excluded to avoid a circular digest.",
    },
    output,
  };
}

export function writeCloudBundle(bundle) {
  mkdirSync(bundle.output.absolute, { recursive: true });
  for (const [relative, content] of Object.entries(bundle.rendered)) {
    writeFileSync(path.resolve(bundle.repoRoot, relative), content, "utf8");
  }
  writeFileSync(path.join(bundle.output.absolute, "cloud-bundle.json"), jsonLine(bundle.manifest), "utf8");
  writeFileSync(path.join(bundle.output.absolute, "bundle-files.json"), jsonLine(bundle.inventory), "utf8");
  writeFileSync(path.join(bundle.output.absolute, "bundle.sha256"), `${bundle.manifest.bundleSha256}\n`, "utf8");
}

function parseArguments(argv) {
  const options = { manifest: "", output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--manifest") options.manifest = argv[++index] ?? "";
    else if (argv[index] === "--output") options.output = argv[++index] ?? "";
    else fail(`unknown argument: ${argv[index]}`);
  }
  if (!options.manifest) fail("--manifest is required");
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = resolveIgnoredPath(defaultRepoRoot, options.manifest, "reviewed manifest");
  let input;
  try {
    input = JSON.parse(readFileSync(inputPath.absolute, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("reviewed manifest must contain valid JSON");
    throw error;
  }
  const bundle = buildCloudBundle({ repoRoot: defaultRepoRoot, input, outputDirectory: options.output || undefined });
  writeCloudBundle(bundle);
  console.log(`tke-cloud-bundle: wrote reviewed ${input.environment} bundle to ${bundle.output.relative}`);
  console.log("tke-cloud-bundle: no cloud API, credential, Terraform plan/apply, or Kubernetes cluster was accessed");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`tke-cloud-bundle: FAILED - ${error.message}`);
    process.exitCode = 1;
  }
}
