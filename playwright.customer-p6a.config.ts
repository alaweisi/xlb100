import { defineConfig } from "@playwright/test";

const customerPort = Number(process.env.CUSTOMER_P6A_QA_APP_PORT ?? "5373");
const customerUrl = `http://127.0.0.1:${customerPort}`;

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
    baseURL: process.env.XLB_CUSTOMER_QA_BASE_URL ?? customerUrl,
    browserName: "chromium",
    colorScheme: "light",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: process.env.XLB_CUSTOMER_QA_BASE_URL ? undefined : {
    command: `pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port ${customerPort} --strictPort`,
    url: `${customerUrl}/customer/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
