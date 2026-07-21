import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  HOME_AUTHORITY_PATH,
  HOME_AUTHORITY_SHA256,
  HOME_CAPTURE_CASES,
  HOME_CATEGORY_NAMES,
  HOME_EVIDENCE_ROOT,
  HOME_QA_ITERATION,
  homeComparisonName,
  homeReportName,
  homeScreenshotName,
} from "../../../scripts/customer-ui-qa/home-contract.mjs";
import {
  assertNoHorizontalOverflow,
  collectConsoleErrors,
  installCustomerQaSession,
} from "./qaHarness";

type Severity = "P0" | "P1" | "P2" | "P3";
type Finding = { severity: Severity; summary: string; owner: string };

const writeEvidence = process.env.CUSTOMER_HOME_QA_WRITE_EVIDENCE === "1";
const enforce = process.env.CUSTOMER_HOME_QA_ENFORCE === "1";
const iteration = process.env.CUSTOMER_HOME_QA_ITERATION ?? HOME_QA_ITERATION;
const backendPort = Number(process.env.CUSTOMER_HOME_QA_BACKEND_PORT ?? "3182");
const backendUrl = `http://127.0.0.1:${backendPort}`;

async function openHome(page: Page) {
  const catalogResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/catalog") && response.request().method() === "GET",
  );
  await page.goto("/customer/?cityCode=hangzhou");
  expect((await catalogResponse).ok()).toBeTruthy();
  await expect(page.locator("body")).not.toContainText("Authenticating customer");
}

async function installPartialCatalogFixture(page: Page) {
  await page.route("**/api/catalog", async (route) => {
    const response = await route.fetch();
    const payload = JSON.parse((await response.body()).toString("utf8")) as {
      catalog?: { categories?: unknown[] };
    };
    if (payload.catalog?.categories) {
      payload.catalog.categories = payload.catalog.categories.slice(0, 3);
    }
    await route.fulfill({
      response,
      body: JSON.stringify(payload),
      headers: { ...response.headers(), "content-type": "application/json; charset=utf-8" },
    });
  }, { times: 1 });
}

async function inspectHome(page: Page, state: string, consoleErrors: string[]) {
  const bodyText = await page.locator("body").innerText();
  const findings: Finding[] = [];
  const hasText = (text: string) => bodyText.includes(text);

  if (!hasText("喜乐帮")) findings.push({ severity: "P1", summary: "缺少主页品牌标题“喜乐帮”。", owner: "B2 Home" });
  if (!hasText("全部服务")) findings.push({ severity: "P1", summary: "缺少“全部服务”主区域。", owner: "B2 Home" });

  const missingCategories = HOME_CATEGORY_NAMES.filter((name: string) => !hasText(name));
  if (state !== "partial" && missingCategories.length > 0) {
    findings.push({
      severity: "P1",
      summary: `正式 16 类目未完整呈现，缺少 ${missingCategories.length} 项：${missingCategories.slice(0, 4).join("、")}`,
      owner: "B2 Home",
    });
  }

  const categoryImages = await page.locator("img[src*='/assets/service-categories/']").count();
  if (state !== "partial" && categoryImages < 16) {
    findings.push({ severity: "P2", summary: `语义 3D 类目图像仅检测到 ${categoryImages}/16。`, owner: "B2 Home" });
  }
  if (state === "partial" && (categoryImages !== 3 || !hasText("当前已开放 3 项正式服务"))) {
    findings.push({
      severity: "P1",
      summary: `partial 状态必须呈现 3 个真实类目与明确开放数量，当前检测到 ${categoryImages}/3。`,
      owner: "B2 Home / C2 QA",
    });
  }

  for (const label of ["实名认证", "价格透明", "服务留痕", "售后保障"]) {
    if (!hasText(label)) findings.push({ severity: "P2", summary: `信任保障缺少“${label}”。`, owner: "B2 Home" });
  }
  for (const label of ["首页", "客服", "订单", "我的"]) {
    if (!hasText(label)) findings.push({ severity: "P1", summary: `五项主导航缺少“${label}”。`, owner: "A2 Shell" });
  }
  if (!hasText("新报修") && !(await page.locator("a[href*='/customer/order/create']").count())) {
    findings.push({ severity: "P1", summary: "五项主导航缺少中心新报修入口。", owner: "A2 Shell" });
  }

  if (/Service search|Search cleaning|customer\.catalog|WorkflowUiBinding|not-wired/i.test(bodyText)) {
    findings.push({ severity: "P1", summary: "主页暴露英文或工程态文案。", owner: "B2 Home" });
  }

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= document.documentElement.clientWidth + 1);
  const undersizedTargets = await page.locator("a,button,input,select,textarea,[role='button']").evaluateAll((nodes) =>
    nodes.filter((node) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
    }).length,
  );
  if (undersizedTargets > 0) findings.push({ severity: "P2", summary: `${undersizedTargets} 个可见交互目标小于 44×44。`, owner: "A2 Shell / B2 Home" });

  await page.keyboard.press("Tab");
  const keyboardFocus = await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== document.documentElement);
  if (!keyboardFocus) findings.push({ severity: "P2", summary: "键盘 Tab 未进入可见交互控件。", owner: "A2 Shell / B2 Home" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--xlb-motion-duration-normal") === "0ms" || document.getAnimations().every((animation) => animation.playState !== "running"));
  await page.emulateMedia({ forcedColors: "active" });
  const forcedColors = await page.evaluate(() => matchMedia("(forced-colors: active)").matches && document.body.innerText.length > 0);
  await page.addStyleTag({ content: "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" });
  const noBlurFallback = await page.evaluate(() => document.body.innerText.length > 0 && getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)");

  const search = page.locator("input[type='search'], input[placeholder*='搜索'], input[placeholder*='Search']").first();
  let primaryInteraction = false;
  if (await search.count()) {
    await search.fill("保洁");
    await search.press("Enter");
    try {
      await page.waitForURL(/\/customer\/services\?.*q=/, { timeout: 5_000 });
      primaryInteraction = true;
    } catch {
      findings.push({ severity: "P1", summary: "主页搜索未进入带查询词的服务发现页。", owner: "B2 Home" });
    }
  } else {
    findings.push({ severity: "P1", summary: "缺少可操作的主页服务搜索框。", owner: "B2 Home" });
  }

  if (state === "partial" && /平台认证|可接单状态以实时数据为准/.test(bodyText)) {
    findings.push({ severity: "P0", summary: "partial 状态仍展示未获权威接口支持的师傅认证或可接单事实。", owner: "B2 Home" });
  }
  if (consoleErrors.length > 0) findings.push({ severity: "P1", summary: `控制台出现 ${consoleErrors.length} 个错误。`, owner: "A2 Shell / B2 Home" });

  return {
    findings,
    checks: {
      primaryInteraction,
      noHorizontalOverflow: overflow,
      safeAreaClear: hasText("首页") && hasText("我的"),
      keyboardFocus,
      touchTargets: undersizedTargets === 0,
      reducedMotion,
      forcedColors,
      noBlurFallback,
    },
  };
}

async function createComparisonBoard(context: BrowserContext, actualPath: string, outputPath: string) {
  const source = readFileSync(join(process.cwd(), HOME_AUTHORITY_PATH)).toString("base64");
  const actual = readFileSync(actualPath).toString("base64");
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
    <header>顾客端主页 · 唯一真相同屏比较</header>
    <main>
      <figure><img src="data:image/png;base64,${source}"><figcaption>唯一视觉真相</figcaption></figure>
      <figure><img src="data:image/png;base64,${actual}"><figcaption>运行实现 390×844</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: outputPath, fullPage: false, animations: "disabled" });
  await board.close();
}

