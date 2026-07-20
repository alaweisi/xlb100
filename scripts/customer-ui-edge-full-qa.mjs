import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.XLB_CUSTOMER_QA_URL ?? "http://127.0.0.1:5173";
const outputDir = path.resolve("artifacts/design-qa/customer-edge-full-2026-07-20");

const categoryDefinitions = [
  ["cat-home-cleaning", "家庭保洁", "sku_home_daily_2h", "2小时日常保洁"],
  ["cat-appliance-cleaning", "家电清洗", "sku_ac_wall_basic", "挂机空调普通清洗"],
  ["cat-appliance-repair", "家电维修", "sku-appliance-repair", "家电故障检修"],
  ["cat-installation", "上门安装", "sku-installation", "家具上门安装"],
  ["cat-pipe", "管道疏通", "sku-pipe", "厨房管道疏通"],
  ["cat-lock", "开锁换锁", "sku_lock_unlock_standard", "普通门锁开锁"],
  ["cat-utilities", "水电维修", "sku-utilities", "水路故障维修"],
  ["cat-waterproofing", "防水补漏/精准测漏", "sku-waterproofing", "卫生间精准测漏"],
  ["cat-furniture", "家具家居维修保养", "sku-furniture", "家具维修保养"],
  ["cat-renovation", "房屋修缮/局部改造", "sku-renovation", "墙面局部修缮"],
  ["cat-moving", "搬家搬运/拆旧清运", "sku-moving", "家庭搬运服务"],
  ["cat-air-quality", "甲醛检测治理", "sku-air-quality", "室内甲醛检测"],
  ["cat-digital", "数码办公维修", "sku-digital", "电脑故障检修"],
  ["cat-laundry", "洗衣洗鞋", "sku-laundry", "日常衣物洗护"],
  ["cat-care", "保姆月嫂/照护", "sku-care", "居家照护评估"],
  ["cat-pest-control", "四害消杀", "sku-pest-control", "家庭四害消杀"],
];

const catalog = {
  cityCode: "hangzhou",
  categories: categoryDefinitions.map(([categoryId, name, skuId, skuName], index) => ({
    categoryId, cityCode: "hangzhou", name, sortOrder: index + 1, isEnabled: true,
    items: [{
      itemId: `item-${index + 1}`, categoryId, cityCode: "hangzhou", name: `${name}服务`, sortOrder: 1, isEnabled: true,
      skus: [{ skuId, itemId: `item-${index + 1}`, cityCode: "hangzhou", name: skuName, unit: "次", profile: null, standards: [], sortOrder: 1, isEnabled: true }],
    }],
  })),
};

const quote = {
  cityCode: "hangzhou", skuId: "sku_home_daily_2h", basePrice: 89, currency: "CNY", priceText: "¥89/2小时",
  priceType: "fixed", minPrice: null, maxPrice: null, pricingNote: null, priceRuleId: "price-rule-edge", version: 1,
  skuProfile: null, standards: [], breakdown: { baseAmount: 89, requiredFeeAmount: 0, optionalFeeAmount: 0, totalAmount: 89, feeItems: [] },
};

const order = {
  orderId: "order-edge-1", cityCode: "hangzhou", addressProvince: "浙江省", addressCity: "杭州市", addressDistrict: "西湖区",
  detailAddress: "文三路100号2幢301室", contactName: "陈女士", contactPhone: "13800000001",
  scheduledAt: "2026-07-21T01:00:00.000Z", scheduledTimeSlot: "morning", customerId: "customer-edge",
  skuId: "sku_home_daily_2h", skuName: "2小时日常保洁", quantity: 1, unit: "次", priceRuleId: "price-rule-edge",
  priceText: "¥89/2小时", priceType: "fixed", basePrice: 89, currency: "CNY", totalAmount: 89, quoteSnapshot: null,
  status: "pending_dispatch", createdAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-20T09:00:00.000Z",
};

