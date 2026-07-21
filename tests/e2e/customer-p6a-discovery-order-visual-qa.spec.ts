import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const evidenceDir = path.resolve(
  process.cwd(),
  process.env.XLB_CUSTOMER_P6A_EVIDENCE_DIR
    ?? "docs/design/ui/phase25/evidence/customer/p6-a-discovery-order",
);
const enforceGate = process.env.XLB_CUSTOMER_P6A_ENFORCE === "1";
const officialCatalogPath = path.resolve(process.cwd(), "docs/catalog/服务类目完整清单.tsv");

type QaMode = {
  catalogError: boolean;
  couponError: boolean;
  quoteError: boolean;
};

type Metric = {
  name: string;
  path: string;
  viewport: { width: number; height: number };
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  undersizedTargets: Array<{ label: string; width: number; height: number }>;
};

function buildOfficialCatalogFixture() {
  const lines = fs.readFileSync(officialCatalogPath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const rows = lines.slice(1).map((line) => {
    const [category, itemPath, skuName, skuId, unit] = line.split("\t");
    return { category, itemPath, skuName, skuId, unit };
  }).filter((row) => row.category && row.skuId && row.skuName);

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = grouped.get(row.category) ?? [];
    if (current.length < 2) current.push(row);
    grouped.set(row.category, current);
  }

  return {
    cityCode: "hangzhou",
    categories: [...grouped.entries()].map(([name, categoryRows], categoryIndex) => ({
      categoryId: `qa-category-${categoryIndex + 1}`,
      cityCode: "hangzhou",
      name,
      sortOrder: categoryIndex + 1,
      isEnabled: true,
      items: categoryRows.map((row, itemIndex) => ({
        itemId: `qa-item-${categoryIndex + 1}-${itemIndex + 1}`,
        categoryId: `qa-category-${categoryIndex + 1}`,
        cityCode: "hangzhou",
        name: row.itemPath.split(">").at(-1)?.trim() || row.skuName,
        sortOrder: itemIndex + 1,
        isEnabled: true,
        skus: [{
          skuId: row.skuId,
          itemId: `qa-item-${categoryIndex + 1}-${itemIndex + 1}`,
          cityCode: "hangzhou",
          name: row.skuName,
          unit: row.unit || "次",
          profile: null,
          standards: [],
          sortOrder: 1,
          isEnabled: true,
        }],
      })),
    })),
  };
}

const catalog = buildOfficialCatalogFixture();
const firstSku = catalog.categories[0]?.items[0]?.skus[0];
if (!firstSku) throw new Error("Official catalog fixture has no SKU rows");

async function installQaEnvironment(
  page: Page,
  mode: QaMode,
  consoleErrors: string[],
  expectedNetworkErrors: string[],
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("xlb.customer.token", "p6a-visual-qa-token");
    window.localStorage.setItem("xlb.customer.userId", "customer-p6a-qa");
    window.localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = `console: ${message.text()}`;
    const isExpectedFailureState = mode.catalogError || mode.couponError || mode.quoteError;
    if (isExpectedFailureState && message.text().includes("Failed to load resource: the server responded with a status of 503")) {
      expectedNetworkErrors.push(entry);
    } else {
      consoleErrors.push(entry);
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === "/api/catalog") {
      if (mode.catalogError) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "P6A_CATALOG_UNAVAILABLE" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, catalog }) });
      }
      return;
    }
    if (requestUrl.pathname === "/api/pricing/quote") {
      if (mode.quoteError) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "P6A_QUOTE_UNAVAILABLE" }) });
      } else {
        const skuId = requestUrl.searchParams.get("skuId") ?? firstSku.skuId;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            quote: {
              cityCode: "hangzhou",
              skuId,
              basePrice: 89,
              currency: "CNY",
              priceText: "¥89/次",
              priceType: "fixed",
              minPrice: null,
              maxPrice: null,
              pricingNote: null,
              priceRuleId: "qa-price-rule",
              version: 1,
              skuProfile: null,
              standards: [],
              breakdown: {
                baseAmount: 89,
                requiredFeeAmount: 0,
                optionalFeeAmount: 0,
                totalAmount: 89,
                feeItems: [],
              },
            },
          }),
        });
      }
      return;
    }
    if (requestUrl.pathname === "/api/customer/marketing/coupon-grants") {
      if (mode.couponError) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "P6A_COUPON_UNAVAILABLE" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, couponGrants: [] }) });
      }
      return;
    }
    if (requestUrl.pathname === "/api/customer/addresses") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, addresses: [] }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "P6A_UNMOCKED_API" }) });
  });
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function capture(page: Page, name: string, metrics: Metric[], fullPage = false) {
  await settle(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Viewport is unavailable");
  const measurement = await page.evaluate(() => {
    const targets = [...document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((target) => target.width < 44 || target.height < 44);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      undersizedTargets: targets,
    };
  });
  metrics.push({ name, path: page.url(), viewport, ...measurement });
  expect(measurement.scrollWidth, `${name} must not overflow horizontally`).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage, animations: "disabled" });
}

