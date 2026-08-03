import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const customerAuth = read("../apps/customer/src/pages/customerPageShell.tsx");
const customerApp = read("../apps/customer/src/app/App.tsx");
const customerDemo = read("../apps/customer/src/investorDemo.tsx");
const customerOrder = read("../apps/customer/src/pages/CustomerOrderCreatePage.tsx");
const workerAuth = read("../apps/worker/src/app/workerAuth.ts");
const workerStore = read("../apps/worker/src/features/auth/store.ts");
const workerApp = read("../apps/worker/src/app/App.tsx");
const workerLogin = read("../apps/worker/src/pages/AuthPages.tsx");
const workerDemo = read("../apps/worker/src/investorDemo.tsx");
const adminAuth = read("../apps/admin/src/adminAuth.ts");
const adminApp = read("../apps/admin/src/app/App.tsx");
const adminDemo = read("../apps/admin/src/investorDemo.tsx");
const adminReviewPage = read("../apps/admin/src/pages/ReviewModerationPage.tsx");

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

test("Customer, Worker and Admin consume the shared fixed demo identity and city contract", () => {
  assert.match(customerDemo, /INVESTOR_DEMO_IDENTITIES\.customer\.phone/u);
  assert.match(customerDemo, /INVESTOR_DEMO_IDENTITIES\.cityCode/u);
  assert.match(customerApp, /IS_CUSTOMER_INVESTOR_DEMO[\s\S]*CUSTOMER_INVESTOR_DEMO_PHONE/u);
  assert.match(customerApp, /readOnly=\{IS_CUSTOMER_INVESTOR_DEMO\}/u);
  assert.match(customerOrder, /INVESTOR_DEMO_IDENTITIES\.customer\.phone/u);
  assert.match(workerDemo, /INVESTOR_DEMO_IDENTITIES\.worker\.phone/u);
  assert.match(workerDemo, /INVESTOR_DEMO_IDENTITIES\.cityCode/u);
  assert.match(workerLogin, /IS_WORKER_INVESTOR_DEMO[\s\S]*WORKER_INVESTOR_DEMO_PHONE/u);
  assert.match(workerLogin, /readOnly=\{IS_WORKER_INVESTOR_DEMO\}/u);
  assert.match(workerApp, /IS_WORKER_INVESTOR_DEMO[\s\S]*WORKER_INVESTOR_DEMO_CITY_CODE/u);
  assert.match(adminDemo, /INVESTOR_DEMO_IDENTITIES\.admin\.username/u);
  assert.match(adminDemo, /INVESTOR_DEMO_IDENTITIES\.cityCode/u);
  assert.match(adminApp, /IS_ADMIN_INVESTOR_DEMO[\s\S]*ADMIN_INVESTOR_DEMO_USERNAME/u);
  assert.match(adminApp, /IS_ADMIN_INVESTOR_DEMO[\s\S]*ADMIN_INVESTOR_DEMO_CITY_CODE/u);
  assert.match(adminAuth, /IS_ADMIN_INVESTOR_DEMO\) return ADMIN_INVESTOR_DEMO_CITY_CODE/u);
});

test("Admin Investor Demo keeps finance hidden and loads only the scoped review list", () => {
  assert.doesNotMatch(adminApp, /item\.key === "settlement"\) return true/u);
  assert.match(
    adminApp,
    /\["orderTrace", "dispatch", "platformOperations", "reviewModeration"\]/u,
  );
  assert.match(
    adminReviewPage,
    /IS_ADMIN_INVESTOR_DEMO[\s\S]*Promise\.resolve\(\{ items: \[\], nextCursor: null \}\)/u,
  );
});
