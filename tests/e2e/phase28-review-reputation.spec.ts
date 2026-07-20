import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { hashPhoneIdentity } from "../../backend/src/auth/phoneIdentity.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  cleanupPhase28ReputationProjection,
  phase28GenerationId,
  projectPhase28ReviewLifecycle,
  setupPhase28ReputationProjection,
} from "./helpers/phase28ReputationFixture.js";

const backend = "http://127.0.0.1:3180";
const customerApp = "http://127.0.0.1:5383";
const workerApp = "http://127.0.0.1:5384";
const adminApp = "http://127.0.0.1:5385";
const runKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const workerPhone = "13628000028";
const adminId = `p28e-admin-${runKey}`;
const adminUsername = `p28e_admin_${runKey}`;
const operatorId = `p28e-operator-${runKey}`;
const operatorUsername = `p28e_operator_${runKey}`;
const reviewComment = `真实评价 ${runKey}：师傅按约完成服务，现场处理规范。`;

type Session = { token: string; userId: string; role: string };
let workerPhoneBefore: {
  phone_hash: string | null;
  phone_masked: string | null;
  updated_at: Date;
} | null = null;

function headers(session: Session, cityCode = "hangzhou") {
  return { Authorization: `Bearer ${session.token}`, "x-xlb-city-code": cityCode };
}

