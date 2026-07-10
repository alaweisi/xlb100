import { spawn } from "node:child_process";

const probes = [
  ["E2E", "test:e2e:phase22", "e2e"],
  ["security", "test:security:phase22", "security"],
  ["coverage", "test:coverage:phase22", "coverage"],
];

function runProbe(label, script, failure) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("npm_execpath is required to run Phase 22 fail-closed probes");
  return new Promise((resolve, reject) => {
    process.stdout.write(`[phase22 fail-closed] injecting ${label} failure\n`);
    const child = spawn(process.execPath, [pnpmCli, script], {
      env: { ...process.env, XLB_PHASE22_FORCE_FAILURE: failure },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

for (const [label, script, failure] of probes) {
  const code = await runProbe(label, script, failure);
  if (code === 0) {
    process.stderr.write(`[phase22 fail-closed] ${label} probe unexpectedly passed\n`);
    process.exit(1);
  }
  process.stdout.write(`[phase22 fail-closed] ${label} correctly blocked with exit ${code}\n`);
}

process.stdout.write("[phase22 fail-closed] E2E, security, and coverage commands all fail closed\n");
