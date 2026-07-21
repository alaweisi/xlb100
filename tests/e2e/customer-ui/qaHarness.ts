import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CustomerUiCapturePlanItem {
  surface: string;
  route: string;
  state: string;
  width: number;
  height: number;
  evidencePath: string;
}

export async function installCustomerQaSession(
  page: Page,
  backendUrl = process.env.CUSTOMER_UI_QA_BACKEND_URL ?? "http://127.0.0.1:3180",
) {
  const phone = process.env.CUSTOMER_UI_QA_PHONE ?? "13800000001";
  const requestCode = await page.request.post(`${backendUrl}/api/auth/customer/code`, { data: { phone } });
  expect(requestCode.ok()).toBeTruthy();
  const debugCode = await page.request.get(`${backendUrl}/api/auth/customer/debug-code?phone=${phone}`);
  expect(debugCode.ok()).toBeTruthy();
  const { code } = await debugCode.json();
  const login = await page.request.post(`${backendUrl}/api/auth/customer/login`, { data: { phone, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  expect(session.token).toBeTruthy();
  await page.addInitScript((value) => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
  }, session);
}

export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export async function openCustomerQaRoute(page: Page, item: CustomerUiCapturePlanItem) {
  await page.setViewportSize({ width: item.width, height: item.height });
  const separator = item.route.includes("?") ? "&" : "?";
  await page.goto(`${item.route}${separator}cityCode=hangzhou`);
  await expect(page.locator("body")).toBeVisible();
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(overflow.document, `horizontal overflow: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport + 1);
}

export async function captureCustomerUiEvidence(
  page: Page,
  item: CustomerUiCapturePlanItem,
  root = process.cwd(),
) {
  const target = join(root, item.evidencePath);
  await mkdir(dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: false, animations: "disabled" });
  return target;
}
