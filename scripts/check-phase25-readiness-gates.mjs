import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const reports = ["docs/reports/PHASE25_GATE6_OA_READINESS_REPORT.md", "docs/reports/PHASE25_GATE7_DASHBOARD_READINESS_REPORT.md"];
for (const report of reports) {
  if (!existsSync(join(root, report))) throw new Error(`[phase25-readiness] missing ${report}`);
  if (!readFileSync(join(root, report), "utf8").includes("Result: BLOCKED")) throw new Error(`[phase25-readiness] report must state BLOCKED: ${report}`);
}
for (const app of ["oa", "dashboard"]) {
  if (existsSync(join(root, "apps", app, "src"))) throw new Error(`[phase25-readiness] ${app} runtime is forbidden before readiness approval`);
  const allowed = new Set(["README.md", "package.json"]);
  for (const entry of readdirSync(join(root, "apps", app))) if (!allowed.has(entry)) throw new Error(`[phase25-readiness] unexpected ${app} artifact: ${entry}`);
}
process.stdout.write("[phase25-readiness] PASS OA/Dashboard remain readiness-blocked with no fake runtime\n");
