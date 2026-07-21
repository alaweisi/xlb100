import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer/p6-b6-orders-aftersale";
const authorityPath = "docs/design/ui/references/customer-home-visual-truth.png";
const now = "2026-07-22T08:00:00.000Z";

const viewports = [
  { width: 320, height: 844, label: "320x844" },
  { width: 390, height: 844, label: "390x844" },
  { width: 430, height: 932, label: "430x932" },
] as const;

const baseOrder = {
  cityCode: "hangzhou",
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "文三路 100 号",
  contactName: "顾客验收",
  contactPhone: "13800000001",
  scheduledAt: "2099-07-25T01:00:00.000Z",
  scheduledTimeSlot: "morning",
  customerId: "customer-b6",
  skuId: "sku-cleaning-b6",
  skuName: "2小时日常保洁",
  quantity: 1,
  unit: "次",
  priceRuleId: "price-rule-b6",
  priceText: "¥128.00/次",
  priceType: "fixed",
  basePrice: 128,
  currency: "CNY",
  totalAmount: 128,
  quoteSnapshot: null,
  createdAt: now,
  updatedAt: now,
};

const paidOrder = { ...baseOrder, orderId: "order-paid-b6", status: "paid" };
const payableOrder = {
  ...baseOrder,
  orderId: "order-payable-b6",
  skuName: "挂式空调清洗",
  priceText: "¥168.00/台",
  totalAmount: 168,
  status: "service_completed",
  createdAt: "2026-07-21T08:00:00.000Z",
};

const reverseRequest = {
  reverseRequestId: "reverse-b6-01",
  cityCode: "hangzhou",
  orderId: "order-b6-aftersale",
  customerId: "customer-b6",
  reverseType: "reschedule",
  status: "requested",
  reason: "临时有事，需要调整上门时间",
  requestedScheduledAt: "2026-07-25T01:00:00.000Z",
  requestedTimeSlot: "morning",
  idempotencyKey: "reverse-key-b6",
  reviewNote: null,
  reviewedByAdminId: null,
  reviewedAt: null,
  appliedAt: null,
  createdAt: now,
  updatedAt: now,
};

const complaint = {
  complaintId: "complaint-b6-01",
  cityCode: "hangzhou",
  orderId: "order-b6-aftersale",
  customerId: "customer-b6",
  category: "service_quality",
  priority: "normal",
  description: "清洁结果与约定标准不一致",
  status: "in_progress",
  idempotencyKey: "complaint-key-b6",
  assignedAdminId: null,
  resolutionType: null,
  resolutionNote: null,
  submittedAt: now,
  resolvedAt: null,
  closedAt: null,
  updatedAt: now,
};

const fulfillmentAggregate = {
  fulfillmentId: "fulfillment-b6-01",
  orderId: "order-b6-aftersale",
  cityCode: "hangzhou",
  fulfillmentStatus: "completed",
  evidence: [{
    evidenceId: "evidence-b6-01",
    cityCode: "hangzhou",
    fulfillmentId: "fulfillment-b6-01",
    orderId: "order-b6-aftersale",
    complaintId: null,
    mediaAssetId: "media-b6-01",
    evidenceType: "completion",
    note: null,
    capturedAt: now,
    createdByWorkerId: "worker-b6",
    createdAt: now,
    mediaAsset: {
      mediaAssetId: "media-b6-01",
      cityCode: "hangzhou",
      orderId: "order-b6-aftersale",
      fulfillmentId: "fulfillment-b6-01",
      complaintId: null,
      uploadedByType: "worker",
      uploadedById: "worker-b6",
      originalFileName: "完工现场.webp",
      contentType: "image/webp",
      sizeBytes: 2048,
      checksumSha256: "a".repeat(64),
      signatureValidated: true,
      securityScanStatus: "not_malware_scanned_local",
      createdAt: now,
      storage: {
        provider: "local",
        providerName: "xlb-local-filesystem",
        providerStatus: "stored_local",
        externalProviderExecuted: false,
        objectKey: "b6/evidence.webp",
        storageUri: "local://b6/evidence.webp",
        publicUrl: null,
        checksumSha256: "a".repeat(64),
        sizeBytes: 2048,
        contentType: "image/webp",
        storedAt: now,
      },
    },
  }],
  confirmation: {
    confirmationId: "confirmation-b6-01",
    cityCode: "hangzhou",
    fulfillmentId: "fulfillment-b6-01",
    orderId: "order-b6-aftersale",
    customerId: "customer-b6",
    status: "pending",
    complaintId: null,
    customerNote: null,
    evidenceSnapshot: [],
    confirmedAt: null,
    disputedAt: null,
    createdAt: now,
    updatedAt: now,
  },
};

