import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const readyEvidence = `${evidenceRoot}/customer-aftersale-ready-390x844-b4-01.png`;
const decisionEvidence = `${evidenceRoot}/customer-aftersale-decision-390x844-b4-01.png`;
const comparisonEvidence = `${evidenceRoot}/customer-aftersale-home-comparison-390x844-b4-01.png`;
const reportEvidence = `${evidenceRoot}/customer-aftersale-390x844-b4-01.report.json`;
const now = "2026-07-22T08:00:00.000Z";

const reverseRequest = {
  reverseRequestId: "reverse-b4-01", cityCode: "hangzhou", orderId: "order-b4-01", customerId: "customer-b4",
  reverseType: "reschedule", status: "requested", reason: "临时有事，需要调整上门时间",
  requestedScheduledAt: "2026-07-25T01:00:00.000Z", requestedTimeSlot: "morning",
  idempotencyKey: "reverse-key-b4", reviewNote: null, reviewedByAdminId: null, reviewedAt: null,
  appliedAt: null, createdAt: now, updatedAt: now,
};

const complaint = {
  complaintId: "complaint-b4-01", cityCode: "hangzhou", orderId: "order-b4-01", customerId: "customer-b4",
  category: "service_quality", priority: "normal", description: "清洁结果与约定标准不一致", status: "in_progress",
  idempotencyKey: "complaint-key-b4", assignedAdminId: null, resolutionType: null, resolutionNote: null,
  submittedAt: now, resolvedAt: null, closedAt: null, updatedAt: now,
};

const aggregate = {
  fulfillmentId: "fulfillment-b4-01", orderId: "order-b4-01", cityCode: "hangzhou", fulfillmentStatus: "completed",
  evidence: [{
    evidenceId: "evidence-b4-01", cityCode: "hangzhou", fulfillmentId: "fulfillment-b4-01", orderId: "order-b4-01",
    complaintId: null, mediaAssetId: "media-b4-01", evidenceType: "completion", note: null, capturedAt: now,
    createdByWorkerId: "worker-b4", createdAt: now,
    mediaAsset: {
      mediaAssetId: "media-b4-01", cityCode: "hangzhou", orderId: "order-b4-01", fulfillmentId: "fulfillment-b4-01",
      complaintId: null, uploadedByType: "worker", uploadedById: "worker-b4", originalFileName: "完工现场.webp",
      contentType: "image/webp", sizeBytes: 2048, checksumSha256: "a".repeat(64), signatureValidated: true,
      securityScanStatus: "not_malware_scanned_local", createdAt: now,
      storage: {
        provider: "local", providerName: "xlb-local-filesystem", providerStatus: "stored_local",
        externalProviderExecuted: false, objectKey: "b4/evidence.webp", storageUri: "local://b4/evidence.webp",
        publicUrl: null, checksumSha256: "a".repeat(64), sizeBytes: 2048, contentType: "image/webp", storedAt: now,
      },
    },
  }],
  confirmation: {
    confirmationId: "confirmation-b4-01", cityCode: "hangzhou", fulfillmentId: "fulfillment-b4-01",
    orderId: "order-b4-01", customerId: "customer-b4", status: "pending", complaintId: null,
    customerNote: null, evidenceSnapshot: [], confirmedAt: null, disputedAt: null, createdAt: now, updatedAt: now,
  },
};

