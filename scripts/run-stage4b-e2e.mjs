import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

export const STAGE4B_API_STEPS = Object.freeze([
  {
    id: "provider-readiness",
    name: "truthful Provider readiness",
    args: ["gate:provider-readiness"],
  },
  {
    id: "authenticated-core-lifecycle",
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
]);

export const STAGE4B_BROWSER_STEPS = Object.freeze([
  {
    id: "three-app-persisted-operations-smoke",
    name: "three-app persisted operations smoke",
    args: ["exec", "playwright", "test", "tests/e2e/phase21-three-app-smoke.spec.ts"],
  },
  {
    id: "authenticated-three-app-acceptance",
    name: "authenticated three-app acceptance",
    args: ["exec", "playwright", "test", "tests/e2e/phase25-authenticated-acceptance.spec.ts"],
  },
  {
    id: "support-cross-role-lifecycle",
    name: "support cross-role lifecycle",
    args: ["exec", "playwright", "test", "tests/e2e/phase24b-support-ticket.spec.ts"],
  },
  {
    id: "notification-inbox-lifecycle",
    name: "notification inbox lifecycle",
    args: ["test:e2e:phase27"],
  },
  {
    id: "review-and-reputation-lifecycle",
    name: "review and reputation lifecycle",
    args: ["test:e2e:phase28"],
  },
  {
    id: "marketing-and-coupon-lifecycle",
    name: "marketing and coupon lifecycle",
    args: ["test:e2e:phase29"],
  },
]);

export function selectStage4bSteps({ apiOnly = false, browserOnly = false } = {}) {
  if (apiOnly && browserOnly) {
    throw new Error("--api-only and --browser-only cannot be combined");
  }
  return browserOnly
    ? STAGE4B_BROWSER_STEPS
    : apiOnly
      ? STAGE4B_API_STEPS
      : [...STAGE4B_API_STEPS, ...STAGE4B_BROWSER_STEPS];
}

export function runStage4b(argumentsList = process.argv.slice(2)) {
  const apiOnly = argumentsList.includes("--api-only");
  const browserOnly = argumentsList.includes("--browser-only");
  const pnpm = resolvePnpmInvocation();
  const steps = selectStage4bSteps({ apiOnly, browserOnly });
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    process.stdout.write(`\n[stage4b] ${step.name}\n`);
    const parentReportId =
      process.env.XLB_PLAYWRIGHT_REPORT_ID?.trim() || "stage4b";
    const result = spawnSync(pnpm.command, [...pnpm.prefix, ...step.args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        XLB_PLAYWRIGHT_REPORT_ID:
          `${parentReportId}-${String(index + 1).padStart(2, "0")}-${step.id}`,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  process.stdout.write("\n[stage4b] all requested cross-app E2E gates passed\n");
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) runStage4b();
