import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

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

const skipFullRegression = process.argv.includes("--skip-full-regression");
const skipBrowser = process.argv.includes("--skip-browser");
const stage4Flags = [
  ...(skipFullRegression ? ["--skip-full-regression"] : []),
  ...(skipBrowser ? ["--skip-browser"] : []),
];
const pnpm = resolvePnpmInvocation();
const steps = [
  ["Stage 5 audit contract tests", ["test:stage5-audit"]],
  ["Stage 5 readiness matrix", ["check:stage5-audit"]],
  [
    "Stage 4 evidence replay",
    ["gate:stage4d", ...(stage4Flags.length > 0 ? ["--", ...stage4Flags] : [])],
  ],
  ["Stage 5 final fail-closed decision", ["check:stage5-audit"]],
];

for (const [name, args] of steps) {
  process.stdout.write(`\n[stage5] ${name}\n`);
  const result = spawnSync(pnpm.command, [...pnpm.prefix, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\n[stage5] ENGINEERING AUDIT PASSED WITH DECLARED BLOCKERS\n");
process.stdout.write("[stage5] STAGING/PRODUCTION RELEASE REMAINS NO-GO\n");
