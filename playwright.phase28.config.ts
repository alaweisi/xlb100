import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase28-review-reputation.spec.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      browserName: "chromium",
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    },
  }],
  webServer: [
    {
      command: "cross-env BACKEND_PORT=3180 pnpm --filter @xlb/backend dev",
      url: "http://127.0.0.1:3180/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3180 pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port 5383 --strictPort",
      url: "http://127.0.0.1:5383/customer/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_WORKER_PROXY_TARGET=http://127.0.0.1:3180 pnpm --filter @xlb/worker exec vite --host 127.0.0.1 --port 5384 --strictPort",
      url: "http://127.0.0.1:5384/worker/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_ADMIN_PROXY_TARGET=http://127.0.0.1:3180 pnpm --filter @xlb/admin exec vite --host 127.0.0.1 --port 5385 --strictPort",
      url: "http://127.0.0.1:5385/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
