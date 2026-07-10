import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const args = [
  vitest,
  "run",
  "--workspace", "vitest.phase22.workspace.ts",
  "--project", "phase22-coverage",
  "--coverage",
  "--coverage.provider", "v8",
  "--coverage.all=false",
  "--coverage.include", "backend/src/observability/metrics.ts",
  "--coverage.include", "backend/src/security/rateLimit.ts",
  "--coverage.reporter", "text",
  "--coverage.reporter", "json-summary",
  "--coverage.reporter", "html",
  "--coverage.reportsDirectory", "coverage/phase22",
  "--coverage.thresholds.lines", "80",
  "--coverage.thresholds.functions", "80",
  "--coverage.thresholds.statements", "80",
  "--coverage.thresholds.branches", "75",
];

const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: "inherit" });
child.on("error", error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
child.on("exit", code => process.exit(code ?? 1));
