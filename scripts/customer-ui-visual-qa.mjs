import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.XLB_CUSTOMER_QA_URL ?? "http://127.0.0.1:5173";
const outputDir = path.resolve("artifacts/design-qa/customer-2026-07-19");

const catalog = {
  cityCode: "hangzhou",
  categories: [
    {
      categoryId: "cat_home_cleaning",
      cityCode: "hangzhou",
      name: "家庭保洁",
      sortOrder: 1,
      isEnabled: true,
      items: [
        {
          itemId: "item_home_daily_2h",
          categoryId: "cat_home_cleaning",
          cityCode: "hangzhou",
          name: "日常保洁 · 按小时保洁",
          sortOrder: 1,
          isEnabled: true,
          skus: [
            {
              skuId: "sku_home_daily_2h",
              itemId: "item_home_daily_2h",
              cityCode: "hangzhou",
              name: "2小时日常保洁",
              unit: "次",
              profile: null,
              standards: [],
              sortOrder: 1,
              isEnabled: true,
            },
            {
              skuId: "sku_home_daily_3h",
              itemId: "item_home_daily_2h",
              cityCode: "hangzhou",
              name: "3小时日常保洁",
              unit: "次",
              profile: null,
              standards: [],
              sortOrder: 2,
              isEnabled: true,
            },
          ],
        },
      ],
    },
    {
      categoryId: "cat_appliance_cleaning",
      cityCode: "hangzhou",
      name: "家电清洗",
      sortOrder: 2,
      isEnabled: true,
      items: [
        {
          itemId: "item_air_conditioner",
          categoryId: "cat_appliance_cleaning",
          cityCode: "hangzhou",
          name: "空调清洗",
          sortOrder: 1,
          isEnabled: true,
          skus: [
            {
              skuId: "sku_air_conditioner_wall",
              itemId: "item_air_conditioner",
              cityCode: "hangzhou",
              name: "壁挂空调深度清洗",
              unit: "台",
              profile: null,
              standards: [],
              sortOrder: 1,
              isEnabled: true,
            },
          ],
        },
      ],
    },
  ],
};

const quote = {
  cityCode: "hangzhou",
  skuId: "sku_home_daily_2h",
  basePrice: 89,
  currency: "CNY",
  priceText: "¥89/2小时",
  priceType: "fixed",
  minPrice: null,
  maxPrice: null,
  pricingNote: null,
  priceRuleId: "price-rule-ui-qa",
  version: 1,
  skuProfile: null,
  standards: [],
  breakdown: { baseAmount: 89, requiredFeeAmount: 0, optionalFeeAmount: 0, totalAmount: 89, feeItems: [] },
};

const order = {
  orderId: "order-ui-qa",
  cityCode: "hangzhou",
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "文三路 100 号 2 幢 301 室",
  contactName: "陈女士",
  contactPhone: "13800000001",
  scheduledAt: "2026-07-20T01:00:00.000Z",
  scheduledTimeSlot: "morning",
  customerId: "customer-ui-qa",
  skuId: "sku_home_daily_2h",
  skuName: "2小时日常保洁",
  quantity: 1,
  unit: "次",
  priceRuleId: "price-rule-ui-qa",
  priceText: "¥89/2小时",
  priceType: "fixed",
  basePrice: 89,
  currency: "CNY",
  totalAmount: 89,
  quoteSnapshot: null,
  status: "pending_dispatch",
  createdAt: "2026-07-19T09:00:00.000Z",
  updatedAt: "2026-07-19T09:00:00.000Z",
};

const checks = [];
const consoleErrors = [];
const expectedConsoleErrors = [];
let catalogMode = "success";

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: "zh-CN",
  colorScheme: "light",
});

await context.addInitScript(() => {
  localStorage.setItem("xlb.customer.token", "customer-ui-qa-token");
  localStorage.setItem("xlb.customer.userId", "customer-ui-qa");
  localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  localStorage.removeItem("xlb.customer.orderIds");
});

const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (catalogMode === "error" && message.text().includes("Failed to load resource")) {
    expectedConsoleErrors.push(message.text());
    return;
  }
  consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/api/catalog") {
    if (catalogMode === "loading") await new Promise((resolve) => setTimeout(resolve, 1200));
    if (catalogMode === "error") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "服务暂时不可用" }) });
      return;
    }
    const catalogBody = catalogMode === "empty" ? { ...catalog, categories: [] } : catalog;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, catalog: catalogBody }) });
    return;
  }
  if (url.pathname === "/api/pricing/quote") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, quote }) });
    return;
  }
  if (url.pathname === "/api/customer/marketing/coupon-grants") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, couponGrants: [] }) });
    return;
  }
  if (url.pathname === "/api/orders" || url.pathname === `/api/orders/${order.orderId}`) {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, order }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
});

