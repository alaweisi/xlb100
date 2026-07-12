import { spawn } from "node:child_process";

const stages = [
  ["Phase 1 boundaries", "test:security:phase24c1"],
  ["Phase 1 contracts", "test:contract:phase24c1"],
  ["migration 048 replay", "test:migration:phase24c1"],
  ["agent and skill-group integration", "test:integration:phase24c1"],
  ["workspace typecheck", "typecheck"],
  ["workspace build", "build"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 24C Phase 1 gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase24c1] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase24c1] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}
process.stdout.write("\n[phase24c1] all agent/skill-group gates passed\n");
