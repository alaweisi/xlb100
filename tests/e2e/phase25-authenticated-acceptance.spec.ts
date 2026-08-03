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

async function customerSession(page: Page) {
  const request = await page.request.post(`${apiOrigin}/api/auth/customer/code`, {
    data: { phone: customerPhone },
  });
  expect(request.ok()).toBeTruthy();
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
}

async function adminSession(page: Page) {
  const request = await page.request.post(`${apiOrigin}/api/auth/admin/code`, {
    data: { username: "admin_hz" },
  });
  expect(request.ok()).toBeTruthy();
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
}

test("Phase 25 authenticated Customer acceptance evidence", async ({ page }, testInfo) => {
  const assertClean = await assertNoPageErrors(page);
  await customerSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5273/customer/profile?cityCode=hangzhou");
  await expect(page).toHaveURL(/\/customer\/profile\?cityCode=hangzhou$/u);
  await expect(page.getByRole("heading", { name: "账户信息" })).toBeVisible();
  await expect(page.getByText("已安全连接", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录并清除本机演示数据" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "手机号登录" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("customer-profile-authenticated-390x844.png"), fullPage: true });
  assertClean();
});

test("Phase 25 authenticated Worker acceptance evidence", async ({ page }, testInfo) => {
  const assertClean = await assertNoPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5274/worker/profile?cityCode=hangzhou");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByRole("button", { name: "填入本地调试码" }).click();
  await page.getByRole("button", { name: "登录师傅端" }).click();
  await expect(page).toHaveURL(/\/worker\/profile\?cityCode=hangzhou$/u);
  await expect(page.getByRole("heading", { name: "Location & Availability" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "当前登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出并清除数据" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("worker-profile-authenticated-390x844.png"), fullPage: true });
  assertClean();
});

test("Phase 25 authenticated Admin acceptance evidence", async ({ page }, testInfo) => {
  const assertClean = await assertNoPageErrors(page);
  await adminSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:5275/#/platform-operations?cityCode=hangzhou");
  await expect(page).toHaveURL(/\/#\/platform-operations\?cityCode=hangzhou$/u);
  await expect(page.getByRole("heading", { name: "订单与师傅" })).toBeVisible();
  await expect(page.getByText("已安全登录", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出并清除演示数据" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("admin-platform-operations-authenticated-1440x900.png"), fullPage: true });
  assertClean();
});
