import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const readyEvidence = `${evidenceRoot}/customer-profile-ready-390x844-b5-01.png`;
const addressesEvidence = `${evidenceRoot}/customer-profile-addresses-390x844-b5-01.png`;
const editorEvidence = `${evidenceRoot}/customer-profile-address-editor-390x844-b5-01.png`;
const comparisonEvidence = `${evidenceRoot}/customer-profile-home-comparison-390x844-b5-01.png`;
const reportEvidence = `${evidenceRoot}/customer-profile-390x844-b5-01.report.json`;

const profile = {
  customerId: "customer-b5-evidence",
  phoneMasked: "138****0001",
  name: "林女士",
  avatarUrl: null,
  defaultCityCode: "hangzhou",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

const address = {
  addressId: "address-b5-evidence",
  customerId: profile.customerId,
  cityCode: "hangzhou",
  contactName: "林女士",
  contactPhoneMasked: "138****0001",
  province: "浙江省",
  city: "杭州市",
  district: "西湖区",
  detailAddress: "文三路 1 号 2 幢 301",
  isDefault: true,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
};

async function installFixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-b5-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-b5-evidence");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, catalog: { cityCode: "hangzhou", categories: [] } }),
  }));
  await page.route("**/api/customer/profile", async (route) => {
    const request = route.request();
    const nextProfile = request.method() === "POST"
      ? { ...profile, name: String(request.postDataJSON()?.name ?? profile.name) }
      : profile;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: true, profile: nextProfile }),
    });
  });
  await page.route("**/api/customer/addresses", async (route) => {
    const request = route.request();
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: request.method() === "GET"
        ? JSON.stringify({ ok: true, addresses: [address] })
        : JSON.stringify({ ok: true, address }),
    });
  });
  await page.route("**/api/customer/addresses/*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, address }),
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
      <figure><img src="data:image/png;base64,${actual}"><figcaption>B5 我的与地址 · 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test("B5 profile and address inherits the customer truth and covers its production states", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  await installFixture(page);
  await page.goto("/customer/profile?cityCode=hangzhou");

  await expect(page.getByRole("heading", { level: 1, name: "我的" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "个人资料" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "服务地址" })).toBeVisible();
  await expect(page.getByText("文三路 1 号 2 幢 301", { exact: false })).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/mock|fixture|customerId|addressId|idempotencyKey/i);

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    const undersized = await page.locator(".customer-profile button, .customer-profile a, .customer-profile input:not([type='checkbox']), .customer-profile select").evaluateAll((nodes) =>
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
  const editButton = page.getByRole("button", { name: "编辑 林女士 的地址" });
  await editButton.focus();
  await expect(editButton).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("heading", { name: "服务地址" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await page.evaluate(() => window.scrollTo({ top: 0 }));

  const readyPath = await saveScreenshot(page, readyEvidence);
  await createComparisonBoard(context, readyPath);
  await page.getByRole("heading", { name: "服务地址" }).scrollIntoViewIfNeeded();
  await saveScreenshot(page, addressesEvidence);
  await editButton.click();
  const editor = page.getByRole("dialog", { name: "编辑服务地址" });
  await expect(editor).toBeVisible();
  await expect(editor.getByText("为保护隐私，编辑地址时需重新输入手机号。")).toBeVisible();
  await saveScreenshot(page, editorEvidence);
  expect(consoleErrors).toEqual([]);

  const report = {
    version: "1.0.0",
    role: "customer",
    surface: "profile-and-address",
    route: "/customer/profile",
    viewport: { width: 390, height: 844 },
    dataSource: "contract-faithful-api-fixture",
    authority: "docs/design/ui/references/customer-home-visual-truth.png",
    states: ["ready", "address-list", "address-editor", "protected-phone-reentry"],
    checks: {
      realCustomerRoute: true,
      oneCustomerShell: true,
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
