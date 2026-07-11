import { spawn } from "node:child_process";

const stages = [
  ["phase boundary", "test:boundary:phase23d"],
  ["Worker component contracts", "test:worker:phase23d"],
  ["bounded metrics", "test:metrics:phase23d"],
  ["query-plan indexes", "test:indexes:phase23d"],
  ["migration replay", "test:migration:phase23d"],
  ["authenticated lifecycle and browser E2E", "test:e2e:phase23d"],
  ["performance and concurrency regression", "test:performance:phase23d"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 23D gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase23d] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase23d] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[phase23d] all performance and quality gates passed\n");
