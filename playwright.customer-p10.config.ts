import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "customer-p10-final-acceptance.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/customer-p10",
  use: {
    baseURL: "http://127.0.0.1:5276",
    browserName: "chromium",
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      args: ["--disable-extensions"],
    },
  },
  webServer: [
    {
      command: "pnpm exec cross-env NODE_ENV=development BACKEND_PORT=3310 node backend/dist/server.js",
      url: "http://127.0.0.1:3310/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm exec cross-env XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3310 pnpm --dir apps/customer exec vite preview --host 127.0.0.1 --port 5276",
      url: "http://127.0.0.1:5276/customer/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
