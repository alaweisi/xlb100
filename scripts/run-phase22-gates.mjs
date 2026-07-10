import { spawn } from "node:child_process";

const stages = [
  ["fail-closed self-test", "test:ci-fail-closed"],
  ["cross-phase E2E", "test:e2e:phase22"],
  ["authorization matrix", "test:security:phase22"],
  ["observability", "test:observability:phase22"],
  ["performance", "test:performance:phase22"],
  ["coverage", "test:coverage:phase22"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 22 gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase22] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase22] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[phase22] all quality gates passed\n");
