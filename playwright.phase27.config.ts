import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase27-notification-inbox.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
  ],
  webServer: [
    {
      command: "cross-env BACKEND_PORT=3170 pnpm --filter @xlb/backend dev",
      url: "http://127.0.0.1:3170/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3170 pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port 5373 --strictPort",
      url: "http://127.0.0.1:5373/customer/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_WORKER_PROXY_TARGET=http://127.0.0.1:3170 pnpm --filter @xlb/worker exec vite --host 127.0.0.1 --port 5374 --strictPort",
      url: "http://127.0.0.1:5374/worker/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
