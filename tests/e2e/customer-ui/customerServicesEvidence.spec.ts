import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertNoHorizontalOverflow,
  collectConsoleErrors,
  installCustomerQaSession,
} from "./qaHarness";

const writeEvidence = process.env.CUSTOMER_SERVICES_QA_WRITE_EVIDENCE === "1";
const backendPort = Number(process.env.CUSTOMER_SERVICES_QA_BACKEND_PORT ?? "3184");
const backendUrl = `http://127.0.0.1:${backendPort}`;
const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const iteration = "a3-01";
const acceptedHomePath = "docs/design/ui/phase25/evidence/customer/customer-home-available-390x844-09.png";

interface ServicesChecks {
  actualCatalog: boolean;
  noHorizontalOverflow: boolean;
  touchTargets: boolean;
  keyboardFocus: boolean;
  reducedMotion: boolean;
  forcedColors: boolean;
  noBlurFallback: boolean;
  primaryInteraction: boolean;
  noInventedPrice: boolean;
  noEngineeringCopy: boolean;
  consoleClean: boolean;
}

async function openServices(page: Page) {
  const catalogResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/catalog") && response.request().method() === "GET",
  );
  await page.goto("/customer/services?cityCode=hangzhou");
  const response = await catalogResponse;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: "找到适合的上门服务" })).toBeVisible();
  await expect(page.locator(".customer-services__service-card").first()).toBeVisible();
  return response;
}

async function inspectReady(page: Page, consoleErrors: string[]): Promise<ServicesChecks> {
  const bodyText = await page.locator("body").innerText();
  const serviceCards = page.locator(".customer-services__service-card");
  const actualCatalog = await serviceCards.count() > 0;
  await assertNoHorizontalOverflow(page);

  const undersizedTargets = await page.locator("a,button,input,select,textarea,[role='button']").evaluateAll((nodes) =>
    nodes.filter((node) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 0
        && rect.height > 0
        && (rect.width < 44 || rect.height < 44);
    }).length,
  );

  await page.keyboard.press("Tab");
  const keyboardFocus = await page.evaluate(() =>
    document.activeElement !== document.body && document.activeElement !== document.documentElement,
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  await page.emulateMedia({ forcedColors: "active" });
  const forcedColors = await page.evaluate(() => matchMedia("(forced-colors: active)").matches && document.body.innerText.length > 0);
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.addStyleTag({ content: "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" });
  const noBlurFallback = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".customer-app-root");
    return Boolean(surface && document.body.innerText.length > 0 && getComputedStyle(surface).backgroundColor !== "rgba(0, 0, 0, 0)");
  });

  await serviceCards.first().click();
  await expect(serviceCards.first()).toHaveAttribute("aria-pressed", "true");
  const selectedSkuId = new URL(page.url()).searchParams.get("skuId");
  const continueLink = page.getByRole("link", { name: /继续预约/ });
  await expect(continueLink).toBeVisible();
  const continueHref = await continueLink.getAttribute("href");
  const primaryInteraction = Boolean(
    selectedSkuId
    && continueHref === `/customer/order/create?cityCode=hangzhou&skuId=${encodeURIComponent(selectedSkuId)}`,
  );

  return {
    actualCatalog,
    noHorizontalOverflow: true,
    touchTargets: undersizedTargets === 0,
    keyboardFocus,
    reducedMotion,
    forcedColors,
    noBlurFallback,
    primaryInteraction,
    noInventedPrice: !/[¥￥]\s*\d/.test(bodyText),
    noEngineeringCopy: !/Service discovery|Available|not-wired|WorkflowUiBinding/i.test(bodyText),
    consoleClean: consoleErrors.length === 0,
  };
}

async function createComparisonBoard(context: BrowserContext, servicesPath: string, outputPath: string) {
  const [home, services] = await Promise.all([
    readFile(join(process.cwd(), acceptedHomePath)),
    readFile(servicesPath),
  ]);
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
    <header>顾客端设计语言继承 · 主页与服务发现同屏</header>
    <main>
      <figure><img src="data:image/png;base64,${home.toString("base64")}"><figcaption>已验收主页 · 设计语言基准</figcaption></figure>
      <figure><img src="data:image/png;base64,${services.toString("base64")}"><figcaption>A3 服务发现 · 业务布局</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: outputPath, fullPage: false, animations: "disabled" });
  await board.close();
}

test("A3 service discovery production route and risk states", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  await installCustomerQaSession(page, backendUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  await openServices(page);

  const checks = await inspectReady(page, consoleErrors);
  const readyConsoleErrors = [...consoleErrors];
  expect(checks).toEqual({
    actualCatalog: true,
    noHorizontalOverflow: true,
    touchTargets: true,
    keyboardFocus: true,
    reducedMotion: true,
    forcedColors: true,
    noBlurFallback: true,
    primaryInteraction: true,
    noInventedPrice: true,
    noEngineeringCopy: true,
    consoleClean: true,
  });

  const outputRoot = join(process.cwd(), evidenceRoot);
  const selectedPath = join(outputRoot, `customer-services-selected-390x844-${iteration}.png`);
  if (writeEvidence) {
    await mkdir(outputRoot, { recursive: true });
    await page.screenshot({ path: selectedPath, fullPage: false, animations: "disabled" });
    await createComparisonBoard(
      context,
      selectedPath,
      join(outputRoot, `customer-services-home-comparison-390x844-${iteration}.png`),
    );
  }

  const search = page.getByRole("searchbox");
  await search.fill("不存在的正式服务");
  await expect(page.getByText("没有匹配的服务")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "已选服务" })).toHaveCount(0);
  if (writeEvidence) {
    await page.screenshot({
      path: join(outputRoot, `customer-services-no-result-390x844-${iteration}.png`),
      fullPage: false,
      animations: "disabled",
    });
  }

  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code: "qa_catalog_unavailable" } }),
  }));
  await page.reload();
  await expect(page.getByText("暂时无法读取服务目录")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  const expectedRiskStateConsoleErrors = consoleErrors.slice(readyConsoleErrors.length);
  if (writeEvidence) {
    await page.screenshot({
      path: join(outputRoot, `customer-services-error-390x844-${iteration}.png`),
      fullPage: false,
      animations: "disabled",
    });
    await writeFile(
      join(outputRoot, `customer-services-390x844-${iteration}.report.json`),
      `${JSON.stringify({
        version: "1.0.0",
        role: "customer",
        surface: "services",
        route: "/customer/services",
        viewport: { width: 390, height: 844 },
        dataSource: "real-api",
        authority: acceptedHomePath,
        states: ["selected", "no-result", "error"],
        checks,
        readyConsoleErrors,
        expectedRiskStateConsoleErrors,
        result: "passed",
      }, null, 2)}\n`,
      "utf8",
    );
  }
});
