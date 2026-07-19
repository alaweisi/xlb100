import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { hashPhoneIdentity } from "../../backend/src/auth/phoneIdentity.js";
import {
  cleanupNotificationFixtures,
  createNotificationChannel,
  projectProspectiveEvent,
} from "./helpers/phase27NotificationFixture.js";

const backend = "http://127.0.0.1:3170";
const customerApp = "http://127.0.0.1:5373";
const workerApp = "http://127.0.0.1:5374";
const runKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Session = { token: string; userId: string; role: string };

function authenticatedHeaders(session: Session, cityCode = "hangzhou") {
  return { Authorization: `Bearer ${session.token}`, "x-xlb-city-code": cityCode };
}

async function loginCustomer(request: APIRequestContext, phone: string): Promise<Session> {
  expect((await request.post(`${backend}/api/auth/customer/code`, { data: { phone } })).ok()).toBeTruthy();
  const debug = await request.get(`${backend}/api/auth/customer/debug-code?phone=${encodeURIComponent(phone)}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await request.post(`${backend}/api/auth/customer/login`, { data: { phone, code } });
  expect(login.ok()).toBeTruthy();
  return login.json();
}

async function loginWorker(request: APIRequestContext, phone: string): Promise<Session> {
  expect((await request.post(`${backend}/api/auth/worker/code`, { data: { phone } })).ok()).toBeTruthy();
  const debug = await request.get(`${backend}/api/auth/worker/debug-code?phone=${encodeURIComponent(phone)}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await request.post(`${backend}/api/auth/worker/login`, { data: { phone, code } });
  expect(login.ok()).toBeTruthy();
  return login.json();
}

async function loginAdmin(request: APIRequestContext): Promise<Session> {
  const username = "admin_hz";
  expect((await request.post(`${backend}/api/auth/admin/code`, { data: { username } })).ok()).toBeTruthy();
  const debug = await request.get(`${backend}/api/auth/admin/debug-code?username=${username}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await request.post(`${backend}/api/auth/admin/login`, { data: { username, code } });
  expect(login.ok()).toBeTruthy();
  return login.json();
}

function collectFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => failures.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("response", (response) => { if (response.status() >= 500) failures.push(`5xx: ${response.status()} ${response.url()}`); });
  return () => expect(failures, "browser console/page/request/5xx failures").toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth })))
    .toMatchObject({ viewport: page.viewportSize()!.width });
  const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function mutateThroughUi(page: Page, title: string, english: boolean) {
  const card = () => page.locator(".notification-card").filter({ hasText: title });
  await expect(card()).toHaveCount(1);
  const readResponse = page.waitForResponse((response) => response.url().includes("/notifications/") && response.url().endsWith("/read") && response.request().method() === "POST");
  await card().locator("button").first().click();
  expect((await readResponse).ok()).toBeTruthy();
  await expect(card()).toHaveCount(1);
  const archiveResponse = page.waitForResponse((response) => response.url().includes("/notifications/") && response.url().endsWith("/archive") && response.request().method() === "POST");
  await card().getByRole("button", { name: english ? "Archive" : /./ }).first().click();
  expect((await archiveResponse).ok()).toBeTruthy();
  await expect(card()).toHaveCount(0);
  await page.locator(".notification-view-tabs button").nth(1).click();
  await expect(card()).toHaveCount(1);
  const restoreResponse = page.waitForResponse((response) => response.url().includes("/notifications/") && response.url().endsWith("/archive") && response.request().method() === "POST");
  await card().locator("button").first().click();
  expect((await restoreResponse).ok()).toBeTruthy();
  await expect(card()).toHaveCount(0);
  await page.locator(".notification-view-tabs button").first().click();
  await expect(card()).toHaveCount(1);
}

let workerPhoneBefore: { phone_hash: string | null; phone_masked: string | null; updated_at: Date } | null = null;
const workerPhone = "13877770027";

test.beforeAll(async () => {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { phone_hash: string | null; phone_masked: string | null; updated_at: Date })[]>(
    "SELECT phone_hash,phone_masked,updated_at FROM worker_profiles WHERE worker_id='worker-demo-hangzhou'",
  );
  workerPhoneBefore = rows[0] ?? null;
  if (!workerPhoneBefore) throw new Error("worker-demo-hangzhou fixture is missing");
  await getMysqlPool().query(
    "UPDATE worker_profiles SET phone_hash=?,phone_masked=? WHERE worker_id='worker-demo-hangzhou'",
    [hashPhoneIdentity(workerPhone), "138****0027"],
  );
});

test.afterAll(async () => {
  try {
    await cleanupNotificationFixtures();
  } finally {
    if (workerPhoneBefore) {
      await getMysqlPool().query(
        "UPDATE worker_profiles SET phone_hash=?,phone_masked=?,updated_at=? WHERE worker_id='worker-demo-hangzhou'",
        [workerPhoneBefore.phone_hash, workerPhoneBefore.phone_masked, workerPhoneBefore.updated_at],
      );
    }
  }
});

test("Customer real order reaches the scoped inbox and read/archive/restore persist", async ({ page }) => {
  const assertClean = collectFailures(page);
  const phone = `138${String(Date.now()).slice(-8)}`;
  const session = await loginCustomer(page.request, phone);
  const channel = await createNotificationChannel("customer_order");
  const order = await page.request.post(`${backend}/api/orders`, {
    headers: authenticatedHeaders(session),
    data: {
      skuId: "sku_home_daily_2h",
      quantity: 1,
      addressProvince: "Zhejiang",
      addressCity: "Hangzhou",
      addressDistrict: "Xihu",
      detailAddress: `Phase27E browser ${runKey}`,
      contactName: "Phase27E Customer",
      contactPhone: phone,
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledTimeSlot: "morning",
    },
  });
  expect(order.ok(), await order.text()).toBeTruthy();
  const orderId = ((await order.json()).order as { orderId: string }).orderId;
  await projectProspectiveEvent(channel, orderId);

  const other = await loginCustomer(page.request, `139${String(Date.now() + 1).slice(-8)}`);
  const wrongOwner = await page.request.get(`${backend}/api/customer/notifications`, { headers: authenticatedHeaders(other) });
  expect(wrongOwner.ok()).toBeTruthy();
  expect((await wrongOwner.json()).items).toEqual([]);
  expect((await page.request.get(`${backend}/api/customer/notifications`, { headers: authenticatedHeaders(session, "shanghai") })).ok()).toBeTruthy();
  expect((await page.request.get(`${backend}/api/worker/notifications`, { headers: authenticatedHeaders(session) })).status()).toBe(403);

  await page.addInitScript((value) => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  }, session);
  await page.setViewportSize({ width: 390, height: 844 });
  const catalogLoaded = page.waitForResponse((response) => response.url().endsWith("/api/catalog") && response.request().method() === "GET");
  await page.goto(`${customerApp}/customer/profile?cityCode=hangzhou`);
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  expect((await catalogLoaded).ok()).toBeTruthy();
  await page.getByRole("link", { name: "消息", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/notifications/);
  await mutateThroughUi(page, channel.title, false);
  await assertNoHorizontalOverflow(page);
  await page.reload();
  await expect(page.locator(".notification-card").filter({ hasText: channel.title })).toHaveCount(1);
  const unread = await page.request.get(`${backend}/api/customer/notifications/unread-count`, { headers: authenticatedHeaders(session) });
  expect(await unread.json()).toEqual({ ok: true, unreadCount: 0 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertNoHorizontalOverflow(page);
  assertClean();
});

test("Worker real support resolution reaches the inbox without losing the UI session", async ({ page }) => {
  const assertClean = collectFailures(page);
  const worker = await loginWorker(page.request, workerPhone);
  const admin = await loginAdmin(page.request);
  const channel = await createNotificationChannel("worker_support");
  const created = await page.request.post(`${backend}/api/support/tickets`, {
    headers: authenticatedHeaders(worker),
    data: {
      type: "withdrawal_issue",
      priority: "normal",
      subject: `Phase27E worker support ${runKey}`,
      description: "Real worker support flow for notification browser acceptance",
      idempotencyKey: `p27e-worker-support-${runKey}`,
    },
  });
  expect(created.ok(), `support create returned ${created.status()} ${created.statusText()}`).toBeTruthy();
  let ticket = (await created.json()).ticket as { ticketId: string; version: number };
  const escalated = await page.request.post(`${backend}/api/internal/support/tickets/${ticket.ticketId}/escalate`, {
    headers: authenticatedHeaders(admin),
    data: { reason: "Phase27E real support escalation", expectedVersion: ticket.version, idempotencyKey: `p27e-escalate-${runKey}` },
  });
  expect(escalated.ok(), `support escalate returned ${escalated.status()} ${escalated.statusText()}`).toBeTruthy();
  ticket = (await escalated.json()).ticket;
  const resolved = await page.request.post(`${backend}/api/internal/support/tickets/${ticket.ticketId}/resolve`, {
    headers: authenticatedHeaders(admin),
    data: {
      resolutionCode: "answered",
      resolutionNote: "Resolved by the real support API",
      expectedVersion: ticket.version,
      idempotencyKey: `p27e-resolve-${runKey}`,
    },
  });
  expect(resolved.ok(), await resolved.text()).toBeTruthy();
  await projectProspectiveEvent(channel, ticket.ticketId);

  const crossCity = await page.request.get(`${backend}/api/worker/notifications`, {
    headers: authenticatedHeaders(worker, "shanghai"),
  });
  expect(crossCity.ok()).toBeTruthy();
  expect((await crossCity.json()).items).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${workerApp}/worker/profile?cityCode=hangzhou`);
  await page.getByLabel("phone").fill(workerPhone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByRole("button", { name: "Fill debug code" }).click();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Worker Session")).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page).toHaveURL(/\/worker\/notifications/);
  await expect(page.getByText(`Authenticated as ${worker.userId}.`)).toBeVisible();
  await mutateThroughUi(page, channel.title, true);
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  const list = await page.request.get(`${backend}/api/worker/notifications`, { headers: authenticatedHeaders(worker) });
  expect(list.ok()).toBeTruthy();
  const workerItem = (await list.json()).items.find((item: { title: string }) => item.title === channel.title);
  expect(workerItem).toMatchObject({ readAt: expect.any(String), archivedAt: null });
  assertClean();
});
