import { spawn } from "node:child_process";

const stages = [
  ["support boundaries", "test:security:phase24b"],
  ["contracts, state machine, and components", "test:support:phase24b"],
  ["migration replay", "test:migration:phase24b"],
  ["authenticated ticket lifecycle", "test:integration:phase24b"],
  ["three-app browser flow", "test:e2e:phase24b"],
  ["workspace typecheck", "typecheck"],
  ["workspace build", "build"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 24B gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase24b] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase24b] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[phase24b] all support ticket MVP gates passed\n");
