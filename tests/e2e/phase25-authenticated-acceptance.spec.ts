import { expect, test } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { hashPhoneIdentity } from "../../backend/src/auth/phoneIdentity.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

const workerPhone = "13800000001";
let workerPhoneBefore: { phone_hash: string | null; phone_masked: string | null; updated_at: Date } | null = null;

test.beforeAll(async () => {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { phone_hash: string | null; phone_masked: string | null; updated_at: Date })[]>(
    "SELECT phone_hash,phone_masked,updated_at FROM worker_profiles WHERE worker_id='worker-demo-hangzhou'",
  );
  workerPhoneBefore = rows[0] ?? null;
  if (!workerPhoneBefore) throw new Error("worker-demo-hangzhou fixture is missing");
  await getMysqlPool().query(
    "UPDATE worker_profiles SET phone_hash=?,phone_masked=? WHERE worker_id='worker-demo-hangzhou'",
    [hashPhoneIdentity(workerPhone), "138****0001"],
  );
});

test.afterAll(async () => {
  if (workerPhoneBefore) {
    await getMysqlPool().query(
      "UPDATE worker_profiles SET phone_hash=?,phone_masked=?,updated_at=? WHERE worker_id='worker-demo-hangzhou'",
      [workerPhoneBefore.phone_hash, workerPhoneBefore.phone_masked, workerPhoneBefore.updated_at],
    );
  }
});

async function customerSession(page: import("@playwright/test").Page) {
  const request = await page.request.post("http://localhost:3100/api/auth/customer/code", { data: { phone: "13800000001" } });
  expect(request.ok()).toBeTruthy();
  const debug = await page.request.get("http://localhost:3100/api/auth/customer/debug-code?phone=13800000001");
  const { code } = await debug.json();
  const login = await page.request.post("http://localhost:3100/api/auth/customer/login", { data: { phone: "13800000001", code } });
  const session = await login.json();
  await page.addInitScript((value) => { localStorage.setItem("xlb.customer.token", value.token); localStorage.setItem("xlb.customer.userId", value.userId); }, session);
}

async function adminSession(page: import("@playwright/test").Page) {
  const request = await page.request.post("http://localhost:3100/api/auth/admin/code", { data: { username: "admin_hz" } });
  expect(request.ok()).toBeTruthy();
  const debug = await page.request.get("http://localhost:3100/api/auth/admin/debug-code?username=admin_hz");
  const { code } = await debug.json();
  const login = await page.request.post("http://localhost:3100/api/auth/admin/login", { data: { username: "admin_hz", code } });
  const session = await login.json();
  await page.addInitScript((value) => {
    localStorage.setItem("xlb.admin.token", value.token);
    localStorage.setItem("xlb.admin.userId", value.userId);
    localStorage.setItem("xlb.admin.role", value.role);
    localStorage.setItem("xlb.admin.username", "admin_hz");
  }, session);
}

test("Phase 25 authenticated Customer acceptance evidence", async ({ page }, testInfo) => {
  await customerSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5273/customer/profile?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("customer-profile-authenticated-390x844.png"), fullPage: true });
});

test("Phase 25 authenticated Worker acceptance evidence", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5274/worker/profile?cityCode=hangzhou");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByRole("button", { name: "Fill debug code" }).click();
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Location & Availability" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("worker-profile-authenticated-390x844.png"), fullPage: true });
});

test("Phase 25 authenticated Admin acceptance evidence", async ({ page }, testInfo) => {
  await adminSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:5275/#/platform-operations?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "Platform Operations" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("admin-platform-operations-authenticated-1440x900.png"), fullPage: true });
});
