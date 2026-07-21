import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const listEvidence = `${evidenceRoot}/customer-orders-lifecycle-390x844-a4-01.png`;
const reviewEvidence = `${evidenceRoot}/customer-orders-review-390x844-a4-01.png`;
const comparisonEvidence = `${evidenceRoot}/customer-orders-home-comparison-390x844-a4-01.png`;
const reportEvidence = `${evidenceRoot}/customer-orders-390x844-a4-01.report.json`;

const catalog = { cityCode: "hangzhou", categories: [] };
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
  customerId: "customer-a4",
  skuId: "sku-cleaning-a4",
  skuName: "2小时日常保洁",
  quantity: 1,
  unit: "次",
  priceRuleId: "price-rule-a4",
  priceText: "¥128.00/次",
  priceType: "fixed",
  basePrice: 128,
  currency: "CNY",
  totalAmount: 128,
  quoteSnapshot: null,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};
const paidOrder = { ...baseOrder, orderId: "order-paid-a4", status: "paid" };
const payableOrder = {
  ...baseOrder,
  orderId: "order-payable-a4",
  skuName: "挂式空调清洗",
  priceText: "¥168.00/台",
  totalAmount: 168,
  status: "service_completed",
  createdAt: "2026-07-21T08:00:00.000Z",
};

async function installFixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-a4-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-a4");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
    localStorage.setItem("xlb.customer.orderIds", JSON.stringify(["order-paid-a4", "order-payable-a4"]));
  });
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, catalog }),
  }));
  await page.route("**/api/orders/order-paid-a4", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, order: paidOrder }),
  }));
  await page.route("**/api/orders/order-payable-a4", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, order: payableOrder }),
  }));
  await page.route("**/api/orders/*/review", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, review: null }),
  }));
}

async function saveScreenshot(page: Page, relativePath: string) {
  const output = join(process.cwd(), relativePath);
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: false, animations: "disabled" });
  return output;
}

async function createComparisonBoard(context: BrowserContext, actualPath: string) {
  const sourcePath = "docs/design/ui/phase25/evidence/customer/customer-home-available-390x844-09.png";
  const source = readFileSync(join(process.cwd(), sourcePath)).toString("base64");
  const actual = readFileSync(actualPath).toString("base64");
  const output = join(process.cwd(), comparisonEvidence);
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
      <figure><img src="data:image/png;base64,${actual}"><figcaption>A4 订单生命周期 · 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test("A4 order lifecycle inherits Customer Home language with truthful status-driven actions", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  await installFixture(page);
  await page.goto("/customer/orders?cityCode=hangzhou");

  await expect(page.getByRole("heading", { level: 1, name: "我的订单" })).toBeVisible();
  await expect(page.getByText("2小时日常保洁", { exact: true })).toBeVisible();
  await expect(page.getByText("挂式空调清洗", { exact: true })).toBeVisible();
  await expect(page.getByText("已完成", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("待支付", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /评价本次服务/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /立即支付/ })).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/pending_dispatch|service_completed|mock pay|not-wired/i);

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    const undersized = await page.locator(".customer-orders button, .customer-orders a, .customer-orders textarea").evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.width < 44 || rect.height < 44)
          ? [{ text: node.textContent?.trim(), width: Math.round(rect.width), height: Math.round(rect.height) }]
          : [];
      }),
    );
    expect(undersized, `${viewport.width}px has undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const reviewButton = page.getByRole("button", { name: /评价本次服务/ });
  await reviewButton.focus();
  await expect(reviewButton).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("heading", { name: "我的订单" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  const listPath = await saveScreenshot(page, listEvidence);
  await createComparisonBoard(context, listPath);
  await reviewButton.click();
  await expect(page.getByRole("heading", { name: "评价本次服务" })).toBeVisible();
  await page.getByRole("heading", { name: "评价本次服务" }).evaluate((element) => element.scrollIntoView({ block: "center" }));
  await saveScreenshot(page, reviewEvidence);
  expect(consoleErrors).toEqual([]);

  const report = {
    version: "1.0.0",
    role: "customer",
    surface: "orders-complete-lifecycle",
    route: "/customer/orders",
    viewport: { width: 390, height: 844 },
    dataSource: "contract-faithful-api-fixture",
    authority: "docs/design/ui/references/customer-home-visual-truth.png",
    states: ["paid-with-review-entry", "service-completed-with-payment-entry", "review-compose"],
    checks: {
      authoritativeStatusLabels: true,
      onePrimaryNextAction: true,
      singleCustomerShell: true,
      noHorizontalOverflow: true,
      touchTargets: true,
      keyboardFocus: true,
      reducedMotion: true,
      forcedColors: true,
      noEngineeringCopy: true,
      consoleClean: true,
    },
    result: "passed",
  };
  await writeFile(join(process.cwd(), reportEvidence), `${JSON.stringify(report, null, 2)}\n`, "utf8");
});
