import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "oa-dashboard-visual.spec.ts",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1024 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "cross-env BACKEND_PORT=3200 pnpm --filter @xlb/backend dev",
      url: "http://127.0.0.1:3200/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_OA_PROXY_TARGET=http://127.0.0.1:3200 VITE_ADMIN_ORIGIN=http://127.0.0.1:5275 pnpm --filter @xlb/oa exec vite --host 127.0.0.1 --port 5276",
      url: "http://127.0.0.1:5276/oa/",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_ADMIN_PROXY_TARGET=http://127.0.0.1:3200 VITE_OA_ORIGIN=http://127.0.0.1:5276 pnpm --filter @xlb/admin exec vite --host 127.0.0.1 --port 5275",
      url: "http://127.0.0.1:5275/",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @xlb/dashboard dev",
      url: "http://127.0.0.1:5177/dashboard/",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