async function seedCustomerSession(page: Page, orderIds: string[]) {
  await page.addInitScript((ids) => {
    localStorage.setItem("xlb.customer.token", "customer-b6-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-b6");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
    localStorage.setItem("xlb.customer.orderIds", JSON.stringify(ids));
  }, orderIds);
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, catalog: { cityCode: "hangzhou", categories: [] } }),
  }));
}

async function saveScreenshot(page: Page, fileName: string) {
  const output = join(process.cwd(), evidenceRoot, fileName);
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: false, animations: "disabled" });
  return output;
}

async function captureResponsiveSet(page: Page, surface: "orders" | "aftersale", selector: string) {
  const paths: Record<string, string> = {};
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    const undersized = await page.locator(selector).evaluateAll((nodes) => nodes.flatMap((node) => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(node);
      const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      return visible && (rect.width < 44 || rect.height < 44)
        ? [{ tag: node.tagName, text: node.textContent?.trim(), width: Math.round(rect.width), height: Math.round(rect.height) }]
        : [];
    }));
    expect(undersized, `${surface} ${viewport.label} undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
    paths[viewport.label] = await saveScreenshot(page, `${surface}-ready-${viewport.label}.png`);
  }
  return paths;
}

async function assertAccessibilityFallbacks(page: Page, focusTarget: Locator) {
  await focusTarget.focus();
  await expect(focusTarget).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator(".customer-app-root")).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await focusTarget.evaluate((element) => (element as HTMLElement).blur());
}

async function createComparisonBoard(
  context: BrowserContext,
  actualPath: string,
  fileName: string,
  caption: string,
) {
  const source = readFileSync(join(process.cwd(), authorityPath)).toString("base64");
  const actual = readFileSync(actualPath).toString("base64");
  const output = join(process.cwd(), evidenceRoot, fileName);
  await mkdir(dirname(output), { recursive: true });
  const board = await context.newPage();
  await board.setViewportSize({ width: 900, height: 930 });
  await board.setContent(`
    <style>
      body{margin:0;background:#efe8df;color:#18342d;font-family:system-ui,sans-serif}
      header{height:54px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700}
      main{display:grid;grid-template-columns:390px 390px;gap:32px;justify-content:center}
      figure{margin:0;display:grid;gap:10px}figcaption{text-align:center;font-weight:700}
      img{width:390px;height:844px;object-fit:fill;background:#fff;box-shadow:0 12px 32px rgba(24,52,45,.16)}
    </style>
    <header>继承主页设计语言，不复制主页布局</header>
    <main>
      <figure><img src="data:image/png;base64,${source}"><figcaption>顾客端主页 · 唯一视觉真相</figcaption></figure>
      <figure><img src="data:image/png;base64,${actual}"><figcaption>${caption}</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test("B6 orders visual QA covers partial ready, payment entry and review composition", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  await seedCustomerSession(page, ["order-paid-b6", "order-payable-b6", "order-unavailable-b6"]);
  await page.route("**/api/orders/order-paid-b6", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, order: paidOrder }),
  }));
  await page.route("**/api/orders/order-payable-b6", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, order: payableOrder }),
  }));
  await page.route("**/api/orders/order-unavailable-b6", (route) => route.fulfill({
    status: 503,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: false, code: "SERVICE_UNAVAILABLE", message: "temporarily unavailable" }),
  }));
  await page.route("**/api/orders/*/review", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, review: null }),
  }));

  await page.goto("/customer/orders?cityCode=hangzhou");
  await expect(page.getByRole("heading", { level: 1, name: "我的订单" })).toBeVisible();
  await expect(page.getByText("部分订单暂未加载")).toBeVisible();
  await expect(page.getByText("2小时日常保洁", { exact: true })).toBeVisible();
  await expect(page.getByText("挂式空调清洗", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /评价本次服务/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /立即支付/ })).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/pending_dispatch|service_completed|mock pay|not-wired/i);

  const responsive = await captureResponsiveSet(
    page,
    "orders",
    ".customer-orders button, .customer-orders a, .customer-orders textarea",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const reviewButton = page.getByRole("button", { name: /评价本次服务/ });
  await assertAccessibilityFallbacks(page, reviewButton);
  await createComparisonBoard(
    context,
    responsive["390x844"],
    "orders-home-comparison-390x844.png",
    "B6 订单/支付 · 当前运行实现",
  );

  await reviewButton.click();
  const reviewHeading = page.getByRole("heading", { name: "评价本次服务" });
  await expect(reviewHeading).toBeVisible();
  await reviewHeading.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await saveScreenshot(page, "orders-review-390x844.png");
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !message.includes("503 (Service Unavailable)"),
  );
  expect(consoleErrors.length).toBeGreaterThan(0);
  expect(unexpectedConsoleErrors).toEqual([]);

  await writeFile(join(process.cwd(), evidenceRoot, "orders-automated.report.json"), `${JSON.stringify({
    version: "1.0.0",
    lane: "P6-B6",
    role: "customer",
    surface: "orders-payment-review",
    route: "/customer/orders",
    authority: authorityPath,
    dataSource: "contract-faithful-local-route-fixture",
    viewports,
    states: ["partial-ready", "payment-entry", "review-compose"],
    checks: {
      authoritativeStatusLabels: true,
      onePrimaryNextAction: true,
      partialRecoveryVisible: true,
      singleCustomerShell: true,
      noHorizontalOverflow: true,
      touchTargets: true,
      keyboardFocus: true,
      reducedMotion: true,
      forcedColors: true,
      noEngineeringCopy: true,
      expectedFixtureNetworkErrors: consoleErrors.length,
      noUnexpectedConsoleErrors: true,
    },
    result: "automated-checks-passed",
  }, null, 2)}\n`, "utf8");
});

