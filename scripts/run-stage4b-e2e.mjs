import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const apiOnly = process.argv.includes("--api-only");
const browserOnly = process.argv.includes("--browser-only");

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
const apiSteps = [
  {
    name: "truthful Provider readiness",
    args: ["gate:provider-readiness"],
  },
  {
    name: "authenticated Customer/Worker/Admin core lifecycle",
    args: [
      "exec", "vitest", "run", "--project", "db-serial",
      "tests/integration/phase23dWorkerLifecycleE2E.test.ts",
      "tests/integration/mockPaymentWebhook.test.ts",
      "tests/integration/phase22CrossPhaseE2E.test.ts",
      "tests/integration/phase28ReviewReputationLifecycle.test.ts",
      "tests/integration/phase29MarketingOrderLifecycle.test.ts",
    ],
  },
];

const browserSteps = [
  {
    name: "Customer OTP login, logout, and 401 recovery",
    args: ["test:e2e:customer-auth"],
  },
  {
    name: "three-app persisted operations smoke",
    args: ["exec", "playwright", "test", "tests/e2e/phase21-three-app-smoke.spec.ts"],
  },
  {
    name: "authenticated three-app acceptance",
    args: ["exec", "playwright", "test", "tests/e2e/phase25-authenticated-acceptance.spec.ts"],
  },
  {
    name: "support cross-role lifecycle",
    args: ["exec", "playwright", "test", "tests/e2e/phase24b-support-ticket.spec.ts"],
  },
  {
    name: "notification inbox lifecycle",
    args: ["test:e2e:phase27"],
  },
  {
    name: "review and reputation lifecycle",
    args: ["test:e2e:phase28"],
  },
  {
    name: "marketing and coupon lifecycle",
    args: ["test:e2e:phase29"],
  },
];

const steps = browserOnly ? browserSteps : apiOnly ? apiSteps : [...apiSteps, ...browserSteps];
for (const step of steps) {
  process.stdout.write(`\n[stage4b] ${step.name}\n`);
  const result = spawnSync(pnpm.command, [...pnpm.prefix, ...step.args], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\n[stage4b] all requested cross-app E2E gates passed\n");
