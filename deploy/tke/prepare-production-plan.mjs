import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateDeploymentValues } from "../../scripts/check-tke-delivery-line.mjs";

const fail = message => {
  throw new Error(message);
};

const stripQuotes = value => value.trim().replace(/^(["'])(.*)\1$/, "$2");
const sha256 = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const psQuote = value => `'${String(value).replaceAll("'", "''")}'`;

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  if (/placeholder|replace|example\.invalid|change-me/i.test(value)) fail(`${label} still contains a placeholder`);
  return value.trim();
}

function requireDate(value, label) {
  requireText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    fail(`${label} must be an ISO date or timestamp`);
  }
  return value;
}

function requireHttps(value, label) {
  requireText(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") fail(`${label} must be a valid HTTPS URL`);
  return value;
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

function assertNoUnsafeContent(content, label) {
  const forbidden = [
    [/placeholder/i, "placeholder"],
    [/REPLACE(?:_WITH)?/i, "replacement marker"],
    [/example\.invalid/i, "example.invalid"],
    [/sha256:0{64}/i, "all-zero digest"],
    [/TENCENTCLOUD_SECRET_(?:ID|KEY)/i, "Tencent credential name"],
    [/TENCENTCLOUD_SECURITY_TOKEN/i, "Tencent security token name"],
    [/\b(?:mysql|redis)_password\s*[:=]/i, "database password"],
    [/cos_secret_(?:id|key)\s*[:=]/i, "COS credential"],
  ];
  for (const [pattern, name] of forbidden) {
    if (pattern.test(content)) fail(`${label} contains forbidden ${name}`);
  }
}

function extractImageContract(values) {
  const matches = [...values.matchAll(/repository:\s*([^\s#]+)[\s\S]*?digest:\s*(sha256:[a-f0-9]{64})\b/gi)];
  if (matches.length < 6) fail("production values must contain six repository/digest pairs");
  const names = ["backend", "customer", "worker", "admin", "oa", "dashboard"];
  return Object.fromEntries(names.map((name, index) => [name, {
    repository: stripQuotes(matches[index][1]),
    digest: matches[index][2].toLowerCase(),
  }]));
}

function extractIngressHosts(values) {
  const names = ["api", "customer", "worker", "admin", "oa", "dashboard"];
  const hosts = {};
  for (const name of names) {
    const match = values.match(new RegExp(`^\\s{4}${name}:\\s*(.+?)\\s*$`, "m"));
    if (!match) fail(`missing production ingress host: ${name}`);
    hosts[name] = stripQuotes(match[1].replace(/\s+#.*$/, ""));
    if (/staging|localhost/i.test(hosts[name])) fail(`production ingress host is not production-safe: ${name}`);
  }
  if (new Set(Object.values(hosts)).size !== names.length) fail("all production ingress hosts must be distinct");
  return hosts;
}

function validateN7Evidence(evidence) {
  if (evidence.schemaVersion !== 1) fail("N7 evidence schemaVersion must be 1");
  if (evidence.environment !== "staging" || evidence.n7Status !== "PASS") {
    fail("N8 requires real N7 TKE staging status PASS; PREPARED_OFFLINE is not sufficient");
  }
  requireText(evidence.candidateCommit, "N7 candidateCommit");
  requireText(evidence.tkeClusterId, "N7 tkeClusterId");
  requireText(evidence.kubeContext, "N7 kubeContext");
  requireText(evidence.region, "N7 region");
  requireDate(evidence.completedAt, "N7 completedAt");
  const checks = evidence.validatedChecks ?? {};
  for (const name of [
    "immutableImagePull",
    "mysqlRedisTls",
    "cosPrivateReadWrite",
    "clbTlsIngress",
    "websocket",
    "jobsHeartbeat",
    "rollingUpgradeRollback",
    "nodeDrainPdb",
    "alertsAndCostThresholds",
    "backupMigrationRestore",
  ]) {
    if (checks[name] !== true) fail(`N7 evidence is missing successful check: ${name}`);
  }
  const images = evidence.validatedImages ?? {};
  for (const name of ["backend", "customer", "worker", "admin", "oa", "dashboard"]) {
    if (!images[name] || !/^sha256:[a-f0-9]{64}$/i.test(images[name].digest ?? "")) {
      fail(`N7 evidence is missing immutable image: ${name}`);
    }
  }
  return evidence;
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1) fail("production plan manifest schemaVersion must be 1");
  if (manifest.environment !== "production") fail("production plan manifest environment must be production");
  if (manifest.executionMode !== "offline-preparation") fail("executionMode must be offline-preparation");
  for (const field of ["owner", "releaseOwner", "dataOwner", "onCallOwner", "changeWindow", "approvedKubeContext"]) {
    requireText(manifest[field], field);
  }
  if (/staging|local|kind/i.test(manifest.approvedKubeContext)) {
    fail("approvedKubeContext must identify the dedicated production context");
  }

  const approvals = manifest.authorizations ?? {};
  for (const name of [
    "realCloudPlan",
    "terraformApply",
    "cloudDeploy",
    "dataMigration",
    "trafficCutover",
    "lighthouseDecommission",
  ]) {
    if (approvals[name] !== false) fail(`authorizations.${name} must be explicitly false during offline preparation`);
  }

  const data = manifest.dataReadiness ?? {};
  for (const name of ["backupId", "backupVerifiedAt", "restoreDrillEvidence", "objectSyncEvidence", "migrationRunId"]) {
    requireText(data[name], `dataReadiness.${name}`);
  }
  requireDate(data.backupVerifiedAt, "dataReadiness.backupVerifiedAt");

  const jobs = manifest.jobsSingleActive ?? {};
  requireText(jobs.lighthouseStopProcedure, "jobsSingleActive.lighthouseStopProcedure");
  requireText(jobs.tkeStartProcedure, "jobsSingleActive.tkeStartProcedure");
  requireText(jobs.rollbackProcedure, "jobsSingleActive.rollbackProcedure");

  const rollback = manifest.rollback ?? {};
  requireHttps(rollback.lighthouseHealthUrl, "rollback.lighthouseHealthUrl");
  requireText(rollback.lighthouseReadinessEvidence, "rollback.lighthouseReadinessEvidence");
  if (!Number.isInteger(rollback.previousHelmRevision) || rollback.previousHelmRevision < 1) {
    fail("rollback.previousHelmRevision must be greater than zero");
  }
  if (!Number.isInteger(rollback.dnsTtlSeconds) || rollback.dnsTtlSeconds < 30 || rollback.dnsTtlSeconds > 300) {
    fail("rollback.dnsTtlSeconds must be between 30 and 300");
  }

  const traffic = manifest.traffic ?? {};
  if (traffic.strategy !== "weighted") fail("traffic.strategy must be weighted");
  if (JSON.stringify(traffic.steps) !== JSON.stringify([5, 25, 50, 100])) {
    fail("traffic.steps must be exactly 5,25,50,100");
  }
  if (!Number.isInteger(traffic.observationMinutesPerStep) || traffic.observationMinutesPerStep < 15) {
    fail("traffic.observationMinutesPerStep must be at least 15");
  }
  requireText(traffic.stopConditions, "traffic.stopConditions");
  requireText(traffic.operatorProcedure, "traffic.operatorProcedure");

  const cost = manifest.costReview ?? {};
  if (cost.currency !== "CNY") fail("costReview.currency must be CNY");
  if (!Number.isFinite(cost.monthlyMax) || cost.monthlyMax <= 0) fail("costReview.monthlyMax must be greater than zero");
  requireHttps(cost.sourceUrl, "costReview.sourceUrl");
  requireDate(cost.reviewedAt, "costReview.reviewedAt");
  requireText(cost.owner, "costReview.owner");
  return manifest;
}

export function buildProductionPlan({ repoRoot, manifest, headCommit = "n8-uncommitted" }) {
  validateManifest(manifest);
  const n7File = resolveArtifactFile(repoRoot, manifest.n7EvidenceFile, "n7EvidenceFile");
  const valuesFile = resolveArtifactFile(repoRoot, manifest.valuesFile, "valuesFile");
  const tfvarsFile = resolveArtifactFile(repoRoot, manifest.terraformVarFile, "terraformVarFile");
  const backendFile = resolveArtifactFile(repoRoot, manifest.backendConfig, "backendConfig");

  const n7Content = readFileSync(n7File.absolute, "utf8");
  const valuesContent = readFileSync(valuesFile.absolute, "utf8");
  const tfvarsContent = readFileSync(tfvarsFile.absolute, "utf8");
  const backendContent = readFileSync(backendFile.absolute, "utf8");
  assertNoUnsafeContent(valuesContent, "Production Helm values");
  assertNoUnsafeContent(tfvarsContent, "Production Terraform tfvars");
  assertNoUnsafeContent(backendContent, "Production Terraform backend");
  validateDeploymentValues(valuesContent, "production");

  let n7Evidence;
  try {
    n7Evidence = validateN7Evidence(JSON.parse(n7Content));
  } catch (error) {
    if (error instanceof SyntaxError) fail("N7 evidence must be valid JSON");
    throw error;
  }

  const productionImages = extractImageContract(valuesContent);
  for (const name of Object.keys(productionImages)) {
    const stagingImage = n7Evidence.validatedImages[name];
    if (productionImages[name].repository !== stagingImage.repository || productionImages[name].digest !== stagingImage.digest.toLowerCase()) {
      fail(`production image drifted from N7 validated image: ${name}`);
    }
  }
  const hosts = extractIngressHosts(valuesContent);
  if (!valuesContent.includes(`region: ${n7Evidence.region}`)) fail("production COS region differs from N7 validated region");

  const commands = {
    prepare: `pwsh deploy/tke/xlb-tke.ps1 -Action PrepareProduction -Environment production -ProductionManifest ${psQuote(manifest.__relativePath ?? ".artifacts/tke/production/manifest.json")}`,
    infrastructurePlanAfterAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action PlanInfrastructure -Environment production -ExecutePlan -TerraformVarFile ${psQuote(tfvarsFile.relative)} -BackendConfig ${psQuote(backendFile.relative)} -Confirmation PLAN-INFRASTRUCTURE-PRODUCTION`,
    noTrafficDeployAfterAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action Deploy -Environment production -ValuesFile ${psQuote(valuesFile.relative)} -KubeContext ${psQuote(manifest.approvedKubeContext)} -Apply -Confirmation DEPLOY-XLB-PRODUCTION`,
    migrateAfterAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action Migrate -Environment production -ValuesFile ${psQuote(valuesFile.relative)} -KubeContext ${psQuote(manifest.approvedKubeContext)} -RunId ${psQuote(manifest.dataReadiness.migrationRunId)} -BackupConfirmed -Apply -Confirmation MIGRATE-XLB-PRODUCTION`,
    smokeAfterAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action Smoke -Environment production -KubeContext ${psQuote(manifest.approvedKubeContext)} -Apply -Confirmation SMOKE-XLB-PRODUCTION`,
    rollbackAfterAuthorization: `pwsh deploy/tke/xlb-tke.ps1 -Action Rollback -Environment production -KubeContext ${psQuote(manifest.approvedKubeContext)} -Revision ${manifest.rollback.previousHelmRevision} -Apply -Confirmation ROLLBACK-XLB-PRODUCTION`,
  };

  return {
    schemaVersion: 1,
    n8Status: "PREPARED_OFFLINE",
    generatedAt: new Date().toISOString(),
    headCommit,
    environment: "production",
    n7: {
      candidateCommit: n7Evidence.candidateCommit,
      completedAt: n7Evidence.completedAt,
      tkeClusterId: n7Evidence.tkeClusterId,
      region: n7Evidence.region,
      evidence: { path: n7File.relative, sha256: sha256(n7File.absolute) },
    },
    owners: {
      release: manifest.releaseOwner,
      data: manifest.dataOwner,
      onCall: manifest.onCallOwner,
      overall: manifest.owner,
    },
    changeWindow: manifest.changeWindow,
    approvedKubeContext: manifest.approvedKubeContext,
    inputs: {
      values: { path: valuesFile.relative, sha256: sha256(valuesFile.absolute) },
      terraformVarFile: { path: tfvarsFile.relative, sha256: sha256(tfvarsFile.absolute) },
      backendConfig: { path: backendFile.relative, sha256: sha256(backendFile.absolute) },
    },
    immutableImages: productionImages,
    ingressHosts: hosts,
    dataReadiness: manifest.dataReadiness,
    jobsSingleActive: manifest.jobsSingleActive,
    rollback: manifest.rollback,
    traffic: manifest.traffic,
    costReview: manifest.costReview,
    authorizations: manifest.authorizations,
    commands,
    orderedGates: [
      "P1 Human review of N7 PASS evidence and production infrastructure plan",
      "P2 Separate authorization for production infrastructure apply",
      "P3 Separate authorization for no-traffic TKE production deploy",
      "P4 Backup verification and separate authorization for production migration",
      "P5 Production smoke with jobs still single-active",
      "P6 Separate authorization for weighted traffic cutover 5/25/50/100",
      "P7 Observation window and rollback readiness",
      "P8 Separate authorization after the retention window before Lighthouse decommission",
    ],
  };
}

function renderMarkdown(plan) {
  return `# N8 production cutover offline plan evidence

Status: **${plan.n8Status}**  
Generated: ${plan.generatedAt}  
N7 PASS commit: \`${plan.n7.candidateCommit}\`  
Current commit: \`${plan.headCommit}\`

This plan generation did not read Tencent Cloud credentials, remote state, a Kubernetes cluster, production data or DNS.

## Immutable promotion

| Component | Repository | N7-validated digest reused |
| --- | --- | --- |
${Object.entries(plan.immutableImages).map(([name, image]) => `| ${name} | ${image.repository} | \`${image.digest}\` |`).join("\n")}

## Traffic and rollback

- Strategy: ${plan.traffic.strategy}; steps: ${plan.traffic.steps.join(" -> ")}.
- Observation per step: ${plan.traffic.observationMinutesPerStep} minutes.
- Lighthouse health endpoint: ${plan.rollback.lighthouseHealthUrl}.
- DNS TTL: ${plan.rollback.dnsTtlSeconds} seconds.
- Previous Helm revision: ${plan.rollback.previousHelmRevision}.

## Commands held behind separate authorization

No-traffic deploy:

\`\`\`powershell
${plan.commands.noTrafficDeployAfterAuthorization}
\`\`\`

Migration:

\`\`\`powershell
${plan.commands.migrateAfterAuthorization}
\`\`\`

Rollback:

\`\`\`powershell
${plan.commands.rollbackAfterAuthorization}
\`\`\`

## Ordered gates

${plan.orderedGates.map(item => `- [ ] ${item}`).join("\n")}
`;
}

export function writeProductionPlan(plan, outputRoot) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(path.join(outputRoot, "n8-production-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeFileSync(path.join(outputRoot, "N8_PRODUCTION_PLAN.md"), renderMarkdown(plan), "utf8");
  for (const [name, command] of Object.entries(plan.commands)) {
    writeFileSync(path.join(outputRoot, `${name}.txt`), `${command}\n`, "utf8");
  }
}

function parseArguments(argv) {
  const options = { manifest: "", output: ".artifacts/tke/production-plan" };
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
  const manifestFile = resolveArtifactFile(repoRoot, options.manifest, "production manifest");
  const outputRoot = path.resolve(repoRoot, options.output);
  const outputRelative = path.relative(repoRoot, outputRoot).replaceAll("\\", "/");
  if (!outputRelative.startsWith(".artifacts/")) fail("output must stay under the gitignored .artifacts directory");
  const manifest = JSON.parse(readFileSync(manifestFile.absolute, "utf8"));
  manifest.__relativePath = manifestFile.relative;
  const plan = buildProductionPlan({
    repoRoot,
    manifest,
    headCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
  });
  execFileSync("git", ["merge-base", "--is-ancestor", plan.n7.candidateCommit, "HEAD"], { cwd: repoRoot, stdio: "ignore" });
  writeProductionPlan(plan, outputRoot);
  console.log(`n8-production-plan: prepared offline evidence at ${outputRelative}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`n8-production-plan: FAILED - ${error.message}`);
    process.exitCode = 1;
  }
}