async function recordLayout(name) {
  const layout = await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    };
    const touchTargets = [...document.querySelectorAll("button, a, input, select, textarea")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: rect.width > 0 && rect.height > 0,
        };
      })
      .filter((item) => item.visible && (item.width < 44 || item.height < 44));
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      keyRects: {
        main: rectFor("[data-mobile-shell-mode] > main"),
        runtimeSurface: rectFor('[data-ui="runtime-surface"]'),
        template: rectFor(".customer-template-frame"),
        templateHeader: rectFor(".customer-template-frame > header"),
        card: rectFor('[data-ui="card"]'),
        locationSearch: rectFor('[data-ui="location-search"]'),
        serviceCard: rectFor('[data-ui="service-card"]'),
      },
      smallTouchTargets: touchTargets,
    };
  });
  checks.push({ name, ...layout });
}

await page.goto(`${baseUrl}/customer/order/create?skuId=sku_home_daily_2h`, { waitUntil: "networkidle" });
const addressHeading = page.getByRole("heading", { name: "填写地址" });
if (!await addressHeading.isVisible().catch(() => false)) {
  const continueToAddress = page.getByRole("button", { name: "下一步：填写地址" });
  await page.waitForFunction(() => {
    const heading = [...document.querySelectorAll("h1, h2, h3")].find((item) => item.textContent?.trim() === "填写地址");
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("下一步：填写地址"));
    return Boolean(heading) || (button instanceof HTMLButtonElement && !button.disabled);
  });
  if (!await addressHeading.isVisible().catch(() => false)) await continueToAddress.click();
}
await addressHeading.waitFor();
await page.getByLabel("详细地址").fill("西湖区文三路 100 号 2 幢 301 室");
await page.getByLabel("联系人").fill("陈女士");
await page.getByLabel("手机号").fill("13800000001");
await page.getByLabel("手机号").blur();
await page.screenshot({ path: path.join(outputDir, "order-create-address-390x844.png") });
await page.screenshot({ path: path.join(outputDir, "order-create-address-full.png"), fullPage: true });
await recordLayout("order-create-address");

await page.getByRole("button", { name: "下一步：选择时间" }).click();
await page.getByRole("heading", { name: "选择上门时间" }).waitFor();
await page.getByRole("button", { name: "下一步：确认预约" }).click();
await page.getByRole("heading", { name: "确认预约" }).waitFor();
await page.getByText("¥89/2小时", { exact: true }).waitFor();
await page.getByRole("button", { name: "提交预约" }).click();
await page.getByText("预约已提交", { exact: true }).waitFor();
await page.screenshot({ path: path.join(outputDir, "order-create-success-390x844.png") });
await recordLayout("order-create-success");

await page.goto(`${baseUrl}/customer/`, { waitUntil: "networkidle" });
await page.getByText("查找上门服务", { exact: true }).waitFor();
await page.screenshot({ path: path.join(outputDir, "home-ready-390x844.png") });
await recordLayout("home-ready");

await page.goto(`${baseUrl}/customer/services`, { waitUntil: "networkidle" });
await page.getByText("服务列表", { exact: true }).waitFor();
await page.screenshot({ path: path.join(outputDir, "services-ready-390x844.png") });
await recordLayout("services-ready");

catalogMode = "loading";
await page.goto(`${baseUrl}/customer/?qa=loading`, { waitUntil: "domcontentloaded" });
await page.getByText("服务目录加载中", { exact: true }).waitFor();
await page.screenshot({ path: path.join(outputDir, "home-loading-390x844.png") });
await recordLayout("home-loading");

catalogMode = "empty";
await page.goto(`${baseUrl}/customer/services?qa=empty`, { waitUntil: "networkidle" });
await page.getByText("当前城市暂无服务", { exact: true }).waitFor();
await page.screenshot({ path: path.join(outputDir, "services-empty-390x844.png") });
await recordLayout("services-empty");

catalogMode = "error";
await page.goto(`${baseUrl}/customer/services?qa=error`, { waitUntil: "networkidle" });
await page.getByText("服务加载失败", { exact: true }).waitFor();
await page.screenshot({ path: path.join(outputDir, "services-error-390x844.png") });
await recordLayout("services-error");

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  viewport: { width: 390, height: 844 },
  checks,
  consoleErrors,
  expectedConsoleErrors,
};
await writeFile(path.join(outputDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await browser.close();

if (consoleErrors.length > 0 || checks.some((check) => check.horizontalOverflow)) {
  process.exitCode = 1;
}
