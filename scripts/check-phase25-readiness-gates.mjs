import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const historicalReports = [
  "docs/reports/PHASE25_GATE6_OA_READINESS_REPORT.md",
  "docs/reports/PHASE25_GATE7_DASHBOARD_READINESS_REPORT.md",
];

const appStates = [
  {
    app: "oa",
    authorized: (currentState) => /\|\s*OA v1\s*\|\s*COMPLETE\b/.test(currentState),
  },
  {
    app: "dashboard",
    authorized: (currentState) => /\|\s*Dashboard v1\s*\|\s*LOCKED\b/.test(currentState),
  },
];

function requirePath(root, path, message) {
  if (!existsSync(join(root, path))) {
    throw new Error(`[phase25-readiness] ${message}: ${path}`);
  }
}

export function checkPhase25Readiness(root = process.cwd()) {
  for (const report of historicalReports) {
    requirePath(root, report, "missing historical readiness report");
    if (!readFileSync(join(root, report), "utf8").includes("Result: BLOCKED")) {
      throw new Error(
        `[phase25-readiness] historical report must retain its BLOCKED result: ${report}`,
      );
    }
  }

  const currentStatePath = "docs/CURRENT_STATE.md";
  requirePath(root, currentStatePath, "missing current state");
  const currentState = readFileSync(join(root, currentStatePath), "utf8");
  const results = [];

  for (const { app, authorized } of appStates) {
    const appRoot = join(root, "apps", app);
    requirePath(root, `apps/${app}`, `missing ${app} application directory`);

    if (authorized(currentState)) {
      for (const required of ["README.md", "package.json", "src", "design-qa.md"]) {
        requirePath(
          root,
          `apps/${app}/${required}`,
          `${app} is marked complete/locked but is missing evidence`,
        );
      }
      results.push(`${app}=authorized`);
      continue;
    }

    if (existsSync(join(appRoot, "src"))) {
      throw new Error(`[phase25-readiness] ${app} runtime is forbidden before readiness approval`);
    }
    const allowed = new Set(["README.md", "package.json"]);
    for (const entry of readdirSync(appRoot)) {
      if (!allowed.has(entry)) {
        throw new Error(`[phase25-readiness] unexpected pre-approval ${app} artifact: ${entry}`);
      }
    }
    results.push(`${app}=readiness-blocked`);
  }

  return results;
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  const results = checkPhase25Readiness();
  process.stdout.write(`[phase25-readiness] PASS ${results.join(", ")}\n`);
}
