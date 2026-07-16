import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativeOrAbsolute =>
  readFileSync(path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(repoRoot, relativeOrAbsolute), "utf8");

const fail = message => {
  throw new Error(message);
};

export function validateDeploymentValues(content, environment) {
  if (!new RegExp(`global:\\s*[\\s\\S]*?environment:\\s*["']?${environment}["']?`, "i").test(content)) {
    fail(`values environment does not match ${environment}`);
  }

  if (environment === "staging" || environment === "production") {
    const forbidden = [
      [/placeholder/i, "placeholder"],
      [/example\.invalid/i, "example.invalid"],
      [/\b(?:localhost|127\.0\.0\.1|host\.docker\.internal)\b/i, "localhost"],
      [/sha256:0{64}/i, "all-zero digest"],
      [/:latest\b/i, "latest tag"],
    ];
    for (const [pattern, name] of forbidden) {
      if (pattern.test(content)) fail(`${environment} values contain forbidden ${name}`);
    }

    for (const line of content.match(/^\s*tag:\s*.*$/gm) ?? []) {
      const value = line.replace(/^\s*tag:\s*/, "").replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
      if (value) fail(`${environment} images must not use tags`);
    }
    const digests = content.match(/digest:\s*sha256:[a-f0-9]{64}\b/gi) ?? [];
    if (digests.length < 4) fail(`${environment} values require four immutable image digests`);
    if (!/existingSecret:\s*[a-z0-9][a-z0-9.-]+/i.test(content)) {
      fail(`${environment} values require runtimeSecrets.existingSecret`);
    }
    if (!/secretName:\s*[a-z0-9][a-z0-9.-]+/i.test(content)) {
      fail(`${environment} values require an ingress TLS Secret reference`);
    }
    if (!/provider:\s*cos\b/i.test(content) || !/externalExecutionEnabled:\s*true\b/i.test(content)) {
      fail(`${environment} values require COS and the external execution switch together`);
    }
  }
}

