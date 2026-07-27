import { defineConfig,devices } from "@playwright/test";
import { engineeringReporter } from "./playwright.evidence";

export default defineConfig({
  testDir:"./tests/e2e",
  timeout:60_000,
  forbidOnly:true,
  fullyParallel:false,
  workers:1,
  reporter: engineeringReporter(),
  use:{...devices["Desktop Chrome"],trace:"retain-on-failure",screenshot:"only-on-failure"},
  webServer:[
    {command:"cross-env BACKEND_HOST=127.0.0.1 BACKEND_PORT=3100 pnpm --filter @xlb/backend dev",url:"http://127.0.0.1:3100/health",reuseExistingServer:false,timeout:120_000},
    {command:"cross-env XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3100 pnpm --filter @xlb/customer exec vite --host 127.0.0.1 --port 5273 --strictPort",url:"http://127.0.0.1:5273/customer/",reuseExistingServer:false,timeout:120_000},
    {command:"cross-env XLB_WORKER_PROXY_TARGET=http://127.0.0.1:3100 pnpm --filter @xlb/worker exec vite --host 127.0.0.1 --port 5274 --strictPort",url:"http://127.0.0.1:5274/worker/",reuseExistingServer:false,timeout:120_000},
    {command:"cross-env XLB_ADMIN_PROXY_TARGET=http://127.0.0.1:3100 pnpm --filter @xlb/admin exec vite --host 127.0.0.1 --port 5275 --strictPort",url:"http://127.0.0.1:5275/",reuseExistingServer:false,timeout:120_000},
  ],
});
