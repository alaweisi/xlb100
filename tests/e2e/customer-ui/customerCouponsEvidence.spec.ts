import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const availableEvidence = `${evidenceRoot}/customer-coupons-available-390x844-01.png`;
const staleEvidence = `${evidenceRoot}/customer-coupons-stale-390x844-01.png`;
const comparisonEvidence = `${evidenceRoot}/customer-coupons-comparison-390x844-01.png`;

const availableGrant = {
  couponGrantId: "grant-customer-c3-evidence",
  couponDefinitionId: "definition-c3-evidence",
  marketingCampaignId: "campaign-c3-evidence",
  ruleRevisionId: "revision-c3-evidence",
  cityCode: "hangzhou",
  customerId: "customer-c3-evidence",
  status: "available",
  issuanceReason: "admin_manual",
  issuanceRef: "approval-c3-evidence",
  availableAt: "2026-07-22T08:00:00.000Z",
  expiresAt: "2099-08-22T08:00:00.000Z",
  version: 1,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

async function installFixture(page: Page, grant = availableGrant) {
  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-c3-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-c3-evidence");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, catalog: { cityCode: "hangzhou", categories: [] } }),
  }));
  await page.route("**/api/customer/marketing/coupon-grants*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, couponGrants: [grant] }),
  }));
}

async function openCoupons(page: Page) {
  await page.goto("/customer/coupons?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "我的优惠券" })).toBeVisible();
  await expect(page.locator(".customer-coupons__card")).toBeVisible();
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
      <figure><img src="data:image/png;base64,${actual}"><figcaption>C3 优惠券 · 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test.describe.serial("Customer C3 coupon rendered evidence", () => {
  test("available state inherits the customer visual language and keeps the quote boundary", async ({ page, context }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installFixture(page);
    await openCoupons(page);

    await expect(page.getByText("价格透明")).toBeVisible();
    await expect(page.getByText("现在可用于服务报价")).toBeVisible();
    await expect(page.getByText("可带入下单页，由服务端核算最终优惠。")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/coupon API|discountAmountMinor|faceValueMinor/i);

    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await assertNoHorizontalOverflow(page);
      const undersized = await page.locator(".customer-coupons a, .customer-coupons button, .customer-coupons [role='tab']").evaluateAll((nodes) =>
        nodes.filter((node) => {
          const rect = (node as HTMLElement).getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
            && (rect.width < 44 || rect.height < 44);
        }).length,
      );
      expect(undersized, `${viewport.width}px has undersized targets`).toBe(0);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const quoteButton = page.getByRole("button", { name: "用于下单报价" });
    await quoteButton.focus();
    await expect(quoteButton).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.getByRole("heading", { name: "我的优惠券" })).toBeVisible();
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    await quoteButton.evaluate((element) => (element as HTMLElement).blur());

    const actualPath = await saveScreenshot(page, availableEvidence);
    await createComparisonBoard(context, actualPath);
    expect(consoleErrors).toEqual([]);

    await quoteButton.click();
    await expect(page).toHaveURL(/\/customer\/order\/create\?couponGrantId=grant-customer-c3-evidence/);
  });

  test("stale state is explicit and cannot be selected", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installFixture(page, { ...availableGrant, expiresAt: "2000-01-01T00:00:00.000Z" });
    await openCoupons(page);

    const card = page.locator("[data-coupon-stale='true']");
    await expect(card).toBeVisible();
    await expect(card).toContainText("已过期");
    await expect(card).toContainText("有效期已结束");
    await expect(card).toContainText("当前不可用于报价");
    await expect(page.getByRole("button", { name: "用于下单报价" })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, staleEvidence);
    expect(consoleErrors).toEqual([]);
  });
});
