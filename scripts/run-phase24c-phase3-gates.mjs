import { spawn } from "node:child_process";

const stages = [
  ["Phase 3 boundaries", "test:security:phase24c3"],
  ["Phase 3 contracts", "test:contract:phase24c3"],
  ["migration 050 replay", "test:migration:phase24c3"],
  ["SLA breach and workbench integration", "test:integration:phase24c3"],
  ["Admin agent workbench UI", "test:ui:phase24c3"],
  ["workspace typecheck", "typecheck"],
  ["workspace build", "build"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 24C Phase 3 gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase24c3] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase24c3] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}
process.stdout.write("\n[phase24c3] all SLA breach/workbench gates passed\n");
