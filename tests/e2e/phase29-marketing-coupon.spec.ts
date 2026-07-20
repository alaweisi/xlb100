import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  cleanupPhase29MarketingFixture,
  findPhase29BrowserSku,
  phase29Fixture,
  setupPhase29MarketingFixture,
} from "./helpers/phase29MarketingFixture.js";

const backend = "http://127.0.0.1:3190";
const customerApp = "http://127.0.0.1:5393";
const workerApp = "http://127.0.0.1:5394";
const adminApp = "http://127.0.0.1:5395";

type Session = { token: string; userId: string; role: string };

function headers(session: Session) {
  return { Authorization: `Bearer ${session.token}`, "x-xlb-city-code": phase29Fixture.cityCode };
}

type JsonHttpResponse = {
  text(): Promise<string>;
  ok(): boolean;
  url(): string;
  status(): number;
};

async function bodyOf(response: JsonHttpResponse): Promise<Record<string, any>> {
  const text = await response.text();
  expect(response.ok(), `${response.url()} returned ${response.status()}: ${text}`).toBeTruthy();
  return JSON.parse(text) as Record<string, any>;
}

async function loginAdmin(request: APIRequestContext, username: string): Promise<Session> {
  await bodyOf(await request.post(`${backend}/api/auth/admin/code`, { data: { username } }));
  const debug = await bodyOf(await request.get(`${backend}/api/auth/admin/debug-code?username=${encodeURIComponent(username)}`));
  return bodyOf(await request.post(`${backend}/api/auth/admin/login`, { data: { username, code: debug.code } })) as unknown as Session;
}

async function loginCustomer(request: APIRequestContext): Promise<Session> {
  const phone = phase29Fixture.customerPhone;
  await bodyOf(await request.post(`${backend}/api/auth/customer/code`, { data: { phone } }));
  const debug = await bodyOf(await request.get(`${backend}/api/auth/customer/debug-code?phone=${encodeURIComponent(phone)}`));
  const session = await bodyOf(await request.post(`${backend}/api/auth/customer/login`, { data: { phone, code: debug.code } })) as unknown as Session;
  phase29Fixture.customerId = session.userId;
  return session;
}

function collectBrowserFailures(page: Page) {
  const failures: string[] = [];
  const completedGetUrls = new Set<string>();
  const cancelledNavigationReads = new Map<string, string[]>();
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    const isExpectedReadCancelledOnNavigation = request.method() === "GET"
      && (
        request.url() === `${customerApp}/api/catalog`
        || request.url() === `${customerApp}/api/customer/marketing/coupon-grants?status=available`
      )
      && errorText === "net::ERR_ABORTED";
    const failure = `requestfailed: ${request.method()} ${request.url()} ${errorText}`;
    if (isExpectedReadCancelledOnNavigation) {
      cancelledNavigationReads.set(request.url(), [...(cancelledNavigationReads.get(request.url()) ?? []), failure]);
    } else {
      failures.push(failure);
    }
  });
  page.on("response", (response) => {
    if (response.request().method() === "GET" && response.ok()) completedGetUrls.add(response.url());
    if (response.status() >= 500) failures.push(`5xx: ${response.status()} ${response.url()}`);
  });
  return () => {
    for (const [url, cancelledReads] of cancelledNavigationReads) {
      if (!completedGetUrls.has(url)) failures.push(...cancelledReads);
    }
    expect(failures, "browser console/page/request/5xx failures").toEqual([]);
  };
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport + 1);
}

test.beforeAll(async () => {
  await setupPhase29MarketingFixture();
});

test.afterAll(async () => {
  await cleanupPhase29MarketingFixture();
});

