import { spawn } from "node:child_process";

const stages = [
  ["API client reliability", "test:api-client:phase23b"],
  ["atomic outbox delivery", "test:outbox:phase23b"],
  ["migration replay", "test:migration:phase23b"],
  ["critical dependency audit", "audit:critical"],
];

function runScript(label, script) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 23B gates");
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[phase23b] ${label}\n`);
    const child = spawn(process.execPath, [pnpmCli, script], { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script] of stages) {
  const code = await runScript(label, script);
  if (code !== 0) {
    process.stderr.write(`[phase23b] BLOCKED at ${label} (exit ${code})\n`);
    process.exit(code);
  }
}

process.stdout.write("\n[phase23b] all event and API reliability gates passed\n");