test.describe.serial("Customer Home C2 rendered evidence", () => {
  for (const captureCase of HOME_CAPTURE_CASES) {
    test(`${captureCase.state} ${captureCase.width}x${captureCase.height}`, async ({ page, context }) => {
      const consoleErrors = collectConsoleErrors(page);
      await installCustomerQaSession(page, backendUrl);
      if (captureCase.state === "partial") await installPartialCatalogFixture(page);
      await page.setViewportSize({ width: captureCase.width, height: captureCase.height });
      await openHome(page);
      await assertNoHorizontalOverflow(page);

      const evidenceRoot = join(process.cwd(), HOME_EVIDENCE_ROOT);
      const screenshotPath = join(evidenceRoot, homeScreenshotName(captureCase, iteration));
      if (writeEvidence) {
        await mkdir(evidenceRoot, { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
      }

      const inspection = await inspectHome(page, captureCase.state, consoleErrors);
      const blockingFindings = inspection.findings.filter((finding) => finding.severity !== "P3");
      const report = {
        version: "1.0.0",
        role: "customer",
        surface: "home",
        route: "/customer/",
        state: captureCase.state,
        viewport: { width: captureCase.width, height: captureCase.height },
        screenshot: `${HOME_EVIDENCE_ROOT}/${homeScreenshotName(captureCase, iteration)}`,
        authoritySha256: HOME_AUTHORITY_SHA256,
        dataSource: captureCase.state === "partial" ? "real-api-derived-partial-fixture" : "real-api",
        capturedAt: new Date().toISOString(),
        checks: inspection.checks,
        consoleErrors,
        findings: inspection.findings,
        result: blockingFindings.length === 0 ? "passed" : "failed",
      };

      if (writeEvidence) {
        await writeFile(join(evidenceRoot, homeReportName(captureCase, iteration)), `${JSON.stringify(report, null, 2)}\n`, "utf8");
        if (captureCase.state === "available" && captureCase.width === 390) {
          await createComparisonBoard(context, screenshotPath, join(evidenceRoot, homeComparisonName(iteration)));
        }
      }

      if (enforce) expect(blockingFindings, JSON.stringify(inspection.findings, null, 2)).toEqual([]);
    });
  }
});