test("real Marketing governance, Customer coupon Order, Admin trace and Worker no-change smoke", async ({ page, browser }) => {
  const assertClean = collectBrowserFailures(page);
  const [creator, reviewer, publisher, traceOperator, customer] = await Promise.all([
    loginAdmin(page.request, phase29Fixture.creator.username),
    loginAdmin(page.request, phase29Fixture.reviewer.username),
    loginAdmin(page.request, phase29Fixture.publisher.username),
    loginAdmin(page.request, phase29Fixture.traceOperator.username),
    loginCustomer(page.request),
  ]);
  expect([creator.userId, reviewer.userId, publisher.userId]).toEqual([
    phase29Fixture.creator.id,
    phase29Fixture.reviewer.id,
    phase29Fixture.publisher.id,
  ]);
  expect(new Set([creator.userId, reviewer.userId, publisher.userId]).size).toBe(3);
  expect(traceOperator).toMatchObject({ userId: phase29Fixture.traceOperator.id, role: "operator" });

  const { skuId, grossAmountMinor } = await findPhase29BrowserSku();
  const faceValueMinor = Math.min(1_000, grossAmountMinor - 1);
  const now = Date.now();
  const startAt = new Date(now - 60 * 60 * 1000).toISOString();
  const endAt = new Date(now + 48 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const campaignName = `Phase29 browser ${phase29Fixture.nonce}`;

  const campaignCreated = await bodyOf(await page.request.post(`${backend}/api/admin/marketing/campaigns`, {
    headers: headers(creator),
    data: { name: campaignName, startAt, endAt, idempotencyKey: `campaign-${phase29Fixture.nonce}` },
  }));
  phase29Fixture.campaignId = campaignCreated.campaign.marketingCampaignId;
  expect(campaignCreated.campaign).toMatchObject({ status: "draft", version: 1 });

  const campaignReviewed = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/campaigns/${phase29Fixture.campaignId}/review`,
    { headers: headers(reviewer), data: { expectedVersion: 1, reason: "independent browser campaign review" } },
  ));
  expect(campaignReviewed.campaign).toMatchObject({ status: "reviewed", reviewedBy: reviewer.userId, version: 2 });

  const ruleCreated = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/campaigns/${phase29Fixture.campaignId}/rule-revisions`,
    { headers: headers(creator), data: { allowedSkuIds: [skuId], idempotencyKey: `rule-${phase29Fixture.nonce}` } },
  ));
  phase29Fixture.ruleRevisionId = ruleCreated.ruleRevision.ruleRevisionId;
  expect(ruleCreated.ruleRevision).toMatchObject({ status: "draft", createdBy: creator.userId, version: 1 });

  const ruleReviewed = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/rule-revisions/${phase29Fixture.ruleRevisionId}/review`,
    { headers: headers(reviewer), data: { expectedVersion: 1, reason: "independent browser rule review" } },
  ));
  expect(ruleReviewed.ruleRevision).toMatchObject({ status: "reviewed", reviewedBy: reviewer.userId, version: 2 });

  const rulePublished = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/rule-revisions/${phase29Fixture.ruleRevisionId}/publish`,
    { headers: headers(publisher), data: { expectedVersion: 2, reason: "third actor browser publication" } },
  ));
  expect(rulePublished.ruleRevision).toMatchObject({ status: "published", publishedBy: publisher.userId, version: 3 });

  const campaignScheduled = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/campaigns/${phase29Fixture.campaignId}/schedule`,
    {
      headers: headers(publisher),
      data: { ruleRevisionId: phase29Fixture.ruleRevisionId, expectedVersion: 2, reason: "browser acceptance schedule" },
    },
  ));
  expect(campaignScheduled.campaign).toMatchObject({ status: "scheduled", version: 3 });
  const campaignActive = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/campaigns/${phase29Fixture.campaignId}/status`,
    { headers: headers(publisher), data: { status: "active", expectedVersion: 3, reason: "browser acceptance activation" } },
  ));
  expect(campaignActive.campaign).toMatchObject({ status: "active", version: 4 });

  const definitionCreated = await bodyOf(await page.request.post(`${backend}/api/admin/marketing/coupon-definitions`, {
    headers: headers(creator),
    data: {
      marketingCampaignId: phase29Fixture.campaignId,
      ruleRevisionId: phase29Fixture.ruleRevisionId,
      name: `Browser fixed coupon ${phase29Fixture.nonce}`,
      allowedSkuIds: [skuId],
      currency: "CNY",
      faceValueMinor,
      minSpendMinor: faceValueMinor + 1,
      issuanceCap: 1,
      compensationCap: 1,
      validFrom: startAt,
      validUntil: endAt,
      idempotencyKey: `definition-${phase29Fixture.nonce}`,
    },
  }));
  phase29Fixture.definitionId = definitionCreated.couponDefinition.couponDefinitionId;
  expect(definitionCreated.couponDefinition).toMatchObject({ status: "draft", issuedCount: 0, version: 1 });
  const definitionActive = await bodyOf(await page.request.post(
    `${backend}/api/admin/marketing/coupon-definitions/${phase29Fixture.definitionId}/status`,
    { headers: headers(publisher), data: { status: "active", expectedVersion: 1, reason: "browser acceptance definition" } },
  ));
  expect(definitionActive.couponDefinition).toMatchObject({ status: "active", version: 2 });

  const grantCreated = await bodyOf(await page.request.post(`${backend}/api/admin/marketing/coupon-grants`, {
    headers: headers(publisher),
    data: {
      couponDefinitionId: phase29Fixture.definitionId,
      customerId: customer.userId,
      issuanceReason: "admin_manual",
      issuanceRef: `browser-approval-${phase29Fixture.nonce}`,
      expiresAt,
      reason: "approved browser acceptance grant",
      idempotencyKey: `grant-${phase29Fixture.nonce}`,
    },
  }));
  phase29Fixture.grantId = grantCreated.couponGrant.couponGrantId;
  expect(grantCreated.couponGrant).toMatchObject({ status: "available", customerId: customer.userId, version: 1 });

  await page.addInitScript((session) => {
    localStorage.setItem("xlb.customer.token", session.token);
    localStorage.setItem("xlb.customer.userId", session.userId);
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  }, customer);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${customerApp}/customer/coupons?cityCode=hangzhou`);
  await expect(page.getByRole("heading", { name: "我的优惠券" })).toBeVisible();
  const couponCard = page.locator(".customer-coupons__card").filter({ hasText: phase29Fixture.grantId });
  await expect(couponCard).toContainText("可使用");
  await couponCard.getByRole("button", { name: "用于下单报价" }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/order/create\\?couponGrantId=${phase29Fixture.grantId}`));

  const serviceSelect = page.locator(`select:has(option[value="${skuId}"])`);
  await serviceSelect.selectOption(skuId);
  await page.getByLabel("详细地址").fill(`Phase29 browser address ${phase29Fixture.nonce}`);
  await page.getByLabel("联系人").fill("Phase29 Browser Customer");
  await page.getByLabel("联系电话").fill(phase29Fixture.customerPhone);

  const couponSelect = page.locator(`select:has(option[value="${phase29Fixture.grantId}"])`);
  await expect(couponSelect).toHaveValue(phase29Fixture.grantId);
  const decisionResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/customer/marketing/discount-decisions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "使用所选优惠券" }).click();
  const decisionResponse = await decisionResponsePromise;
  const decisionBody = await bodyOf(decisionResponse);
  phase29Fixture.decisionId = decisionBody.discountDecision.discountDecisionId;
  expect(decisionBody.discountDecision).toMatchObject({
    couponGrantId: phase29Fixture.grantId,
    skuId,
    quantity: 1,
    grossAmountMinor,
    discountAmountMinor: faceValueMinor,
    netAmountMinor: grossAmountMinor - faceValueMinor,
    status: "issued",
  });
  await expect(page.getByText("服务端校验通过", { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`应付.*${((grossAmountMinor - faceValueMinor) / 100).toFixed(2).replace(".", "\\.")}`))).toBeVisible();
  const orderResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/orders") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "提交订单" }).click();
  const orderResponse = await orderResponsePromise;
  const orderBody = await bodyOf(orderResponse);
  phase29Fixture.orderId = orderBody.order.orderId;
  phase29Fixture.reservationId = orderBody.order.quoteSnapshot.marketingDecision.reservationId;
  phase29Fixture.redemptionId = orderBody.order.quoteSnapshot.marketingDecision.redemptionId;
  expect(orderBody.order).toMatchObject({
    customerId: customer.userId,
    totalAmount: (grossAmountMinor - faceValueMinor) / 100,
    quoteSnapshot: {
      pricingSource: "marketing",
      grossAmountMinor,
      discountAmountMinor: faceValueMinor,
      netAmountMinor: grossAmountMinor - faceValueMinor,
      marketingDecision: {
        decisionId: phase29Fixture.decisionId,
        ruleRevisionId: phase29Fixture.ruleRevisionId,
        grantId: phase29Fixture.grantId,
        reservationId: phase29Fixture.reservationId,
        redemptionId: phase29Fixture.redemptionId,
      },
    },
  });
  await expect(page.getByText(`订单号：${phase29Fixture.orderId}`, { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  // Let the Customer screen finish its read-only catalog refresh before this
  // page is reused for Admin/Worker navigation. Otherwise Chromium can report
  // the navigation-cancelled fetch as ERR_ABORTED even though the Order flow
  // and API response have already completed successfully.
  await page.waitForLoadState("networkidle");

  const [facts] = await getMysqlPool().query<(RowDataPacket & {
    grant_status: string; decision_status: string; reservation_status: string; redemption_count: number | string;
  })[]>(
    `SELECT g.status grant_status,d.status decision_status,r.status reservation_status,
            COUNT(cr.coupon_redemption_id) redemption_count
       FROM coupon_grants g
       INNER JOIN marketing_discount_decisions d ON d.city_code=g.city_code AND d.coupon_grant_id=g.coupon_grant_id
       INNER JOIN coupon_reservations r ON r.city_code=d.city_code AND r.discount_decision_id=d.discount_decision_id
       INNER JOIN coupon_redemptions cr ON cr.city_code=r.city_code AND cr.coupon_reservation_id=r.coupon_reservation_id
      WHERE g.city_code='hangzhou' AND g.coupon_grant_id=?
      GROUP BY g.status,d.status,r.status`,
    [phase29Fixture.grantId],
  );
  expect(facts[0]).toMatchObject({
    grant_status: "redeemed",
    decision_status: "accepted",
    reservation_status: "redeemed",
  });
  expect(Number(facts[0]?.redemption_count)).toBe(1);

  await page.addInitScript(({ session, username }) => {
    localStorage.setItem("xlb.admin.token", session.token);
    localStorage.setItem("xlb.admin.userId", session.userId);
    localStorage.setItem("xlb.admin.role", session.role);
    localStorage.setItem("xlb.admin.username", username);
  }, { session: publisher, username: phase29Fixture.publisher.username });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${adminApp}/#/marketing?cityCode=hangzhou`);
  await expect(page.getByRole("heading", { name: "营销活动与优惠券" })).toBeVisible();
  await expect(page.getByText(campaignName, { exact: true })).toBeVisible();
  await expect(page.getByText(phase29Fixture.campaignId, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "规则修订" }).click();
  await page.getByLabel("活动标识", { exact: true }).fill(phase29Fixture.campaignId);
  await page.getByRole("button", { name: "读取规则" }).click();
  await expect(page.getByText(phase29Fixture.ruleRevisionId, { exact: true })).toBeVisible();
  await expect(page.getByText(/已发布 · 修订 1/)).toBeVisible();
  await page.getByRole("tab", { name: "券定义" }).click();
  await expect(page.getByText(`Browser fixed coupon ${phase29Fixture.nonce}`, { exact: true })).toBeVisible();
  await expect(page.getByText(/生效中 · 常规 1\/1/)).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const traceContext = await browser.newContext();
  await traceContext.addInitScript(({ session, username }) => {
    localStorage.setItem("xlb.admin.token", session.token);
    localStorage.setItem("xlb.admin.userId", session.userId);
    localStorage.setItem("xlb.admin.role", session.role);
    localStorage.setItem("xlb.admin.username", username);
  }, { session: traceOperator, username: phase29Fixture.traceOperator.username });
  const tracePage = await traceContext.newPage();
  const assertTraceClean = collectBrowserFailures(tracePage);
  await tracePage.setViewportSize({ width: 1440, height: 900 });
  await tracePage.goto(`${adminApp}/#/order-trace?cityCode=hangzhou&orderId=${encodeURIComponent(phase29Fixture.orderId)}`);
  await expect(tracePage.getByText("订单全链路追踪", { exact: true })).toBeVisible();
  const marketingRow = tracePage.locator(".admin-mobile-item").filter({ hasText: "定价与营销" });
  await expect(marketingRow).toContainText(phase29Fixture.decisionId);
  await expect(marketingRow).toContainText(phase29Fixture.grantId);
  await expect(marketingRow).toContainText(phase29Fixture.ruleRevisionId);
  await expect(marketingRow).toContainText(phase29Fixture.reservationId);
  await expect(marketingRow).toContainText(phase29Fixture.redemptionId);
  const grossText = (grossAmountMinor / 100).toFixed(2).replace(".", "\\.");
  const discountText = (faceValueMinor / 100).toFixed(2).replace(".", "\\.");
  const netText = ((grossAmountMinor - faceValueMinor) / 100).toFixed(2).replace(".", "\\.");
  await expect(marketingRow).toContainText(new RegExp(`${grossText}.*${discountText}.*${netText}`));
  await assertNoHorizontalOverflow(tracePage);
  assertTraceClean();
  await traceContext.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workerApp}/worker/profile?cityCode=hangzhou`);
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/验证码已发送/u)).toBeVisible();
  const workerDebugResponse = await page.request.get(`${backend}/api/auth/worker/debug-code?phone=13800000001`);
  const workerDebug = await bodyOf(workerDebugResponse);
  await page.getByLabel("短信验证码").fill(workerDebug.code);
  const workerLoginButton = page.getByRole("button", { name: "登录并进入任务大厅" });
  await expect(workerLoginButton).toBeEnabled();
  await workerLoginButton.click();
  await expect(page.getByRole("heading", { name: "位置共享与接单半径" })).toBeVisible();
  await expect(page.getByText("当前师傅身份", { exact: true })).toBeVisible();
  await expect(page.getByText("营销活动与优惠券", { exact: true })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  assertClean();
});
