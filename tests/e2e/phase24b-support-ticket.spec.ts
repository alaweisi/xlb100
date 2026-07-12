import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return () => expect(errors, "browser console/page errors").toEqual([]);
}

async function customerLogin(page: Page) {
  const phone = "13800000001";
  expect((await page.request.post("http://localhost:3100/api/auth/customer/code", { data: { phone } })).ok()).toBeTruthy();
  const debug = await page.request.get(`http://localhost:3100/api/auth/customer/debug-code?phone=${phone}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await page.request.post("http://localhost:3100/api/auth/customer/login", { data: { phone, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await page.addInitScript(value => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  }, session);
  return session;
}

async function adminLogin(page: Page) {
  const username = "admin_hz";
  expect((await page.request.post("http://localhost:3100/api/auth/admin/code", { data: { username } })).ok()).toBeTruthy();
  const debug = await page.request.get(`http://localhost:3100/api/auth/admin/debug-code?username=${username}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await page.request.post("http://localhost:3100/api/auth/admin/login", { data: { username, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await page.addInitScript(value => {
    localStorage.setItem("xlb.admin.token", value.token);
    localStorage.setItem("xlb.admin.userId", value.userId);
    localStorage.setItem("xlb.admin.role", value.role);
    localStorage.setItem("xlb.admin.username", "admin_hz");
  }, session);
  return session;
}

test("Customer creates, Admin resolves, and Customer reads the same persisted support ticket", async ({ page }) => {
  const assertClean = collectBrowserErrors(page);
  const subject = `Phase24B browser ${Date.now()}`;
  await customerLogin(page);
  const adminSession = await adminLogin(page);

  await page.goto("http://localhost:5273/customer/support?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "Customer Support" })).toBeVisible();
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Description").fill("Created from the real Customer UI for cross-app support verification");
  await page.getByRole("button", { name: "Submit issue" }).click();
  await expect(page.getByText("Support ticket created")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(subject) })).toBeVisible();

  await page.goto("http://localhost:5275/#/support?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "Support Ticket Queue" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: subject });
  await row.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(subject) })).toBeVisible();
  await page.getByLabel("Assigned agent ID").fill(adminSession.userId);
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("assign completed")).toBeVisible();
  await page.getByLabel("Resolution note").fill("Verified and answered by the support operator");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("resolve completed")).toBeVisible();

  await page.goto("http://localhost:5273/customer/support?cityCode=hangzhou");
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  const customerRow = page.getByRole("row").filter({ hasText: subject });
  await expect(customerRow.getByText("resolved", { exact: true })).toBeVisible();
  await customerRow.getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(subject) })).toBeVisible();
  await expect(page.getByText("resolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Verified and answered by the support operator", { exact: true })).toBeVisible();
  assertClean();
});
