import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "customer-p6a-discovery-order-visual-qa.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: process.env.XLB_CUSTOMER_QA_BASE_URL ?? "http://127.0.0.1:5373",
    browserName: "chromium",
    colorScheme: "light",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "off",
  },
});