async function installFixture(page: Page) {
  let confirmationStatus = "pending";
  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-b4-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-b4");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
    localStorage.setItem("xlb.customer.orderIds", JSON.stringify(["order-b4-01"]));
  });
  await page.route("**/api/catalog", (route) => route.fulfill({
    status: 200, contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, catalog: { cityCode: "hangzhou", categories: [] } }),
  }));
  await page.route("**/api/orders/order-b4-01/reverse-requests", (route) => route.fulfill({
    status: 200, contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, reverseRequests: [reverseRequest] }),
  }));
  await page.route("**/api/aftersale/complaints?orderId=order-b4-01", (route) => route.fulfill({
    status: 200, contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true, complaints: [complaint] }),
  }));
  await page.route("**/api/customer/orders/order-b4-01/fulfillment-evidence", (route) => route.fulfill({
    status: 200, contentType: "application/json; charset=utf-8",
    body: JSON.stringify({
      ok: true,
      aggregates: [{ ...aggregate, confirmation: { ...aggregate.confirmation, status: confirmationStatus } }],
    }),
  }));
  await page.route("**/api/customer/fulfillments/fulfillment-b4-01/customer-confirmation", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    expect(payload).toEqual({ decision: "confirmed" });
    confirmationStatus = "confirmed";
    await route.fulfill({
      status: 200, contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: true, confirmation: { ...aggregate.confirmation, status: "confirmed", confirmedAt: now } }),
    });
  });
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
      <figure><img src="data:image/png;base64,${actual}"><figcaption>B4 售后 · 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test("B4 aftersale preserves Phase17 decisions and inherits the customer visual truth", async ({ page, context }) => {
  const consoleErrors = collectConsoleErrors(page);
  await installFixture(page);
  await page.goto("/customer/aftersale?orderId=order-b4-01");

  await expect(page.getByRole("heading", { name: "售后服务" })).toBeVisible();
  await expect(page.getByText("待平台审核")).toBeVisible();
  await expect(page.getByText("处理中")).toBeVisible();
  await expect(page.locator(".customer-app-root")).toHaveCount(1);
  await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);

  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    const undersized = await page.locator(".customer-aftersale button, .customer-aftersale input, .customer-aftersale select, .customer-aftersale textarea, .customer-aftersale a").evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(node);
        const isUndersized = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.width < 44 || rect.height < 44);
        return isUndersized ? [{ tag: node.tagName, text: node.textContent?.trim(), width: Math.round(rect.width), height: Math.round(rect.height) }] : [];
      }),
    );
    expect(undersized, `${viewport.width}px has undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const refreshButton = page.getByRole("button", { name: "刷新售后进展" });
  await refreshButton.focus();
  await expect(refreshButton).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("heading", { name: "售后服务" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  await refreshButton.evaluate((element) => (element as HTMLElement).blur());

  const readyPath = await saveScreenshot(page, readyEvidence);
  await createComparisonBoard(context, readyPath);

  await page.locator("#aftersale-evidence").scrollIntoViewIfNeeded();
  await expect(page.getByText("等待你确认")).toBeVisible();
  await expect(page.getByText("履约图片由平台私密保存，仅用于当前订单确认与售后处理。")).toBeVisible();
  await expect(page.getByText(/local|mock|providerStatus|Service Evidence/i)).toHaveCount(0);
  await page.getByRole("button", { name: "确认服务完成" }).click();
  await expect(page.getByText("完工结果已确认", { exact: true })).toBeVisible();
  await expect(page.getByText("服务记录号：fulfillment-b4-01")).toBeVisible();
  await saveScreenshot(page, decisionEvidence);
  expect(consoleErrors).toEqual([]);

  const report = {
    version: "1.0.0", role: "customer", surface: "aftersale", route: "/customer/aftersale?orderId=order-b4-01",
    viewport: { width: 390, height: 844 }, dataSource: "contract-faithful-api-fixture",
    authority: "docs/design/ui/references/customer-home-visual-truth.png",
    states: ["loaded-records", "pending-confirmation", "server-confirmed-decision"],
    checks: {
      singleCustomerShell: true, phase17StatusSemantics: true, serverConfirmedDecision: true,
      noImplementationLeakage: true, noHorizontalOverflow: true, touchTargets: true,
      keyboardFocus: true, reducedMotion: true, forcedColors: true, consoleClean: true,
    },
    result: "passed",
  };
  await writeFile(join(process.cwd(), reportEvidence), `${JSON.stringify(report, null, 2)}\n`, "utf8");
});
