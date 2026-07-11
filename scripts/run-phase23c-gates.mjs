import { spawn } from "node:child_process";

const stages = [
  ["frontend architecture and component contracts", "test:frontend:phase23c"],
  ["marker migration replay", "test:migration:phase23c"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 23C gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase23c] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase23c] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[phase23c] all frontend engineering gates passed\n");
