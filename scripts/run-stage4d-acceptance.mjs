import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const skipBrowser = process.argv.includes("--skip-browser");
const skipFullRegression = process.argv.includes("--skip-full-regression");

function resolvePnpmInvocation() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, prefix: [process.env.npm_execpath] };
  }
  if (process.platform !== "win32") return { command: "pnpm", prefix: [] };

  const located = spawnSync("where.exe", ["pnpm.cmd"], { encoding: "utf8", windowsHide: true });
  if (located.status !== 0) throw new Error("pnpm.cmd is not available on PATH");
  for (const executable of located.stdout.split(/\r?\n/u).filter(Boolean)) {
    const cli = path.join(path.dirname(executable.trim()), "node_modules", "pnpm", "bin", "pnpm.mjs");
    if (existsSync(cli)) return { command: process.execPath, prefix: [cli] };
  }
  throw new Error("cannot resolve the pnpm Node entrypoint");
}

const pnpm = resolvePnpmInvocation();
const steps = [
  ["workspace dependency link integrity", ["check:workspace-links"]],
  ["contract integrity", ["check:contracts"]],
  ["critical dependency audit", ["audit:critical"]],
  ["workspace lint", ["lint"]],
  ["workspace typecheck", ["typecheck"]],
  ["workspace build", ["build"]],
  ["Provider readiness", ["gate:provider-readiness"]],
  ["Stage 4A data reliability", ["gate:stage4a"]],
  ["Stage 4C security/performance/fault injection", ["gate:stage4c"]],
  ...(!skipFullRegression
    ? [["full unit/contract/integration/security regression", ["test"]]]
    : []),
  ["architecture preflight", ["preflight"]],
  ["Stage 4B cross-app E2E", ["test:e2e:stage4b", ...(skipBrowser ? ["--", "--api-only"] : [])]],
];

for (const [name, args] of steps) {
  process.stdout.write(`\n[stage4d] ${name}\n`);
  const result = spawnSync(pnpm.command, [...pnpm.prefix, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\n[stage4d] unified local acceptance gates passed\n");
