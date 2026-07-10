import { defineConfig,devices } from "@playwright/test";

export default defineConfig({
  testDir:"./tests/e2e",
  timeout:60_000,
  fullyParallel:false,
  workers:1,
  reporter:[["list"]],
  use:{...devices["Desktop Chrome"],trace:"retain-on-failure",screenshot:"only-on-failure"},
  webServer:[
    {command:"cross-env BACKEND_PORT=3100 pnpm --filter @xlb/backend dev",url:"http://localhost:3100/health",reuseExistingServer:true,timeout:120_000},
    {command:"cross-env XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3100 pnpm --filter @xlb/customer exec vite --port 5273",url:"http://localhost:5273/customer/",reuseExistingServer:true,timeout:120_000},
    {command:"cross-env XLB_WORKER_PROXY_TARGET=http://127.0.0.1:3100 pnpm --filter @xlb/worker exec vite --port 5274",url:"http://localhost:5274/worker/",reuseExistingServer:true,timeout:120_000},
    {command:"cross-env XLB_ADMIN_PROXY_TARGET=http://127.0.0.1:3100 pnpm --filter @xlb/admin exec vite --port 5275",url:"http://localhost:5275/",reuseExistingServer:true,timeout:120_000},
  ],
});