const profile = {
  customerId: "customer-edge", phoneMasked: "138****0001", name: "陈女士", avatarUrl: null,
  defaultCityCode: "hangzhou", updatedAt: "2026-07-20T09:00:00.000Z",
};
const address = {
  addressId: "address-edge-1", customerId: "customer-edge", contactName: "陈女士", contactPhoneMasked: "138****0001",
  province: "浙江省", city: "杭州市", district: "西湖区", detailAddress: "文三路100号2幢301室", isDefault: true,
  createdAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-20T09:00:00.000Z",
};
const notification = {
  notificationId: "notification-edge-1", eventType: "order.created", templateRevisionId: "template-edge-1",
  title: "预约已提交", body: "家庭保洁预约已进入派单流程。", reference: { kind: "order_created", orderId: order.orderId },
  occurredAt: "2026-07-20T09:00:00.000Z", createdAt: "2026-07-20T09:00:00.000Z", readAt: null, archivedAt: null, rowVersion: 1,
};
const workerShowcase = {
  ok: true,
  items: [
    { showcaseId: "showcase-zhang", displayName: "张师傅", skillCategoryNames: ["家庭保洁", "家电清洗"], averageRating: 4.9, ratingCount: 126, certificationLabel: "平台认证" },
    { showcaseId: "showcase-li", displayName: "李师傅", skillCategoryNames: ["家电维修", "水电维修"], averageRating: 4.8, ratingCount: 88, certificationLabel: "平台认证" },
  ],
  disclosure: "仅展示平台师傅的服务能力与公开评价；顾客不能联系、指定或直接预约师傅，订单仍由平台统一派单。",
};
const coupon = {
  couponGrantId: "coupon-edge-1", couponDefinitionId: "definition-edge-1", marketingCampaignId: "campaign-edge-1",
  ruleRevisionId: "revision-edge-1", cityCode: "hangzhou", customerId: "customer-edge", status: "available",
  issuanceReason: "admin_manual", issuanceRef: "approval-edge-1", availableAt: "2026-07-19T00:00:00.000Z",
  expiresAt: "2026-08-20T00:00:00.000Z", version: 1, createdAt: "2026-07-19T00:00:00.000Z", updatedAt: "2026-07-19T00:00:00.000Z",
};

const scenarios = [
  { carrier: "C-00", name: "auth-loading", route: "/customer/", mode: "auth-loading", auth: false },
  { carrier: "C-00", name: "auth-error", route: "/customer/", mode: "auth-error", auth: false },
  { carrier: "C-01", name: "home-ready", route: "/customer/", mode: "ready" },
  { carrier: "C-01", name: "home-empty", route: "/customer/", mode: "catalog-empty" },
  { carrier: "C-02", name: "services-ready", route: "/customer/services", mode: "ready" },
  { carrier: "C-02", name: "services-error", route: "/customer/services", mode: "catalog-error" },
  { carrier: "C-03", name: "order-create-ready", route: "/customer/order/create?skuId=sku_home_daily_2h", mode: "ready" },
  { carrier: "C-03", name: "order-create-quote-error", route: "/customer/order/create?skuId=sku_home_daily_2h", mode: "quote-error" },
  { carrier: "C-04", name: "orders-ready", route: `/customer/orders?orderId=${order.orderId}`, mode: "orders-ready", orderIds: true },
  { carrier: "C-04", name: "orders-empty", route: "/customer/orders", mode: "ready" },
  { carrier: "C-05", name: "aftersale-ready", route: `/customer/aftersale?orderId=${order.orderId}`, mode: "ready", orderIds: true },
  { carrier: "C-05", name: "aftersale-error", route: `/customer/aftersale?orderId=${order.orderId}`, mode: "aftersale-error", orderIds: true },
  { carrier: "C-06", name: "support-ready", route: "/customer/support", mode: "ready" },
  { carrier: "C-06", name: "support-error", route: "/customer/support", mode: "support-error" },
  { carrier: "C-07", name: "notifications-ready", route: "/customer/notifications", mode: "ready" },
  { carrier: "C-07", name: "notifications-error", route: "/customer/notifications", mode: "notifications-error" },
  { carrier: "C-08", name: "coupons-ready", route: "/customer/coupons", mode: "ready" },
  { carrier: "C-08", name: "coupons-error", route: "/customer/coupons", mode: "coupons-error" },
  { carrier: "C-09", name: "profile-ready", route: "/customer/profile", mode: "ready" },
  { carrier: "C-09", name: "profile-error", route: "/customer/profile", mode: "profile-error" },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];

