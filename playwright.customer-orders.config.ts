import { defineConfig, devices } from "@playwright/test";

const customerPort = Number(process.env.CUSTOMER_ORDERS_QA_APP_PORT ?? "5391");
const customerUrl = `http://127.0.0.1:${customerPort}`;

export default defineConfig({
  testDir: "./tests/e2e/customer-ui",
  testMatch: "customerOrdersEvidence.spec.ts",
  outputDir: "./test-results/customer-orders",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: customerUrl,
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port ${customerPort} --strictPort`,
    url: `${customerUrl}/customer/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
