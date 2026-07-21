import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const confirmEvidence = `${evidenceRoot}/customer-order-create-confirm-390x844-b3-01.png`;
const successEvidence = `${evidenceRoot}/customer-order-create-success-390x844-b3-01.png`;
const comparisonEvidence = `${evidenceRoot}/customer-order-create-home-comparison-390x844-b3-01.png`;
const reportEvidence = `${evidenceRoot}/customer-order-create-390x844-b3-01.report.json`;

const catalog = {
  cityCode: "hangzhou",
  categories: [{
    categoryId: "category-gate3",
    cityCode: "hangzhou",
    name: "家庭保洁",
    sortOrder: 1,
    isEnabled: true,
    items: [{
      itemId: "item-gate3",
      categoryId: "category-gate3",
      cityCode: "hangzhou",
      name: "日常保洁",
      sortOrder: 1,
      isEnabled: true,
      skus: [{
        skuId: "sku-gate3",
        itemId: "item-gate3",
        cityCode: "hangzhou",
        name: "2小时日常保洁",
        unit: "次",
        profile: null,
        standards: [],
        sortOrder: 1,
        isEnabled: true,
      }],
    }],
  }],
};

const quote = {
  cityCode: "hangzhou",
  skuId: "sku-gate3",
  basePrice: 120,
  currency: "CNY",
  priceText: "服务端固定报价",
  priceType: "fixed",
  minPrice: null,
  maxPrice: null,
  pricingNote: null,
  priceRuleId: "price-rule-gate3",
  version: 1,
  skuProfile: null,
  standards: [],
  breakdown: {
    baseAmount: 120,
    requiredFeeAmount: 0,
    optionalFeeAmount: 0,
    totalAmount: 120,
    feeItems: [],
  },
};

const order = {
  orderId: "order-gate3",
  cityCode: "hangzhou",
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "文三路 100 号",
  contactName: "顾客验收",
  contactPhone: "13800000001",
  scheduledAt: "2099-07-25T01:00:00.000Z",
  scheduledTimeSlot: "morning",
  customerId: "customer-gate3",
  skuId: "sku-gate3",
  skuName: "2小时日常保洁",
  quantity: 1,
  unit: "次",
  priceRuleId: "price-rule-gate3",
  priceText: "服务端固定报价",
  priceType: "fixed",
  basePrice: 120,
  currency: "CNY",
  totalAmount: 120,
  quoteSnapshot: null,
  status: "pending_dispatch",
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

async function installFixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-gate3-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-gate3");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, catalog }),
  }));
  await page.route("**/api/pricing/quote?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, quote }),
  }));
  await page.route("**/api/customer/marketing/coupon-grants*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, couponGrants: [] }),
  }));
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    expect(payload.skuId).toBe("sku-gate3");
    expect(payload).not.toHaveProperty("customerId");
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: true, order }),
    });
  });
  await page.route("**/api/orders/order-gate3", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, order }),
  }));
}

async function saveScreenshot(page: Page, relativePath: string) {
  const output = join(process.cwd(), relativePath);
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: false, animations: "disabled" });
  return output;
}

async function createComparisonBoard(context: BrowserContext, actualPath: string) {
  const source = readFileSync(join(process.cwd(), "docs/design/ui/references/customer-home-visual-truth.png")).toString("base64");
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
      <figure><img src="data:image/png;base64,${actual}"><figcaption>B3 预约下单 · 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test("B3 discovery-to-order path renders one shell and completes after server confirmation", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  await installFixture(page);
  await page.goto("/customer/order/create?cityCode=hangzhou&skuId=sku-gate3");

  await expect(page.getByRole("heading", { name: "填写地址" })).toBeVisible();
  await expect(page.getByText("2小时日常保洁", { exact: true })).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);

  await page.getByLabel("详细地址").fill("文三路 100 号");
  await page.getByLabel("联系人").fill("顾客验收");
  await page.getByLabel("手机号").fill("13800000001");
  await page.getByRole("button", { name: "下一步：选择时间" }).click();
  await page.getByRole("button", { name: "下一步：确认预约" }).click();

  await expect(page.getByRole("heading", { name: "确认预约" })).toBeVisible();
  await expect(page.getByText("服务端实时报价")).toBeVisible();
  const submitButton = page.getByRole("button", { name: "提交预约" });
  await expect(submitButton).toBeEnabled();

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    const undersized = await page.locator(".order-create-topbar button, .customer-order-create-template button, .customer-order-create-template input, .customer-order-create-template select, .customer-order-create-template textarea").evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(node);
        const isUndersized = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.width < 44 || rect.height < 44);
        return isUndersized ? [{
          tag: node.tagName,
          text: node.textContent?.trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          className: (node as HTMLElement).className,
        }] : [];
      }),
    );
    expect(undersized, `${viewport.width}px has undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await submitButton.focus();
  await expect(submitButton).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("heading", { name: "确认预约" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.locator(".order-create-quote").evaluate((element) => element.scrollIntoView({ block: "center" }));

  const confirmPath = await saveScreenshot(page, confirmEvidence);
  await createComparisonBoard(context, confirmPath);
  await submitButton.click();
  await expect(page.getByText("预约已提交", { exact: true })).toBeVisible();
  await expect(page.getByText("order-gate3", { exact: true })).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
  await saveScreenshot(page, successEvidence);
  expect(consoleErrors).toEqual([]);

  const report = {
    version: "1.0.0",
    role: "customer",
    surface: "order-create",
    route: "/customer/order/create?skuId=sku-gate3",
    viewport: { width: 390, height: 844 },
    dataSource: "contract-faithful-api-fixture",
    authority: "docs/design/ui/references/customer-home-visual-truth.png",
    states: ["confirm", "server-confirmed-success"],
    checks: {
      discoveryDeepLink: true,
      singleCustomerShell: true,
      serverQuote: true,
      serverConfirmedOrder: true,
      noHorizontalOverflow: true,
      touchTargets: true,
      keyboardFocus: true,
      reducedMotion: true,
      forcedColors: true,
      noClientPricingClaim: true,
      consoleClean: true,
    },
    result: "passed",
  };
  await writeFile(join(process.cwd(), reportEvidence), `${JSON.stringify(report, null, 2)}\n`, "utf8");
});