function responseFor(url, mode) {
  const pathname = url.pathname;
  if (pathname.startsWith("/api/auth/customer/")) {
    if (mode === "auth-loading") return { delay: 10_000, body: { ok: true } };
    return { status: 503, body: { ok: false, error: "网络暂时不可用", statusCode: 503 } };
  }
  if (pathname === "/api/catalog") {
    if (mode === "catalog-error") return { status: 503, body: { ok: false, error: "服务目录暂时不可用" } };
    return { body: { ok: true, catalog: mode === "catalog-empty" ? { ...catalog, categories: [] } : catalog } };
  }
  if (pathname === "/api/pricing/quote") {
    if (mode === "quote-error") return { status: 409, body: { ok: false, error: "报价已更新，请重新确认" } };
    return { body: { ok: true, quote } };
  }
  if (pathname === `/api/orders/${order.orderId}`) return { body: { ok: true, order } };
  if (pathname === `/api/orders/${order.orderId}/review`) return { body: { ok: true, review: null } };
  if (pathname.endsWith("/reverse-requests")) {
    if (mode === "aftersale-error") return { status: 503, body: { ok: false, error: "售后记录暂时无法加载" } };
    return { body: { ok: true, reverseRequests: [] } };
  }
  if (pathname === "/api/aftersale/complaints") {
    if (mode === "aftersale-error") return { status: 503, body: { ok: false, error: "售后记录暂时无法加载" } };
    return { body: { ok: true, complaints: [] } };
  }
  if (pathname.includes("/fulfillment-evidence")) return { body: { ok: true, aggregates: [] } };
  if (pathname === "/api/support/tickets") {
    if (mode === "support-error") return { status: 503, body: { ok: false, error: "客服工单暂时无法加载" } };
    return { body: { ok: true, tickets: [], nextCursor: null } };
  }
  if (pathname === "/api/support/conversations") return { body: { ok: true, conversations: [], nextCursor: null } };
  if (pathname === "/api/customer/notifications") {
    if (mode === "notifications-error") return { status: 503, body: { ok: false, error: "消息暂时无法加载" } };
    return { body: { ok: true, items: [notification], nextCursor: null } };
  }
  if (pathname === "/api/customer/notifications/unread-count") return { body: { ok: true, unreadCount: 1 } };
  if (pathname === "/api/customer/worker-showcase") return { body: workerShowcase };
  if (pathname === "/api/customer/marketing/coupon-grants") {
    if (mode === "coupons-error") return { status: 503, body: { ok: false, error: "优惠券暂时无法加载" } };
    return { body: { ok: true, couponGrants: [coupon] } };
  }
  if (pathname === "/api/customer/profile") {
    if (mode === "profile-error") return { status: 503, body: { ok: false, error: "个人资料暂时无法加载" } };
    return { body: { ok: true, profile } };
  }
  if (pathname === "/api/customer/addresses") {
    if (mode === "profile-error") return { status: 503, body: { ok: false, error: "服务地址暂时无法加载" } };
    return { body: { ok: true, addresses: [address] } };
  }
  return { body: { ok: true } };
}

async function inspect(page, scenario, authenticated) {
  return page.evaluate(({ expectedRoute, authenticated }) => {
    const shell = document.querySelector('[data-customer-shell="true"]');
    const frame = document.querySelector(".customer-device-frame");
    const nav = document.querySelector("nav");
    const small = [...document.querySelectorAll('button, a, input:not([type="checkbox"]):not([type="hidden"]), select, textarea')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName.toLowerCase(), label: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50), width: Math.round(rect.width), height: Math.round(rect.height) };
      })
      .filter((target) => target.width < 44 || target.height < 44);
    return {
      expectedRoute,
      shell: Boolean(shell),
      shellRoute: shell?.getAttribute("data-customer-route") ?? null,
      frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
      navigation: Boolean(nav),
      navigationRequired: authenticated,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      smallTouchTargets: small,
    };
  }, { expectedRoute: scenario.route, authenticated });
}

