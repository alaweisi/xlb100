import { defineConfig, devices } from "@playwright/test";
import { engineeringReporter } from "./playwright.evidence";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "dashboard-wallboard.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: engineeringReporter(),
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm --filter @xlb/dashboard exec vite --host 127.0.0.1 --port 5177 --strictPort",
    url: "http://127.0.0.1:5177/dashboard/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
