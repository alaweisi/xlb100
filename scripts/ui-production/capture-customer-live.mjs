import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const baseUrl = (process.env.XLB_CUSTOMER_LIVE_URL ?? "").replace(/\/+$/, "");
const token = process.env.XLB_CUSTOMER_QA_TOKEN ?? "";
const revision = process.env.XLB_CUSTOMER_QA_REVISION ?? "live";
if (!baseUrl || !token) throw new Error("XLB_CUSTOMER_LIVE_URL and XLB_CUSTOMER_QA_TOKEN are required");

const outputDir = path.resolve(`artifacts/design-qa/customer-live-${revision}`);
const viewport = { width: 390, height: 844 };
const allScenarios = [
  { carrier: "C-00", name: "login", route: "/customer/", authenticated: false },
  { carrier: "C-01", name: "home-ready", route: "/customer/" },
  { carrier: "C-01", name: "home-error", route: "/customer/", fail: "/api/catalog" },
  { carrier: "C-02", name: "services-ready", route: "/customer/services" },
  { carrier: "C-02", name: "services-error", route: "/customer/services", fail: "/api/catalog" },
  { carrier: "C-03", name: "order-create-ready", route: "/customer/order/create?skuId=sku_home_daily_2h" },
  { carrier: "C-03", name: "order-create-error", route: "/customer/order/create?skuId=sku_home_daily_2h", fail: "/api/pricing/quote" },
  { carrier: "C-04", name: "orders-ready", route: "/customer/orders" },
  { carrier: "C-04", name: "orders-error", route: "/customer/orders", fail: "/api/customer/orders" },
  { carrier: "C-05", name: "aftersale-ready", route: "/customer/aftersale" },
  { carrier: "C-05", name: "aftersale-error", route: "/customer/aftersale?orderId=qa-missing", fail: "/reverse-requests" },
  { carrier: "C-06", name: "support-ready", route: "/customer/support" },
  { carrier: "C-06", name: "support-error", route: "/customer/support", fail: "/api/support/tickets" },
  { carrier: "C-07", name: "notifications-ready", route: "/customer/notifications" },
  { carrier: "C-07", name: "notifications-error", route: "/customer/notifications", fail: "/api/customer/notifications" },
  { carrier: "C-08", name: "coupons-ready", route: "/customer/coupons" },
  { carrier: "C-08", name: "coupons-error", route: "/customer/coupons", fail: "/api/customer/marketing/coupon-grants" },
  { carrier: "C-09", name: "profile-ready", route: "/customer/profile" },
  { carrier: "C-09", name: "profile-error", route: "/customer/profile", fail: "/api/customer/profile" },
];
const scenarioFilter = process.env.XLB_CUSTOMER_QA_SCENARIO?.trim();
const scenarios = scenarioFilter ? allScenarios.filter((scenario) => scenario.name === scenarioFilter) : allScenarios;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { browser: "Microsoft Edge", browserVersion: browser.version(), baseUrl, revision, viewport, capturedAt: new Date().toISOString(), results: [] };

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "zh-CN", colorScheme: "light" });
    if (scenario.authenticated !== false) {
      await context.addInitScript(({ token }) => {
        localStorage.setItem("xlb.customer.token", token);
        localStorage.setItem("xlb.customer.userId", "customer-demo-001");
        localStorage.setItem("xlb.customer.cityCode", "hangzhou");
      }, { token });
    }
    const page = await context.newPage();
    const pageErrors = [];
    const failedAssets = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/assets/home/") && response.status() >= 400) failedAssets.push({ url: response.url(), status: response.status() });
    });
    if (scenario.fail) {
      await page.route("**/api/**", async (route) => {
        if (new URL(route.request().url()).pathname.includes(scenario.fail)) {
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "验收注入：服务暂时不可用", code: "SERVICE_UNAVAILABLE" }) });
        } else {
          await route.continue();
        }
      });
    }
    await page.goto(`${baseUrl}${scenario.route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    let renderTimeout = null;
    try {
      await page.locator(scenario.authenticated === false ? ".customer-auth-page" : ".customer-app-root").waitFor({ state: "visible", timeout: 20_000 });
    } catch (error) {
      renderTimeout = error instanceof Error ? error.message : String(error);
    }
    await page.waitForTimeout(1_500);
    const metrics = await page.evaluate(({ authenticated }) => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const smallTouchTargets = [...document.querySelectorAll("button, a, input:not([type=hidden]):not([type=checkbox]), select, textarea")]
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), label: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 48), width: Math.round(rect.width), height: Math.round(rect.height) };
        })
        .filter((target) => target.width < 44 || target.height < 44);
      return {
        authenticated,
        shell: Boolean(document.querySelector(".customer-app-root")),
        navigation: Boolean(document.querySelector("nav")),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        smallTouchTargets,
      };
    }, { authenticated: scenario.authenticated !== false });
    const screenshot = `${scenario.carrier}-${scenario.name}-390x844.png`;
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false, animations: "disabled" });
    const failures = [];
    if (renderTimeout) failures.push("expected page surface did not render");
    if (metrics.authenticated && !metrics.shell) failures.push("missing app shell");
    if (metrics.authenticated && !metrics.navigation) failures.push("missing bottom navigation");
    if (metrics.horizontalOverflow) failures.push("horizontal overflow");
    if (metrics.smallTouchTargets.length > 0) failures.push(`${metrics.smallTouchTargets.length} touch targets below 44px`);
    if (pageErrors.length > 0) failures.push(`${pageErrors.length} page errors`);
    if (failedAssets.length > 0) failures.push(`${failedAssets.length} failed visual assets`);
    report.results.push({ ...scenario, screenshot, metrics, renderTimeout, bodyText: (await page.locator("body").innerText()).slice(0, 500), pageErrors, failedAssets, failures });
    await context.close();
  }
} finally {
  await browser.close();
}

report.passed = report.results.every((result) => result.failures.length === 0);
report.summary = { scenarios: report.results.length, passed: report.results.filter((result) => result.failures.length === 0).length, failed: report.results.filter((result) => result.failures.length > 0).length };
await writeFile(path.join(outputDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputDir, ...report.summary, passed: report.passed }));
if (!report.passed) process.exitCode = 1;