for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "zh-CN" });
  if (scenario.auth !== false) {
    await context.addInitScript(({ orderIds }) => {
      localStorage.setItem("xlb.customer.token", "customer-edge-token");
      localStorage.setItem("xlb.customer.userId", "customer-edge");
      localStorage.setItem("xlb.customer.cityCode", "hangzhou");
      if (orderIds) localStorage.setItem("xlb.customer.orderIds", JSON.stringify(["order-edge-1"]));
      else localStorage.removeItem("xlb.customer.orderIds");
    }, { orderIds: Boolean(scenario.orderIds) });
  }
  const page = await context.newPage();
  const unexpectedErrors = [];
  page.on("pageerror", (error) => unexpectedErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const response = responseFor(new URL(route.request().url()), scenario.mode);
    if (response.delay) await new Promise((resolve) => setTimeout(resolve, response.delay));
    await route.fulfill({ status: response.status ?? 200, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  await page.goto(`${baseUrl}${scenario.route}`, { waitUntil: scenario.mode === "auth-loading" ? "domcontentloaded" : "networkidle", timeout: 20_000 });
  await page.locator('[data-customer-shell="true"]').waitFor({ timeout: 10_000 });
  if (scenario.mode === "quote-error") {
    await page.getByLabel("详细地址").fill("文三路100号2幢301室");
    await page.getByLabel("联系人").fill("陈女士");
    await page.getByLabel("手机号").fill("13800000001");
    await page.getByLabel("手机号").blur();
    await page.getByRole("button", { name: "下一步：选择时间" }).click();
    await page.getByRole("button", { name: "下一步：确认预约" }).click();
  }
  await page.waitForTimeout(scenario.mode === "auth-loading" ? 250 : 500);
  const screenshot = `${scenario.carrier}-${scenario.name}-390x844.png`;
  await page.screenshot({ path: path.join(outputDir, screenshot) });
  let workerShowcaseCheck = null;
  let workerShowcaseScreenshot = null;
  if (scenario.name === "home-ready") {
    const showcase = page.locator('[aria-labelledby="customer-home-workers-title"]');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    workerShowcaseScreenshot = "C-01-home-worker-showcase-390x844.png";
    await page.screenshot({ path: path.join(outputDir, workerShowcaseScreenshot) });
    workerShowcaseCheck = await showcase.evaluate((element) => {
      const disclosureText = [
        element.textContent ?? "",
        ...[...element.querySelectorAll("[aria-label]")].map((item) => item.getAttribute("aria-label") ?? ""),
      ].join(" ");
      return {
        interactiveElements: element.querySelectorAll("a, button, input, select, textarea").length,
        hasDisplayOnlyDisclosure: disclosureText.includes("不能联系、指定或直接预约师傅")
          && disclosureText.includes("平台统一派单"),
      };
    });
  }
  const check = await inspect(page, scenario, scenario.auth !== false);
  results.push({ ...scenario, screenshot, workerShowcaseScreenshot, workerShowcaseCheck, check, unexpectedErrors });
  await context.close();
}

const desktopRoutes = [
  "/customer/", "/customer/services", "/customer/order/create?skuId=sku_home_daily_2h", "/customer/orders", "/customer/aftersale",
  "/customer/support", "/customer/notifications", "/customer/coupons", "/customer/profile",
];
const desktopChecks = [];
for (const routePath of desktopRoutes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  await context.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-edge-token");
    localStorage.setItem("xlb.customer.userId", "customer-edge");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const response = responseFor(new URL(route.request().url()), "ready");
    await route.fulfill({ status: response.status ?? 200, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle" });
  await page.locator('[data-customer-shell="true"]').waitFor();
  const data = await page.evaluate(() => {
    const frame = document.querySelector(".customer-device-frame")?.getBoundingClientRect();
    return { frameWidth: frame ? Math.round(frame.width) : null, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth, shell: Boolean(document.querySelector('[data-customer-shell="true"]')), navigation: Boolean(document.querySelector("nav")) };
  });
  desktopChecks.push({ route: routePath, ...data });
  if (routePath.startsWith("/customer/order/create")) await page.screenshot({ path: path.join(outputDir, "P0-order-create-wide-shell-1440x900.png") });
  await context.close();
}

await browser.close();
const failures = [];
for (const result of results) {
  if (!result.check.shell) failures.push(`${result.name}: missing shell`);
  if (result.check.horizontalOverflow) failures.push(`${result.name}: horizontal overflow`);
  if (result.check.navigationRequired && !result.check.navigation) failures.push(`${result.name}: missing bottom navigation`);
  if (result.check.smallTouchTargets.length) failures.push(`${result.name}: ${result.check.smallTouchTargets.length} touch targets under 44px`);
  if (result.unexpectedErrors.length) failures.push(`${result.name}: page error ${result.unexpectedErrors.join("; ")}`);
  if (result.workerShowcaseCheck && (result.workerShowcaseCheck.interactiveElements > 0 || !result.workerShowcaseCheck.hasDisplayOnlyDisclosure)) {
    failures.push(`${result.name}: worker showcase is not strictly display-only`);
  }
}
for (const result of desktopChecks) {
  if (!result.shell || !result.navigation || result.horizontalOverflow || result.frameWidth > 430) failures.push(`${result.route}: desktop shell gate failed`);
}
const report = { generatedAt: new Date().toISOString(), browser: "Microsoft Edge", mobileViewport: { width: 390, height: 844 }, scenarios: results, desktopChecks, failures };
await writeFile(path.join(outputDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(path.join(outputDir, "README.md"), [
  "# 顾客端 Edge 全路由视觉验收", "", `- 浏览器：Microsoft Edge`, `- 手机画面：390×844`, `- Carrier：10`, `- 截图：${results.length + 1} 张手机图 + 1 张宽屏防退化图`, `- 结果：${failures.length ? "失败" : "通过"}`, "",
  ...results.map((item) => `- ${item.carrier} ${item.name} → \`${item.screenshot}\``), "", ...(failures.length ? ["## 未通过", "", ...failures.map((item) => `- ${item}`)] : []),
].join("\n"), "utf8");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Edge QA passed: ${results.length + 1} mobile screenshots, ${desktopChecks.length} desktop shell checks.`);
}
