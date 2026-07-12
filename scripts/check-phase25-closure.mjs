import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "docs/reports/PHASE25_GATE1DEF_SHARED_FOUNDATION_REPORT.md",
  "docs/reports/PHASE25_CUSTOMER_GATE2_GATE3_AUDIT.md",
  "docs/reports/PHASE25_GATE4_GATE5_WORKER_ADMIN_AUDIT.md",
  "docs/reports/PHASE25_GATE6_OA_READINESS_REPORT.md",
  "docs/reports/PHASE25_GATE7_DASHBOARD_READINESS_REPORT.md",
  "scripts/check-phase25-gate1def.mjs",
  "scripts/check-phase25-readiness-gates.mjs",
];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`[phase25-closure] missing ${file}`);
for (const app of ["oa", "dashboard"]) if (existsSync(join(root, "apps", app, "src"))) throw new Error(`[phase25-closure] forbidden fake ${app} runtime`);
const changed = [
  ...execFileSync("git", ["diff", "--name-only", "fb055b1"], { cwd: root, encoding: "utf8" }).split(/\r?\n/),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split(/\r?\n/),
].filter(Boolean).map((file) => file.replaceAll("\\", "/"));
for (const file of changed) {
  if (["backend/", "db/", "deploy/", "infra/", "packages/api-client/"].some((prefix) => file.startsWith(prefix))) {
    throw new Error(`[phase25-closure] prohibited change: ${file}`);
  }
}
if (readdirSync(join(root, "db/migrations")).some((name) => /^054[_-].*\.sql$/i.test(name))) throw new Error("[phase25-closure] migration 054 is forbidden");
process.stdout.write("[phase25-closure] PASS aggregate scope, evidence artifacts, and OA/Dashboard truthfulness verified\n");