async function loginCustomer(request: APIRequestContext, phone: string): Promise<Session> {
  expect((await request.post(`${backend}/api/auth/customer/code`, { data: { phone } })).ok()).toBeTruthy();
  const debug = await request.get(`${backend}/api/auth/customer/debug-code?phone=${encodeURIComponent(phone)}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const response = await request.post(`${backend}/api/auth/customer/login`, { data: { phone, code } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function loginWorker(request: APIRequestContext): Promise<Session> {
  expect((await request.post(`${backend}/api/auth/worker/code`, { data: { phone: workerPhone } })).ok()).toBeTruthy();
  const debug = await request.get(`${backend}/api/auth/worker/debug-code?phone=${workerPhone}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const response = await request.post(`${backend}/api/auth/worker/login`, { data: { phone: workerPhone, code } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function loginAdmin(request: APIRequestContext, username = adminUsername): Promise<Session> {
  expect((await request.post(`${backend}/api/auth/admin/code`, { data: { username } })).ok()).toBeTruthy();
  const debug = await request.get(`${backend}/api/auth/admin/debug-code?username=${encodeURIComponent(username)}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const response = await request.post(`${backend}/api/auth/admin/login`, { data: { username, code } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function collectFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => failures.push(
    `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
  ));
  page.on("response", (response) => { if (response.status() >= 500) failures.push(`5xx: ${response.status()} ${response.url()}`); });
  return () => expect(failures, "browser console/page/request/5xx failures").toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function createReviewableOrder(
  request: APIRequestContext,
  customer: Session,
  worker: Session,
  operator: Session,
): Promise<string> {
  const phone = `137${String(Date.now()).slice(-8)}`;
  const orderResponse = await request.post(`${backend}/api/orders`, {
    headers: headers(customer),
    data: {
      skuId: "sku_home_daily_2h",
      quantity: 1,
      addressProvince: "Zhejiang",
      addressCity: "Hangzhou",
      addressDistrict: "Xihu",
      detailAddress: `Phase28 browser acceptance ${runKey}`,
      contactName: "Phase28 Customer",
      contactPhone: phone,
      scheduledAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledTimeSlot: "morning",
    },
  });
  expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
  const orderId = (await orderResponse.json()).order.orderId as string;
  let dispatchTaskId = "";
  for (let attempt = 0; attempt < 40 && !dispatchTaskId; attempt += 1) {
    const run = await request.post(`${backend}/api/internal/dispatch/run-once`, {
      headers: headers(operator), data: {},
    });
    expect(run.ok(), await run.text()).toBeTruthy();
    const [rows] = await getMysqlPool().query<(RowDataPacket & { dispatch_task_id: string })[]>(
      "SELECT dispatch_task_id FROM dispatch_tasks WHERE city_code='hangzhou' AND order_id=? AND status='queued' LIMIT 1",
      [orderId],
    );
    dispatchTaskId = rows[0]?.dispatch_task_id ?? "";
  }
  expect(dispatchTaskId).not.toBe("");
  const accepted = await request.post(`${backend}/api/worker/tasks/${dispatchTaskId}/accept`, {
    headers: headers(worker), data: {},
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
  const fulfillmentId = (await accepted.json()).fulfillment.fulfillmentId as string;
  expect((await request.post(`${backend}/api/worker/fulfillments/${fulfillmentId}/start`, {
    headers: headers(worker), data: {},
  })).ok()).toBeTruthy();
  const completed = await request.post(`${backend}/api/worker/fulfillments/${fulfillmentId}/complete`, {
    headers: headers(worker), data: { completionNote: "Phase28 browser acceptance completed" },
  });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  const confirmed = await request.post(`${backend}/api/orders/${orderId}/confirm-service`, {
    headers: headers(customer), data: {},
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  const payment = await request.post(`${backend}/api/payments/orders`, {
    headers: headers(customer), data: { orderId },
  });
  expect(payment.ok(), await payment.text()).toBeTruthy();
  const paymentOrderId = (await payment.json()).paymentOrder.paymentOrderId as string;
  const paid = await request.post(`${backend}/api/payments/mock-webhook`, {
    headers: headers(customer),
    data: { paymentOrderId, providerTradeNo: `p28e-${runKey}`, status: "paid" },
  });
  expect(paid.ok(), await paid.text()).toBeTruthy();
  return orderId;
}

test.beforeAll(async () => {
  const pool = getMysqlPool();
  const [rows] = await pool.query<(RowDataPacket & {
    phone_hash: string | null; phone_masked: string | null; updated_at: Date;
  })[]>("SELECT phone_hash,phone_masked,updated_at FROM worker_profiles WHERE worker_id='worker-demo-hangzhou'");
  workerPhoneBefore = rows[0] ?? null;
  if (!workerPhoneBefore) throw new Error("worker-demo-hangzhou fixture is missing");
  await pool.query(
    "UPDATE worker_profiles SET phone_hash=?,phone_masked=? WHERE worker_id='worker-demo-hangzhou'",
    [hashPhoneIdentity(workerPhone), "136****0028"],
  );
  await pool.query(
    "UPDATE worker_qualifications SET is_eligible=1 WHERE city_code='hangzhou' AND worker_id='worker-demo-hangzhou' AND sku_id='sku_home_daily_2h'",
  );
  await pool.query(
    "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,'admin',JSON_ARRAY('hangzhou'))",
    [adminId, adminUsername],
  );
  await pool.query("INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'hangzhou')", [adminId]);
  await pool.query(
    "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,'operator',JSON_ARRAY('hangzhou'))",
    [operatorId, operatorUsername],
  );
  await pool.query("INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'hangzhou')", [operatorId]);
  await setupPhase28ReputationProjection();
});

test.afterAll(async () => {
  const pool = getMysqlPool();
  try {
    await cleanupPhase28ReputationProjection();
  } finally {
    await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id IN (?,?)", [adminId, operatorId]);
    await pool.query("DELETE FROM admin_users WHERE id IN (?,?)", [adminId, operatorId]);
    if (workerPhoneBefore) {
      await pool.query(
        "UPDATE worker_profiles SET phone_hash=?,phone_masked=?,updated_at=? WHERE worker_id='worker-demo-hangzhou'",
        [workerPhoneBefore.phone_hash, workerPhoneBefore.phone_masked, workerPhoneBefore.updated_at],
      );
    }
  }
});

test("Customer pending review, Admin audited moderation, and Worker aggregate use real APIs", async ({ page }) => {
  const assertClean = collectFailures(page);
  const customerPhone = `137${String(Date.now()).slice(-8)}`;
  const customer = await loginCustomer(page.request, customerPhone);
  const worker = await loginWorker(page.request);
  const admin = await loginAdmin(page.request);
  const operator = await loginAdmin(page.request, operatorUsername);
  expect(admin.role).toBe("admin");
  expect(operator.role).toBe("operator");
  const orderId = await createReviewableOrder(page.request, customer, worker, operator);

  await page.addInitScript(({ session, ownedOrderId }) => {
    localStorage.setItem("xlb.customer.token", session.token);
    localStorage.setItem("xlb.customer.userId", session.userId);
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
    localStorage.setItem("xlb.customer.orderIds", JSON.stringify([ownedOrderId]));
  }, { session: customer, ownedOrderId: orderId });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${customerApp}/customer/orders?cityCode=hangzhou`);
  await expect(page.getByPlaceholder("请填写真实服务体验")).toBeVisible();
  await page.getByPlaceholder("请填写真实服务体验").fill(reviewComment);
  const reviewResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/orders/${orderId}/reviews`) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "提交评价" }).click();
  const reviewResponse = await reviewResponsePromise;
  expect(reviewResponse.ok(), await reviewResponse.text()).toBeTruthy();
  const reviewId = (await reviewResponse.json()).review.reviewId as string;
  await expect(page.getByText("审核中", { exact: true })).toBeVisible();
  await expect(page.getByText(reviewComment, { exact: true }).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.addInitScript(({ session, username }) => {
    localStorage.setItem("xlb.admin.token", session.token);
    localStorage.setItem("xlb.admin.userId", session.userId);
    localStorage.setItem("xlb.admin.role", session.role);
    localStorage.setItem("xlb.admin.username", username);
  }, { session: admin, username: adminUsername });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${adminApp}/#/review-moderation?cityCode=hangzhou`);
  await expect(page.getByText(reviewId, { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: reviewId });
  expect(await row.textContent()).not.toContain(reviewComment);
  const contentResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/admin/reviews/${reviewId}/content`),
  );
  await row.getByRole("button", { name: "查看正文" }).click();
  expect((await contentResponsePromise).ok()).toBeTruthy();
  await expect(row.getByText(reviewComment, { exact: true })).toBeVisible();
  await row.locator("input").fill("Phase28 browser moderator approved authentic content");
  const moderationResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/admin/reviews/${reviewId}/moderation`) && response.request().method() === "POST",
  );
  await row.getByRole("button", { name: "设为可见" }).click();
  expect((await moderationResponsePromise).ok()).toBeTruthy();
  await expect(page.getByText(reviewId, { exact: true })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);

  await projectPhase28ReviewLifecycle();
  const aggregate = await page.request.get(`${backend}/api/worker/reputation`, { headers: headers(worker) });
  expect(aggregate.ok(), await aggregate.text()).toBeTruthy();
  expect(await aggregate.json()).toMatchObject({ reputation: {
    sourceGenerationId: phase28GenerationId(), ratingCount: 1, ratingSum: 5, averageRating: 5,
  } });
  const appealTargets = await page.request.get(`${backend}/api/worker/review-appeal-targets`, {
    headers: headers(worker),
  });
  expect(appealTargets.ok(), await appealTargets.text()).toBeTruthy();
  expect((await appealTargets.json()).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ reviewId, visibility: "visible", moderationVersion: 1 }),
  ]));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workerApp}/worker/reputation?cityCode=hangzhou`);
  await page.getByLabel("手机号").fill(workerPhone);
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/验证码已发送/u)).toBeVisible();
  const debugCodeResponse = await page.request.get(`${backend}/api/auth/worker/debug-code?phone=${workerPhone}`);
  expect(debugCodeResponse.ok(), await debugCodeResponse.text()).toBeTruthy();
  const debugCode = (await debugCodeResponse.json()).code as string;
  await page.getByLabel("短信验证码").fill(debugCode);
  await page.getByRole("button", { name: "登录并进入任务大厅" }).click();
  await expect(page.getByText("我的口碑", { exact: true })).toBeVisible();
  await expect(page.getByText("5.00", { exact: true })).toBeVisible();
  await expect(page.getByText("1 条可见评价", { exact: true })).toBeVisible();
  await expect(page.getByText("评价审核申诉", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "提交申诉" }).first()).toBeVisible();
  await expect(page.getByText(reviewComment, { exact: true })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertNoHorizontalOverflow(page);
  assertClean();
});