test("B6 aftersale visual QA covers records, evidence and server-confirmed completion", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  let confirmationStatus = "pending";
  await seedCustomerSession(page, ["order-b6-aftersale"]);
  await page.route("**/api/orders/order-b6-aftersale/reverse-requests", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, reverseRequests: [reverseRequest] }),
  }));
  await page.route("**/api/aftersale/complaints?orderId=order-b6-aftersale", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, complaints: [complaint] }),
  }));
  await page.route("**/api/customer/orders/order-b6-aftersale/fulfillment-evidence", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({
      ok: true,
      aggregates: [{
        ...fulfillmentAggregate,
        confirmation: { ...fulfillmentAggregate.confirmation, status: confirmationStatus },
      }],
    }),
  }));
  await page.route("**/api/customer/fulfillments/fulfillment-b6-01/customer-confirmation", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ decision: "confirmed" });
    confirmationStatus = "confirmed";
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        ok: true,
        confirmation: { ...fulfillmentAggregate.confirmation, status: "confirmed", confirmedAt: now },
      }),
    });
  });

  await page.goto("/customer/aftersale?orderId=order-b6-aftersale&cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "售后服务" })).toBeVisible();
  await expect(page.getByText("待平台审核")).toBeVisible();
  await expect(page.getByText("处理中")).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);

  const responsive = await captureResponsiveSet(
    page,
    "aftersale",
    ".customer-aftersale button, .customer-aftersale input, .customer-aftersale select, .customer-aftersale textarea, .customer-aftersale a",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const refreshButton = page.getByRole("button", { name: "刷新售后进展" });
  await assertAccessibilityFallbacks(page, refreshButton);
  await createComparisonBoard(
    context,
    responsive["390x844"],
    "aftersale-home-comparison-390x844.png",
    "B6 售后 · 当前运行实现",
  );

  await page.locator("#aftersale-evidence").scrollIntoViewIfNeeded();
  await expect(page.getByText("等待你确认")).toBeVisible();
  await expect(page.getByText("履约图片由平台私密保存，仅用于当前订单确认与售后处理。")).toBeVisible();
  await expect(page.getByText(/local|mock|providerStatus|Service Evidence/i)).toHaveCount(0);
  await page.getByRole("button", { name: "确认服务完成" }).click();
  await expect(page.getByText("完工结果已确认", { exact: true })).toBeVisible();
  await expect(page.getByText("服务记录号：fulfillment-b6-01")).toBeVisible();
  await saveScreenshot(page, "aftersale-confirmed-390x844.png");
  expect(consoleErrors).toEqual([]);

  await writeFile(join(process.cwd(), evidenceRoot, "aftersale-automated.report.json"), `${JSON.stringify({
    version: "1.0.0",
    lane: "P6-B6",
    role: "customer",
    surface: "aftersale",
    route: "/customer/aftersale?orderId=order-b6-aftersale",
    authority: authorityPath,
    dataSource: "contract-faithful-local-route-fixture",
    viewports,
    states: ["records-ready", "evidence-pending", "server-confirmed-completion"],
    checks: {
      singleCustomerShell: true,
      phase17StatusSemantics: true,
      serverConfirmedDecision: true,
      noImplementationLeakage: true,
      noHorizontalOverflow: true,
      touchTargets: true,
      keyboardFocus: true,
      reducedMotion: true,
      forcedColors: true,
      consoleClean: true,
    },
    result: "automated-checks-passed",
  }, null, 2)}\n`, "utf8");
});
