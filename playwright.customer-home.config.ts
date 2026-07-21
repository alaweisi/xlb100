import { defineConfig, devices } from "@playwright/test";

const backendPort = Number(process.env.CUSTOMER_HOME_QA_BACKEND_PORT ?? "3182");
const customerPort = Number(process.env.CUSTOMER_HOME_QA_APP_PORT ?? "5385");
const backendUrl = `http://127.0.0.1:${backendPort}`;
const customerUrl = `http://127.0.0.1:${customerPort}`;

export default defineConfig({
  testDir: "./tests/e2e/customer-ui",
  testMatch: "customerHomeEvidence.spec.ts",
  outputDir: "./test-results/customer-home",
  timeout: 90_000,
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
      command: `cross-env BACKEND_PORT=${backendPort} node backend/dist/server.js`,
      url: `${backendUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `cross-env XLB_CUSTOMER_PROXY_TARGET=${backendUrl} pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port ${customerPort}`,
      url: `${customerUrl}/customer/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
