import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "phase29-marketing-coupon.spec.ts",
  timeout: 240_000,
  expect: { timeout: 25_000 },
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
      command: "cross-env BACKEND_PORT=3190 pnpm --filter @xlb/backend dev",
      url: "http://127.0.0.1:3190/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3190 pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port 5393 --strictPort",
      url: "http://127.0.0.1:5393/customer/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_WORKER_PROXY_TARGET=http://127.0.0.1:3190 pnpm --filter @xlb/worker exec vite --host 127.0.0.1 --port 5394 --strictPort",
      url: "http://127.0.0.1:5394/worker/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cross-env XLB_ADMIN_PROXY_TARGET=http://127.0.0.1:3190 pnpm --filter @xlb/admin exec vite --host 127.0.0.1 --port 5395 --strictPort",
      url: "http://127.0.0.1:5395/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
