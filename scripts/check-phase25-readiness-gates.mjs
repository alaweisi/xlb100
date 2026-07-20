import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const reports = ["docs/reports/PHASE25_GATE6_OA_READINESS_REPORT.md", "docs/reports/PHASE25_GATE7_DASHBOARD_READINESS_REPORT.md"];
for (const report of reports) {
  if (!existsSync(join(root, report))) throw new Error(`[phase25-readiness] missing ${report}`);
  if (!readFileSync(join(root, report), "utf8").includes("Result: BLOCKED")) throw new Error(`[phase25-readiness] report must state BLOCKED: ${report}`);
}
const executionControl = readFileSync(join(root, "docs/execution/PHASE25_UI_STANDARDIZATION_EXECUTION_CONTROL.md"), "utf8");
const platformArchitecture = readFileSync(join(root, "docs/architecture/26_XLB_PLATFORM_FOUNDATION.md"), "utf8");
const runtimeApproved =
  executionControl.includes("2026-07-19 five-surface correction") &&
  executionControl.includes("OA and Dashboard now have truthful runtimes") &&
  platformArchitecture.includes("The former Phase 0 placeholder statement is superseded");

if (!runtimeApproved) {
  for (const app of ["oa", "dashboard"]) {
    if (existsSync(join(root, "apps", app, "src"))) throw new Error(`[phase25-readiness] ${app} runtime is forbidden before readiness approval`);
    const allowed = new Set(["README.md", "package.json"]);
    for (const entry of readdirSync(join(root, "apps", app))) if (!allowed.has(entry)) throw new Error(`[phase25-readiness] unexpected ${app} artifact: ${entry}`);
  }
  process.stdout.write("[phase25-readiness] PASS OA/Dashboard remain readiness-blocked with no fake runtime\n");
} else {
  const requiredFiles = [
    "apps/oa/src/main.tsx",
    "apps/dashboard/src/App.tsx",
    "apps/dashboard/src/main.tsx",
  ];
  for (const file of requiredFiles) {
    if (!existsSync(join(root, file))) throw new Error(`[phase25-readiness] approved runtime file is missing: ${file}`);
  }
  const oa = readFileSync(join(root, "apps/oa/src/main.tsx"), "utf8");
  const dashboard = readFileSync(join(root, "apps/dashboard/src/App.tsx"), "utf8");
  for (const marker of ["AdminOperationsApp", 'surface="oa"', "AppErrorBoundary"]) {
    if (!oa.includes(marker)) throw new Error(`[phase25-readiness] OA truthful-runtime marker is missing: ${marker}`);
  }
  for (const marker of ["createDashboardApi", "getOperations()", '"/health/ready"', '"/api/system/status"']) {
    if (!dashboard.includes(marker)) throw new Error(`[phase25-readiness] Dashboard truthful-runtime marker is missing: ${marker}`);
  }
  if (/\b(?:mock|fake)\b/i.test(`${oa}\n${dashboard}`)) {
    throw new Error("[phase25-readiness] OA/Dashboard runtime contains fake-data markers");
  }
  process.stdout.write("[phase25-readiness] PASS superseding five-surface approval has truthful OA/Dashboard runtimes\n");
}
