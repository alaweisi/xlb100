import { spawn } from "node:child_process";

const stages = [
  ["Phase 2 boundaries", "test:security:phase24c2"],
  ["Phase 2 contracts", "test:contract:phase24c2"],
  ["migration 049 replay", "test:migration:phase24c2"],
  ["routing and SLA integration", "test:integration:phase24c2"],
  ["Admin configuration UI", "test:ui:phase24c2"],
  ["workspace typecheck", "typecheck"],
  ["workspace build", "build"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 24C Phase 2 gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase24c2] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase24c2] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}
process.stdout.write("\n[phase24c2] all routing/SLA gates passed\n");
