import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { temporarilyEnrollDemoWorkerPhone } from "./helpers/demoWorkerPhoneFixture.js";

const apiOrigin = "http://localhost:3100";
const customerPhone = `139${Date.now().toString().slice(-8)}`;
let restoreDemoWorkerPhone: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  restoreDemoWorkerPhone = await temporarilyEnrollDemoWorkerPhone();
});

test.afterAll(async () => {
  try {
    await restoreDemoWorkerPhone?.();
  } finally {
    const pool = getMysqlPool();
    const [customers] = await pool.query<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM customers WHERE phone=?",
      [customerPhone],
    );
    for (const customer of customers) {
      await pool.query("DELETE FROM customer_addresses WHERE customer_id=?", [customer.id]);
      await pool.query("DELETE FROM customers WHERE id=?", [customer.id]);
    }
  }
});

async function assertNoPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return () => expect(errors, "browser console/page errors").toEqual([]);
}

test("customer profile and address book use persisted APIs", async ({ page }) => {
  const assertClean = await assertNoPageErrors(page);
  const detail = `Phase21 smoke ${Date.now()}`;
  const codeRequest = await page.request.post(`${apiOrigin}/api/auth/customer/code`, {
    data: { phone: customerPhone },
  });
  expect(codeRequest.ok()).toBeTruthy();
  const debug = await page.request.get(
    `${apiOrigin}/api/auth/customer/debug-code?phone=${customerPhone}`,
  );
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json() as { code: string };
  const login = await page.request.post(`${apiOrigin}/api/auth/customer/login`, {
    data: { phone: customerPhone, code },
  });
  const session = await login.json();
  expect(login.ok(), JSON.stringify(session)).toBeTruthy();
  await page.addInitScript((value) => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
  }, session);
  await page.goto("http://localhost:5273/customer/profile?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "账户信息" })).toBeVisible();
  await expect(page.getByText("已安全连接")).toBeVisible();
  await page.getByLabel("Contact").fill("Phase21 Customer");
  await page.getByLabel("Mobile").fill(customerPhone);
  await page.getByLabel("District").fill("西湖区");
  await page.getByLabel("Detail address").fill(detail);
  await page.getByRole("button", { name: "Add address" }).click();
  await expect(page.getByRole("status")).toContainText("Address added");
  await page.getByText(detail).locator("..").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toContainText("Address deleted");
  assertClean();
});

test("worker location page reports private location through the Phase 20 API", async ({ page }) => {
  const assertClean = await assertNoPageErrors(page);
  await page.goto("http://localhost:5274/worker/profile?cityCode=hangzhou");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByRole("button", { name: "填入本地调试码" }).click();
  await page.getByRole("button", { name: "登录师傅端" }).click();
  await expect(page.getByRole("heading", { name: "Location & Availability" })).toBeVisible();
  await page.getByRole("button", { name: "Report current location" }).click();
  await expect(page.locator("strong", { hasText: "fresh" })).toBeVisible();
  await expect(page.getByText("Private exact")).toBeVisible();
  assertClean();
});

test("admin operations renders real city-scoped orders, SKUs and certification queue", async ({ page }) => {
  const assertClean = await assertNoPageErrors(page);
  const codeRequest = await page.request.post(`${apiOrigin}/api/auth/admin/code`, {
    data: { username: "admin_hz" },
  });
  expect(codeRequest.ok()).toBeTruthy();
  const debug = await page.request.get(
    `${apiOrigin}/api/auth/admin/debug-code?username=admin_hz`,
  );
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json() as { code: string };
  const login = await page.request.post(`${apiOrigin}/api/auth/admin/login`, {
    data: { username: "admin_hz", code },
  });
  const session = await login.json();
  expect(login.ok(), JSON.stringify(session)).toBeTruthy();
  await page.addInitScript((value) => {
    localStorage.setItem("xlb.admin.token", value.token);
    localStorage.setItem("xlb.admin.userId", value.userId);
    localStorage.setItem("xlb.admin.role", value.role);
    localStorage.setItem("xlb.admin.username", "admin_hz");
  }, session);
  await page.goto("http://localhost:5275/#/platform-operations?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "订单与师傅" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "城市订单" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SKU Availability" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Worker Certification Review" })).toBeVisible();
  await expect(page.getByText("演示权限已收敛")).toBeVisible();
  assertClean();
});
