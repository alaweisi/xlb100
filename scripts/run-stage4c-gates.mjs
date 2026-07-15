import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const testsOnly = process.argv.includes("--tests-only");

function resolvePnpmInvocation() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, prefix: [process.env.npm_execpath] };
  }
  if (process.platform !== "win32") {
    return { command: "pnpm", prefix: [] };
  }

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
  {
    name: "fault injection and existing identity/rate-limit regression",
    args: [
      "exec", "vitest", "run", "--workspace", "vitest.workspace.ts", "--project", "unit-contract",
      "tests/unit/stage4cFaultInjection.test.ts",
      "tests/unit/stage2aIdentitySecurity.test.ts",
      "tests/unit/phase22Observability.test.ts",
    ],
  },
  {
    name: "authorization and rate-limit matrix",
    args: [
      "exec", "vitest", "run", "--workspace", "vitest.workspace.ts", "--project", "db-serial",
      "tests/security/auth/stage4cAuthRateLimit.test.ts",
    ],
  },
  {
    name: "API-edge performance baseline",
    args: [
      "exec", "vitest", "run", "--workspace", "vitest.workspace.ts", "--project", "performance-serial",
      "tests/performance/stage4cSecurityLoad.test.ts",
    ],
  },
];

if (!testsOnly) {
  steps.push({
    name: "backend typecheck",
    args: ["--filter", "@xlb/backend", "typecheck"],
  });
}

for (const step of steps) {
  process.stdout.write(`\n[stage4c] ${step.name}\n`);
  const result = spawnSync(pnpm.command, [...pnpm.prefix, ...step.args], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\n[stage4c] all requested gates passed\n");
