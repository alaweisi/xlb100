import { spawn } from "node:child_process";

const stages = [
  ["completion boundaries", "test:boundary:phase24"],
  ["Phase 24C Phase 3", "gate:phase24c3"],
  ["Phase 24D", "gate:phase24d"],
  ["migration 051", "test:migration:phase24d"],
  ["Phase 24E", "gate:phase24e"],
  ["migration 052", "test:migration:phase24e"],
  ["Phase 24F", "gate:phase24f"],
  ["migration 053", "test:migration:phase24f"],
  ["workspace typecheck", "typecheck"],
  ["workspace build", "build"],
  ["critical dependency audit", "audit:critical"],
];

function run(label, script) {
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error("npm_execpath is required for Phase 24 completion");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase24-completion] ${label}\n`);
    const child = spawn(process.execPath, [pnpm, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await run(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase24-completion] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}
process.stdout.write("\n[phase24-completion] all Phase 24 gates passed\n");