export function checkRepository(root = repoRoot) {
  const required = [
    "deploy/tke/xlb-tke.ps1",
    "deploy/tke/bootstrap-tools.ps1",
    "deploy/tke/tool-versions.json",
    "deploy/tke/tests/run-tests.ps1",
    "deploy/tke/tests/check-tke-delivery-line.test.mjs",
    "deploy/tke/prepare-staging-plan.mjs",
    "deploy/tke/staging/staging-plan.example.json",
    "deploy/tke/tests/prepare-staging-plan.test.mjs",
    "deploy/tke/prepare-production-plan.mjs",
    "deploy/tke/production/production-plan.example.json",
    "deploy/tke/tests/prepare-production-plan.test.mjs",
    "deploy/tke/contracts/README.md",
    "deploy/tke/contracts/release-manifest.schema.json",
    "deploy/tke/contracts/images-lock.schema.json",
    "deploy/tke/contracts/cloud-bundle.schema.json",
    "deploy/tke/contracts/checkpoint.schema.json",
    "deploy/tke/contracts/evidence-bundle.schema.json",
    "scripts/check-tke-release-contracts.mjs",
    "deploy/tke/tests/release-contracts.test.mjs",
    "docs/operations/TKE_ONE_COMMAND_RELEASE_CONTRACT.md",
    "deploy/tke/release/image-release.mjs",
    "deploy/tke/release/release-input.example.json",
    "deploy/tke/release/tests/image-release.test.mjs",
    "deploy/tke/bundle/generate-cloud-bundle.mjs",
    "deploy/tke/bundle/reviewed-cloud-input.schema.json",
    "deploy/tke/bundle/reviewed-cloud-input.example.json",
    "deploy/tke/bundle/tests/generate-cloud-bundle.test.mjs",
    "deploy/tke/guards/safety-guard.mjs",
    "deploy/tke/guards/guard-input.schema.json",
    "deploy/tke/guards/guard-input.example.json",
    "deploy/tke/guards/tests/safety-guard.test.mjs",
    ".github/workflows/tke-delivery-line.yml",
    "deploy/helm/xlb/Chart.yaml",
    "deploy/environments/tke/values-local.yaml",
    "deploy/environments/tke/values-staging.yaml",
    "deploy/environments/tke/values-production.yaml",
    "infra/tencent/terraform/outputs.tf",
  ];
  for (const file of required) {
    if (!existsSync(path.join(root, file))) fail(`missing required TKE delivery artifact: ${file}`);
  }

  const templatesRoot = path.join(root, "deploy/helm/xlb/templates");
  for (const file of readdirSync(templatesRoot).filter(name => /\.ya?ml$/.test(name))) {
    const content = readFileSync(path.join(templatesRoot, file), "utf8");
    if (/^kind:\s*Secret\s*$/m.test(content)) fail(`Chart must not render Secret objects: ${file}`);
  }

  const workflow = readFileSync(path.join(root, ".github/workflows/tke-delivery-line.yml"), "utf8");
  for (const pattern of [/terraform\s+(?:plan|apply)/i, /helm\s+(?:upgrade|install)/i, /kubectl\s+/i, /TENCENTCLOUD_SECRET/i]) {
    if (pattern.test(workflow)) fail(`TKE CI contains a forbidden external-operation pattern: ${pattern}`);
  }
  const versions = JSON.parse(readFileSync(path.join(root, "deploy/tke/tool-versions.json"), "utf8"));
  for (const [name, version] of [
    ["Helm", versions.helm.version],
    ["Terraform", versions.terraform],
    ["Node", versions.node],
  ]) {
    if (!workflow.includes(String(version))) fail(`TKE CI does not use the pinned ${name} version ${version}`);
  }
  for (const [name, tool] of [["Helm", versions.helm], ["kubeconform", versions.kubeconform]]) {
    if (!/^[a-f0-9]{64}$/.test(tool.executableSha256)) fail(`${name} executable checksum is not a SHA-256 value`);
  }

  const entry = readFileSync(path.join(root, "deploy/tke/xlb-tke.ps1"), "utf8");
  for (const action of ["Validate", "ReleaseImages", "GenerateCloudBundle", "VerifySafetyEvidence", "PrepareStaging", "PrepareProduction", "PlanInfrastructure", "Deploy", "Migrate", "Smoke", "Rollback"]) {
    if (!entry.includes(`\"${action}\"`)) fail(`unified TKE entry is missing action ${action}`);
  }
  for (const marker of ["-Apply", "-ExecutePlan", "explicit confirmation required", "must exactly match", "migration.enabled=false"]) {
    if (!entry.includes(marker)) fail(`unified TKE entry is missing safety marker: ${marker}`);
  }
  if (!entry.includes('template $releaseName') || !entry.includes('--show-only "templates/migration-job.yaml"')) {
    fail("Migrate must render only the migration Job with the installed release name");
  }
  if (entry.includes('template "xlb-migration"')) {
    fail("Migrate must not invent a second Helm release name");
  }

  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  for (const script of ["tke:check", "tke:test", "tke:validate", "tke:gate"]) {
    if (!manifest.scripts?.[script]) fail(`package.json is missing ${script}`);
  }

  for (const environment of ["staging", "production"]) {
    const values = readFileSync(path.join(root, `deploy/environments/tke/values-${environment}.yaml`), "utf8");
    if (!/externalExecutionEnabled:\s*true\b/i.test(values)) {
      fail(`${environment} committed values must pair COS with external execution enabled`);
    }
  }
}

function parseArguments(argv) {
  const options = { deploymentReady: false, values: "", environment: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--deployment-ready") options.deploymentReady = true;
    else if (value === "--values") options.values = argv[++index] ?? "";
    else if (value === "--environment") options.environment = argv[++index] ?? "";
    else fail(`unknown argument: ${value}`);
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  checkRepository();
  if (options.values || options.deploymentReady) {
    if (!options.values || !options.environment) fail("--values and --environment are required together");
    const resolved = path.isAbsolute(options.values) ? options.values : path.resolve(repoRoot, options.values);
    if (!existsSync(resolved)) fail(`values file not found: ${options.values}`);
    validateDeploymentValues(readFileSync(resolved, "utf8"), options.environment);
  }
  console.log("tke-delivery-line: static safety checks passed");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`tke-delivery-line: FAILED - ${error.message}`);
    process.exitCode = 1;
  }
}
