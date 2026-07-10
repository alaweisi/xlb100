import { defineConfig,devices } from "@playwright/test";

export default defineConfig({
  testDir:"./tests/e2e",
  timeout:60_000,
  fullyParallel:false,
  workers:1,
  reporter:[["list"]],
  use:{...devices["Desktop Chrome"],trace:"retain-on-failure",screenshot:"only-on-failure"},
  webServer:[
    {command:"cmd /c \"set BACKEND_PORT=3100&& npx pnpm --filter @xlb/backend dev\"",url:"http://localhost:3100/health",reuseExistingServer:true,timeout:120_000},
    {command:"cmd /c \"set XLB_CUSTOMER_PROXY_TARGET=http://127.0.0.1:3100&& npx pnpm --filter @xlb/customer exec vite --port 5273\"",url:"http://localhost:5273/customer/",reuseExistingServer:true,timeout:120_000},
    {command:"cmd /c \"set XLB_WORKER_PROXY_TARGET=http://127.0.0.1:3100&& npx pnpm --filter @xlb/worker exec vite --port 5274\"",url:"http://localhost:5274/worker/",reuseExistingServer:true,timeout:120_000},
    {command:"cmd /c \"set XLB_ADMIN_PROXY_TARGET=http://127.0.0.1:3100&& npx pnpm --filter @xlb/admin exec vite --port 5275\"",url:"http://localhost:5275/",reuseExistingServer:true,timeout:120_000},
  ],
});