async function openHome(page: Page) {
  await page.goto("/customer/?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "喜乐帮", exact: true })).toBeVisible();
  await expect(page.getByLabel("全部服务类目")).toBeVisible();
}

async function openServices(page: Page) {
  await page.goto("/customer/services?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "找到适合的上门服务" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "服务类别" })).toBeVisible();
}

async function openCoupons(page: Page) {
  await page.goto("/customer/coupons?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "我的优惠券" })).toBeVisible();
  await expect(page.getByText("当前没有可使用的优惠券")).toBeVisible();
}

async function openOrderConfirm(page: Page) {
  await page.goto(`/customer/order/create?cityCode=hangzhou&skuId=${encodeURIComponent(firstSku.skuId)}`);
  await expect(page.getByRole("heading", { name: "填写地址" })).toBeVisible();
  await expect(page.getByText(firstSku.name, { exact: true }).first()).toBeVisible();
  await expect(page.locator(".customer-shell-banner")).toContainText("已读取链接中的服务或优惠参数");
  await expect(page.locator(".customer-shell-banner")).not.toContainText("正在恢复");
  await page.getByLabel("详细地址").fill("西湖区文三路 138 号 2 幢 501 室");
  await page.getByLabel("联系人").fill("顾客 QA");
  await page.getByLabel("手机号").fill("13800000001");
  await page.getByRole("button", { name: "下一步：选择时间" }).click();
  await page.getByRole("button", { name: "下一步：确认预约" }).click();
  await expect(page.getByRole("heading", { name: "确认预约" })).toBeVisible();
  await expect(page.getByText("服务端实时报价")).toBeVisible();
}

test("A6 发现与下单视觉 QA：三档视口、关键状态与可用性证据", async ({ page }) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const mode: QaMode = { catalogError: false, couponError: false, quoteError: false };
  const consoleErrors: string[] = [];
  const expectedNetworkErrors: string[] = [];
  const metrics: Metric[] = [];
  await installQaEnvironment(page, mode, consoleErrors, expectedNetworkErrors);

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    await openHome(page);
    await capture(page, `home-ready-${width}x844`, metrics);

    await openServices(page);
    await capture(page, `services-ready-${width}x844`, metrics);

    await openCoupons(page);
    await capture(page, `coupons-empty-${width}x844`, metrics);

    await openOrderConfirm(page);
    await capture(page, `order-confirm-${width}x844`, metrics);
  }

  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/customer/order/create?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "选择服务" })).toBeVisible();
  await capture(page, "order-service-step-390x844", metrics);
  await page.getByLabel("服务项目").selectOption(firstSku.skuId);
  await page.getByRole("button", { name: "下一步：填写地址" }).click();
  await expect(page.getByRole("heading", { name: "填写地址" })).toBeVisible();
  await capture(page, "order-address-step-390x844", metrics);
  await page.getByLabel("详细地址").fill("西湖区文三路 138 号 2 幢 501 室");
  await page.getByLabel("联系人").fill("顾客 QA");
  await page.getByLabel("手机号").fill("13800000001");
  await page.getByRole("button", { name: "下一步：选择时间" }).click();
  await expect(page.getByRole("heading", { name: "选择上门时间" })).toBeVisible();
  await capture(page, "order-schedule-step-390x844", metrics);

  await openServices(page);
  await page.getByRole("button", { name: `选择${firstSku.name}` }).click();
  await expect(page.getByRole("complementary", { name: "已选服务" })).toBeVisible();
  await capture(page, "services-selected-390x844", metrics);
  await page.getByRole("link", { name: "继续预约" }).click();
  await expect(page).toHaveURL(new RegExp(`skuId=${encodeURIComponent(firstSku.skuId)}`));
  await expect(page.getByRole("heading", { name: "填写地址" })).toBeVisible();

  await openHome(page);
  await capture(page, "home-ready-390-full", metrics, true);
  await openServices(page);
  await capture(page, "services-ready-390-full", metrics, true);
  await openCoupons(page);
  await capture(page, "coupons-empty-390-full", metrics, true);
  await openOrderConfirm(page);
  await capture(page, "order-confirm-390-full", metrics, true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await capture(page, "order-confirm-bottom-390x844", metrics);

  mode.catalogError = true;
  await page.goto("/customer/?cityCode=hangzhou");
  await expect(page.getByText("服务目录暂时没有加载成功")).toBeVisible();
  await capture(page, "home-catalog-error-390x844", metrics);
  mode.catalogError = false;

  await openServices(page);
  const search = page.getByPlaceholder("搜索保洁、维修、搬家");
  await search.fill("不存在的服务");
  await page.getByRole("button", { name: "搜索服务" }).click();
  await expect(page.getByText("没有匹配的服务", { exact: true })).toBeVisible();
  await capture(page, "services-no-result-390x844", metrics);

  mode.couponError = true;
  await page.goto("/customer/coupons?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "我的优惠券" })).toBeVisible();
  await expect(page.getByText("暂时无法完成请求")).toBeVisible();
  await capture(page, "coupons-error-390x844", metrics);
  mode.couponError = false;

  mode.quoteError = true;
  await page.goto(`/customer/order/create?cityCode=hangzhou&skuId=${encodeURIComponent(firstSku.skuId)}`);
  await expect(page.getByRole("heading", { name: "填写地址" })).toBeVisible();
  await page.getByLabel("详细地址").fill("西湖区文三路 138 号 2 幢 501 室");
  await page.getByLabel("联系人").fill("顾客 QA");
  await page.getByLabel("手机号").fill("13800000001");
  await page.getByRole("button", { name: "下一步：选择时间" }).click();
  await page.getByRole("button", { name: "下一步：确认预约" }).click();
  await expect(page.getByText("报价获取失败")).toBeVisible();
  await capture(page, "order-quote-error-390x844", metrics);

  const undersizedTargets = metrics.flatMap((metric) =>
    metric.undersizedTargets.map((target) => ({ ...target, scenario: metric.name })),
  );

  fs.writeFileSync(
    path.join(evidenceDir, "a6-runtime-metrics.json"),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceCommit: process.env.XLB_CUSTOMER_QA_SOURCE_COMMIT ?? "working-tree",
      officialCatalogSource: "docs/catalog/服务类目完整清单.tsv",
      fixtureCategoryCount: catalog.categories.length,
      fixtureSkuCount: catalog.categories.reduce((sum, category) => sum + category.items.reduce((inner, item) => inner + item.skus.length, 0), 0),
      visualGate: undersizedTargets.length === 0 ? "pass" : "fail",
      severityCounts: undersizedTargets.length === 0
        ? { p0: 0, p1: 0, p2: 0, p3: 0 }
        : { p0: 0, p1: 1, p2: 0, p3: 0 },
      consoleErrors,
      expectedNetworkErrors,
      metrics,
    }, null, 2)}\n`,
    "utf8",
  );

  expect(consoleErrors, "No console errors or uncaught page errors are allowed").toEqual([]);
  if (enforceGate) {
    expect(undersizedTargets, "All visible interactive targets must be at least 44×44px").toEqual([]);
  }
});
