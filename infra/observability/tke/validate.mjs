import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function parseJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath}: JSON/YAML parse failed: ${error.message}`);
    return null;
  }
}

function balanced(expression) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  let quote = null;
  let escaped = false;
  for (const character of expression) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if ("([{ ".includes(character) && character !== " ") {
      stack.push(character);
    } else if (pairs[character]) {
      if (stack.pop() !== pairs[character]) return false;
    }
  }
  return quote === null && stack.length === 0;
}

const contract = parseJson("infra/observability/tke/metric-contract.json");
const rulesDocument = parseJson("infra/observability/tke/prometheus-rules.yaml");
const dashboard = parseJson("infra/observability/tke/grafana-dashboard.json");
const jobsDashboard = parseJson("infra/observability/tke/grafana-jobs-reliability-dashboard.json");
const cloudBoundaries = parseJson("infra/observability/tke/cloud-alert-boundaries.yaml");

if (contract && rulesDocument) {
  const metricsSource = readFileSync(resolve(root, contract.applicationMetricSource), "utf8");
  const implementedApplicationMetrics = new Set(metricsSource.match(/xlb_[a-z0-9_]+/gu) ?? []);
  const platformMetrics = new Set(contract.platformMetrics);
  const alerts = new Map();
  for (const group of rulesDocument.groups ?? []) {
    if (!group.name || !Array.isArray(group.rules)) fail("prometheus-rules.yaml: each group needs name and rules");
    for (const rule of group.rules ?? []) {
      if (!rule.alert || typeof rule.expr !== "string" || !rule.expr.trim()) {
        fail(`prometheus-rules.yaml: invalid rule in group ${group.name ?? "<unknown>"}`);
        continue;
      }
      if (alerts.has(rule.alert)) fail(`prometheus-rules.yaml: duplicate alert ${rule.alert}`);
      alerts.set(rule.alert, rule);
      if (!balanced(rule.expr)) fail(`prometheus-rules.yaml: unbalanced expression for ${rule.alert}`);
      if (!rule.labels?.severity || !rule.labels?.owner) fail(`${rule.alert}: severity and owner labels are required`);
      if (!rule.annotations?.runbook) fail(`${rule.alert}: runbook annotation is required`);
      const customReferences = new Set(rule.expr.match(/xlb_[a-z0-9_]+/gu) ?? []);
      for (const metric of customReferences) {
        if (!implementedApplicationMetrics.has(metric)) fail(`${rule.alert}: application metric ${metric} is not implemented in ${contract.applicationMetricSource}`);
      }
      const platformReferences = new Set(rule.expr.match(/(?:kube|container)_[a-z0-9_]+/gu) ?? []);
      for (const metric of platformReferences) {
        if (!platformMetrics.has(metric)) fail(`${rule.alert}: platform metric ${metric} is not in the explicit allowlist`);
      }
      const declaredReferences = new Set(contract.ruleMetricReferences[rule.alert] ?? []);
      for (const metric of [...customReferences, ...platformReferences]) {
        if (!declaredReferences.has(metric)) fail(`${rule.alert}: expression metric ${metric} is missing from ruleMetricReferences`);
      }
    }
  }
  for (const [alert, references] of Object.entries(contract.ruleMetricReferences)) {
    const rule = alerts.get(alert);
    if (!rule) {
      fail(`metric-contract.json: referenced alert ${alert} does not exist`);
      continue;
    }
    for (const metric of references) {
      if (!rule.expr.includes(metric)) fail(`${alert}: declared metric ${metric} is absent from expression`);
      if (metric.startsWith(contract.applicationMetricPrefix) && !implementedApplicationMetrics.has(metric)) {
        fail(`${alert}: ${metric} is not present in application source`);
      }
      if (!metric.startsWith(contract.applicationMetricPrefix) && !platformMetrics.has(metric)) {
        fail(`${alert}: platform metric ${metric} is not in the explicit allowlist`);
      }
    }
  }
  if (alerts.size !== Object.keys(contract.ruleMetricReferences).length) {
    fail("metric-contract.json: every alert must declare its metric references");
  }
}

if (dashboard) {
  if (dashboard.uid !== "xlb-tke-operations" || !Array.isArray(dashboard.panels) || dashboard.panels.length < 8) {
    fail("grafana-dashboard.json: expected importable XLB dashboard with at least eight panels");
  }
  const dashboardText = JSON.stringify(dashboard);
  for (const metric of dashboardText.match(/xlb_[a-z0-9_]+/gu) ?? []) {
    const source = contract ? readFileSync(resolve(root, contract.applicationMetricSource), "utf8") : "";
    if (!source.includes(metric)) fail(`grafana-dashboard.json: ${metric} is not implemented by backend metrics`);
  }
  for (const metric of dashboardText.match(/(?:kube|container)_[a-z0-9_]+/gu) ?? []) {
    if (!contract.platformMetrics.includes(metric)) fail(`grafana-dashboard.json: platform metric ${metric} is not allowlisted`);
  }
  for (const panel of dashboard.panels ?? []) {
    for (const target of panel.targets ?? []) {
      if (target.expr && !balanced(target.expr)) fail(`grafana-dashboard.json: panel ${panel.id} has unbalanced PromQL`);
    }
  }
}

if (jobsDashboard) {
  if (jobsDashboard.uid !== "xlb-tke-jobs-reliability" || !Array.isArray(jobsDashboard.panels) || jobsDashboard.panels.length < 8) {
    fail("grafana-jobs-reliability-dashboard.json: expected importable jobs dashboard with at least eight panels");
  }
  const source = contract ? readFileSync(resolve(root, contract.applicationMetricSource), "utf8") : "";
  for (const metric of JSON.stringify(jobsDashboard).match(/xlb_[a-z0-9_]+/gu) ?? []) {
    if (!source.includes(metric)) fail(`grafana-jobs-reliability-dashboard.json: ${metric} is not implemented by backend metrics`);
  }
  for (const metric of JSON.stringify(jobsDashboard).match(/(?:kube|container)_[a-z0-9_]+/gu) ?? []) {
    if (!contract.platformMetrics.includes(metric)) fail(`grafana-jobs-reliability-dashboard.json: platform metric ${metric} is not allowlisted`);
  }
  for (const panel of jobsDashboard.panels ?? []) {
    for (const target of panel.targets ?? []) {
      if (target.expr && !balanced(target.expr)) fail(`grafana-jobs-reliability-dashboard.json: panel ${panel.id} has unbalanced PromQL`);
    }
  }
}

if (cloudBoundaries) {
  for (const service of ["mysql", "redis", "cos", "clb", "tke", "logs", "cost"]) {
    const boundary = cloudBoundaries.services?.[service];
    if (!boundary?.currentGap || !Array.isArray(boundary.requiredSignals) || boundary.requiredSignals.length === 0) {
      fail(`cloud-alert-boundaries.yaml: ${service} needs signals and an explicit current gap`);
    }
  }
  if (cloudBoundaries.mode !== "contract-only-no-cloud-policy-created") {
    fail("cloud-alert-boundaries.yaml: mode must remain non-applying");
  }
}

if (contract) {
  const backendService = readFileSync(resolve(root, "deploy/helm/xlb/templates/backend-service.yaml"), "utf8");
  const serviceMonitor = readFileSync(resolve(root, "deploy/helm/xlb/templates/servicemonitor.yaml"), "utf8");
  const helpers = readFileSync(resolve(root, "deploy/helm/xlb/templates/_helpers.tpl"), "utf8");
  if (!backendService.includes("kind: Service") || !backendService.includes("name: http")) {
    fail("N1 contract drift: backend must expose a Service with named http port");
  }
  if (!serviceMonitor.includes("path: /metrics") || !serviceMonitor.includes("port: http")) {
    fail("N1 contract drift: ServiceMonitor must scrape backend http:/metrics");
  }
  if (!helpers.includes("app.kubernetes.io/component")) {
    fail("N1 contract drift: component label helper is missing");
  }
  const requiredRunbookTerms = {
    "docs/operations/TKE_RELEASE_ROLLBACK_RUNBOOK.md": ["READ_ONLY_DEFAULT", "EXPLICIT_AUTHORIZATION_REQUIRED", "NO_AUTO_EXECUTION"],
    "docs/operations/TKE_NODE_FAILURE_RUNBOOK.md": ["READ_ONLY_DEFAULT", "EXPLICIT_AUTHORIZATION_REQUIRED", "NO_AUTO_EXECUTION"],
    "docs/operations/TKE_DATABASE_RECOVERY_RUNBOOK.md": ["READ_ONLY_DEFAULT", "EXPLICIT_AUTHORIZATION_REQUIRED", "NO_AUTO_EXECUTION"],
    "docs/operations/TKE_COST_ANOMALY_RUNBOOK.md": ["READ_ONLY_DEFAULT", "EXPLICIT_AUTHORIZATION_REQUIRED", "NO_AUTO_EXECUTION"]
  };
  for (const runbook of contract.requiredRunbooks) {
    try {
      const contents = readFileSync(resolve(root, runbook), "utf8");
      for (const term of requiredRunbookTerms[runbook] ?? []) {
        if (!contents.includes(term)) fail(`${runbook}: missing required safety term ${term}`);
      }
      if (!contents.includes("<approved-context>") || !contents.includes("<namespace>")) {
        fail(`${runbook}: commands must retain explicit context and namespace placeholders`);
      }
    } catch (error) {
      fail(`${runbook}: cannot read required runbook: ${error.message}`);
    }
  }
}

const promtool = spawnSync("promtool", ["check", "rules", resolve(here, "prometheus-rules.yaml")], {encoding: "utf8"});
if (promtool.error?.code === "ENOENT") {
  notes.push("SKIP: promtool not installed; deterministic JSON/YAML structure, PromQL balance, and metric-contract fallback checks passed, but fallback is not an official PromQL parser");
} else if (promtool.status !== 0) {
  fail(`promtool check rules failed: ${(promtool.stderr || promtool.stdout).trim()}`);
} else {
  notes.push("promtool check rules passed");
}

const diffCheck = spawnSync("git", ["diff", "--check"], {cwd: root, encoding: "utf8"});
if (diffCheck.status !== 0) fail(`git diff --check failed: ${(diffCheck.stderr || diffCheck.stdout).trim()}`);
const stagedDiffCheck = spawnSync("git", ["diff", "--cached", "--check"], {cwd: root, encoding: "utf8"});
if (stagedDiffCheck.status !== 0) fail(`git diff --cached --check failed: ${(stagedDiffCheck.stderr || stagedDiffCheck.stdout).trim()}`);

for (const note of notes) console.log(note.startsWith("SKIP:") ? note : `NOTE: ${note}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: TKE observability rules, dashboard, metric references, cloud boundaries, runbooks, and diff are valid offline.");
