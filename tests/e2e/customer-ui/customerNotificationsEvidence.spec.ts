import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = "docs/design/ui/phase25/evidence/customer";
const readyEvidence = `${evidenceRoot}/customer-notifications-ready-390x844-a5-01.png`;
const conflictEvidence = `${evidenceRoot}/customer-notifications-conflict-390x844-a5-01.png`;
const comparisonEvidence = `${evidenceRoot}/customer-notifications-home-comparison-390x844-a5-01.png`;
const reportEvidence = `${evidenceRoot}/customer-notifications-390x844-a5-01.report.json`;

const timestamp = "2026-07-22T08:30:00.000Z";
const orderNotification = {
  notificationId: "notification-order-a5-evidence",
  eventType: "order.created",
  templateRevisionId: "template-order-a5-evidence",
  title: "师傅已接单",
  body: "订单 XLB-20260722 已由王师傅接单，请留意后续上门进展。",
  reference: { kind: "order_created", orderId: "order-a5-evidence" },
  occurredAt: timestamp,
  createdAt: timestamp,
  readAt: null,
  archivedAt: null,
  rowVersion: 1,
};
const supportNotification = {
  notificationId: "notification-support-a5-evidence",
  eventType: "support.ticket.resolved",
  templateRevisionId: "template-support-a5-evidence",
  title: "客服问题已处理",
  body: "您反馈的问题已有处理结果，可前往客服中心继续查看。",
  reference: { kind: "support_ticket_resolved", ticketId: "ticket-a5-evidence" },
  occurredAt: "2026-07-21T10:20:00.000Z",
  createdAt: "2026-07-21T10:20:00.000Z",
  readAt: "2026-07-21T10:30:00.000Z",
  archivedAt: null,
  rowVersion: 3,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function installFixture(page: Page, options: { conflictOnRead?: boolean } = {}) {
  let readConflictPending = options.conflictOnRead === true;
  let canonicalRead = false;

  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-a5-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-a5-evidence");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  await page.route("**/api/catalog", (route) => fulfillJson(route, {
    ok: true,
    catalog: { cityCode: "hangzhou", categories: [] },
  }));
  await page.route(/\/api\/customer\/notifications(?:[/?]|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      const view = url.searchParams.get("view") ?? "inbox";
      await fulfillJson(route, {
        ok: true,
        items: view === "archive"
          ? []
          : [
            canonicalRead
              ? { ...orderNotification, readAt: timestamp, rowVersion: 2 }
              : orderNotification,
            supportNotification,
          ],
        nextCursor: null,
      });
      return;
    }
    if (request.method() === "POST" && url.pathname.endsWith("/read")) {
      canonicalRead = true;
      if (readConflictPending) {
        readConflictPending = false;
        await fulfillJson(route, { ok: false, error: "notification state conflict" }, 409);
        return;
      }
      await fulfillJson(route, { ok: true, result: { outcome: "applied", rowVersion: 2 } });
      return;
    }
    await fulfillJson(route, { ok: true, result: { outcome: "applied", rowVersion: 4 } });
  });
}

async function openNotifications(page: Page) {
  await page.goto("/customer/notifications?cityCode=hangzhou");
  await expect(page.getByRole("heading", { level: 1, name: "消息中心" })).toBeVisible();
  await expect(page.locator(".customer-notifications__card")).toHaveCount(2);
}

async function saveScreenshot(page: Page, relativePath: string) {
  const output = join(process.cwd(), relativePath);
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: false, animations: "disabled" });
  return output;
}

async function createComparisonBoard(context: BrowserContext, actualPath: string) {
  const sourcePath = "docs/design/ui/phase25/evidence/customer/customer-home-available-390x844-09.png";
  const source = readFileSync(join(process.cwd(), sourcePath)).toString("base64");
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
      <figure><img src="data:image/png;base64,${actual}"><figcaption>A5 通知中心 · 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

test.describe.serial("Customer A5 notification rendered evidence", () => {
  test("ready state inherits Home language with honest target resolution", async ({ page, context }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installFixture(page);
    await openNotifications(page);

    await expect(page.locator(".customer-app-root")).toHaveCount(1);
    await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
    await expect(page.getByText("已读、归档和恢复结果均以服务端确认为准。")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Real API|rowVersion|idempotency|not-wired/i);

    const orderLink = page.getByRole("link", { name: "查看订单" });
    await expect(orderLink).toHaveAttribute("href", "/customer/orders?cityCode=hangzhou&orderId=order-a5-evidence");
    await expect(orderLink).toHaveAttribute("data-target-resolution", "exact");
    const supportLink = page.getByRole("link", { name: "前往客服" });
    await expect(supportLink).toHaveAttribute("href", "/customer/support?cityCode=hangzhou");
    await expect(supportLink).toHaveAttribute("data-target-resolution", "section");

    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport);
      await assertNoHorizontalOverflow(page);
      const undersized = await page.locator(".customer-notifications button, .customer-notifications a, .customer-notifications [role='tab']").evaluateAll((nodes) =>
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
    await orderLink.focus();
    await expect(orderLink).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.getByRole("heading", { name: "消息中心" })).toBeVisible();
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const readyPath = await saveScreenshot(page, readyEvidence);
    await createComparisonBoard(context, readyPath);
    expect(consoleErrors).toEqual([]);

    const report = {
      version: "1.0.0",
      role: "customer",
      surface: "notification-center",
      route: "/customer/notifications",
      viewport: { width: 390, height: 844 },
      dataSource: "contract-faithful-api-fixture",
      authority: "docs/design/ui/references/customer-home-visual-truth.png",
      states: ["loading", "ready-unread", "ready-read", "empty", "error-retry", "pagination-error", "busy", "conflict"],
      checks: {
        singleCustomerShell: true,
        authoritativeMutationCopy: true,
        exactOrderTarget: true,
        honestSupportSectionFallback: true,
        noHorizontalOverflow: true,
        touchTargetsAtLeast44: true,
        keyboardFocus: true,
        reducedMotion: true,
        forcedColors: true,
        noConsoleErrors: true,
      },
    };
    await writeFile(join(process.cwd(), reportEvidence), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  });

  test("409 conflict reloads canonical server state without an optimistic overwrite", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installFixture(page, { conflictOnRead: true });
    await openNotifications(page);

    await page.getByRole("button", { name: "标为已读" }).click();
    await expect(page.getByText("消息已在其他设备更新，现已加载服务端最新状态。")).toBeVisible();
    await expect(page.getByLabel("已读消息：师傅已接单")).toBeVisible();
    await expect(page.getByRole("button", { name: "标为已读" })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, conflictEvidence);
    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("status of 409 (Conflict)"));
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
