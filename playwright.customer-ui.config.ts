import { defineConfig, devices } from "@playwright/test";

const backendPort = Number(process.env.CUSTOMER_UI_QA_BACKEND_PORT ?? "3180");
const customerPort = Number(process.env.CUSTOMER_UI_QA_APP_PORT ?? "5383");
const backendUrl = `http://127.0.0.1:${backendPort}`;
const customerUrl = `http://127.0.0.1:${customerPort}`;

export default defineConfig({
  testDir: "./tests/e2e/customer-ui",
  outputDir: "./test-results/customer-ui",
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
  webServer: [
    {
      command: `cross-env BACKEND_PORT=${backendPort} pnpm --filter @xlb/backend dev`,
      url: `${backendUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `cross-env XLB_CUSTOMER_PROXY_TARGET=${backendUrl} pnpm --filter @xlb/customer exec vite --port ${customerPort}`,
      url: `${customerUrl}/customer/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
