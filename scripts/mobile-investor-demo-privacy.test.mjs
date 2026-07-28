import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const customerAuth = read("../apps/customer/src/pages/customerPageShell.tsx");
const customerApp = read("../apps/customer/src/app/App.tsx");
const workerAuth = read("../apps/worker/src/app/workerAuth.ts");
const workerStore = read("../apps/worker/src/features/auth/store.ts");
const workerApp = read("../apps/worker/src/app/App.tsx");
const adminAuth = read("../apps/admin/src/adminAuth.ts");
const adminApp = read("../apps/admin/src/app/App.tsx");

test("Investor Demo tokens are short-lived and never use persistent storage", () => {
  assert.match(customerAuth, /IS_CUSTOMER_INVESTOR_DEMO[\s\S]*window\.sessionStorage/u);
  assert.match(customerAuth, /expiresAt: Date\.now\(\) \+ CUSTOMER_DEMO_SESSION_TTL_MS/u);
  assert.match(adminAuth, /IS_ADMIN_INVESTOR_DEMO \? window\.sessionStorage : window\.localStorage/u);
  assert.match(adminAuth, /expiresAt: Date\.now\(\) \+ ADMIN_DEMO_SESSION_TTL_MS/u);
  assert.match(adminAuth, /IS_ADMIN_INVESTOR_DEMO\) return false/u);
  assert.match(adminAuth, /!Number\.isFinite\(expiresAt\)/u);
  assert.match(workerAuth, /expiresAt: Date\.now\(\) \+ WORKER_DEMO_SESSION_TTL_MS/u);
  assert.doesNotMatch(workerStore, /localStorage|sessionStorage/u);
});

test("logout, expiry and 401 paths clear identity and local business data", () => {
  assert.match(customerAuth, /clearCustomerSessionAndBusinessData/u);
  assert.match(customerAuth, /ORDER_HISTORY_KEY/u);
  assert.match(customerApp, /isCustomerSessionUnauthorized[\s\S]*clearCustomerSessionAndBusinessData/u);
  assert.match(workerApp, /isUnauthorizedError[\s\S]*clearWorkerData\(\)[\s\S]*setSession\(null\)/u);
  assert.match(workerAuth, /WORKER_SESSION_EXPIRED_EVENT/u);
  assert.match(workerApp, /addEventListener\(WORKER_SESSION_EXPIRED_EVENT/u);
  assert.match(adminAuth, /status === 401[\s\S]*clearAdminSession\(\)/u);
  assert.match(adminAuth, /clearAdminStorageKeys\(window\.localStorage\)/u);
  assert.match(adminAuth, /clearAdminStorageKeys\(window\.sessionStorage\)/u);
  assert.match(adminApp, /ADMIN_SESSION_EXPIRED_EVENT/u);
});

test("authentication code contains no token or phone logging", () => {
  for (const source of [customerAuth, workerAuth, adminAuth]) {
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error|debug)/u);
  }
  assert.doesNotMatch(adminApp, />\s*\{session\.userId\}\s*</u);
  assert.doesNotMatch(adminApp, /\bloginAdmin\s*\(/u);
  assert.doesNotMatch(adminApp, /getAdminDebugCode/u);
  assert.doesNotMatch(workerApp, /Bearer \{session\.token\}|session\.token\.slice/u);
});
