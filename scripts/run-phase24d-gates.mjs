import { spawn } from "node:child_process";
const stages = [
  ["boundaries", "test:boundary:phase24d"],
  ["contracts", "test:contract:phase24d"],
  ["three-app UI bindings", "test:ui:phase24d"],
  ["migration 051 replay", "test:migration:phase24d"],
  ["realtime integration", "test:integration:phase24d"],
  ["workspace typecheck", "typecheck"],
  ["workspace build", "build"],
  ["critical dependency audit", "audit:critical"],
];
function run(label, script) {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error("npm_execpath is required for Phase 24D gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase24d] ${label}\n`);
    const child = spawn(process.execPath, [pnpm, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject); child.on("exit", code => resolve(code ?? 1));
  });
}
for (const [label, script] of stages) { const code = await run(label, script); if (code) process.exit(code); }
process.stdout.write("\n[phase24d] aggregate gate passed\n");
