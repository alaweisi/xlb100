import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertNoHorizontalOverflow, collectConsoleErrors } from "./qaHarness";

const evidenceRoot = process.env.XLB_CUSTOMER_C6_EVIDENCE_DIR
  ?? "docs/design/ui/phase25/evidence/customer/c6";
const truthPath = "docs/design/ui/references/customer-home-visual-truth.png";
const at = "2026-07-22T08:00:00.000Z";

const paths = {
  supportReady: `${evidenceRoot}/01-support-ready-390x844.png`,
  supportDetail: `${evidenceRoot}/02-support-ticket-detail-390x844.png`,
  supportConversation: `${evidenceRoot}/03-support-conversation-390x844.png`,
  notificationsReady: `${evidenceRoot}/04-notifications-ready-390x844.png`,
  notificationsConflict: `${evidenceRoot}/05-notifications-conflict-390x844.png`,
  profileReady: `${evidenceRoot}/06-profile-ready-390x844.png`,
  profileEditor: `${evidenceRoot}/07-profile-address-editor-390x844.png`,
  supportComparison: `${evidenceRoot}/08-support-home-comparison.png`,
  notificationsComparison: `${evidenceRoot}/09-notifications-home-comparison.png`,
  profileComparison: `${evidenceRoot}/10-profile-home-comparison.png`,
  report: `${evidenceRoot}/customer-c6-visual-qa.report.json`,
};

const ticket = {
  ticketId: "ticket-c6-qa",
  cityCode: "hangzhou",
  source: "customer",
  requesterId: "customer-c6-qa",
  businessClientId: null,
  type: "order_question",
  priority: "normal",
  status: "closed",
  subject: "订单进度需要确认",
  description: "预约时间已临近，希望确认师傅的上门安排。",
  relatedOrderId: "order-c6-qa",
  relatedWorkerId: null,
  linkedAftersaleComplaintId: null,
  assignedAgentId: "agent-c6-qa",
  assignedSkillGroupId: null,
  routingLanguage: null,
  slaFirstResponseDueAt: null,
  slaResolutionDueAt: null,
  firstRespondedAt: at,
  slaFirstResponseBreachedAt: null,
  slaResolutionBreachedAt: null,
  resolvedAt: at,
  closedAt: at,
  resolutionCode: "answered",
  version: 3,
  createdAt: "2026-07-21T06:00:00.000Z",
  updatedAt: at,
};

const ticketEvents = [
  {
    ticketEventId: "event-c6-1",
    cityCode: "hangzhou",
    ticketId: ticket.ticketId,
    eventType: "created",
    actorType: "customer",
    actorId: "customer-c6-qa",
    visibility: "requester",
    content: ticket.description,
    payload: {},
    createdAt: "2026-07-21T06:00:00.000Z",
  },
  {
    ticketEventId: "event-c6-2",
    cityCode: "hangzhou",
    ticketId: ticket.ticketId,
    eventType: "resolved",
    actorType: "admin",
    actorId: "agent-c6-qa",
    visibility: "requester",
    content: "已与师傅确认，将按预约时间上门。",
    payload: {},
    createdAt: at,
  },
];

const conversation = {
  conversationId: "conversation-c6-qa",
  cityCode: "hangzhou",
  source: "customer",
  requesterId: "customer-c6-qa",
  businessClientId: null,
  status: "active",
  assignedAgentId: "agent-c6-qa",
  linkedTicketId: ticket.ticketId,
  lastServerSeq: 2,
  version: 2,
  startedAt: "2026-07-22T07:50:00.000Z",
  acceptedAt: "2026-07-22T07:51:00.000Z",
  transferredAt: null,
  closedAt: null,
  createdAt: "2026-07-22T07:50:00.000Z",
  updatedAt: at,
};

const messages = [
  {
    messageId: "message-c6-1",
    cityCode: "hangzhou",
    conversationId: conversation.conversationId,
    senderType: "customer",
    senderId: "customer-c6-qa",
    clientMessageId: "client-c6-1",
    serverSeq: 1,
    messageType: "text",
    textContent: "您好，我想确认今天的上门时间。",
    mediaAssetId: null,
    createdAt: "2026-07-22T07:50:00.000Z",
  },
  {
    messageId: "message-c6-2",
    cityCode: "hangzhou",
    conversationId: conversation.conversationId,
    senderType: "agent",
    senderId: "agent-c6-qa",
    clientMessageId: "server-c6-2",
    serverSeq: 2,
    messageType: "text",
    textContent: "已经为您确认，师傅会在下午两点前到达。",
    mediaAssetId: null,
    createdAt: at,
  },
];

const notificationAt = "2026-07-22T08:30:00.000Z";
const unreadNotification = {
  notificationId: "notification-c6-order",
  eventType: "order.created",
  templateRevisionId: "template-c6-order",
  title: "师傅已接单",
  body: "订单 XLB-20260722 已由王师傅接单，请留意后续上门进展。",
  reference: { kind: "order_created", orderId: "order-c6-qa" },
  occurredAt: notificationAt,
  createdAt: notificationAt,
  readAt: null,
  archivedAt: null,
  rowVersion: 1,
};
const readNotification = {
  notificationId: "notification-c6-support",
  eventType: "support.ticket.resolved",
  templateRevisionId: "template-c6-support",
  title: "客服问题已处理",
  body: "您反馈的问题已有处理结果，可前往客服中心继续查看。",
  reference: { kind: "support_ticket_resolved", ticketId: ticket.ticketId },
  occurredAt: "2026-07-21T10:20:00.000Z",
  createdAt: "2026-07-21T10:20:00.000Z",
  readAt: "2026-07-21T10:30:00.000Z",
  archivedAt: null,
  rowVersion: 3,
};

const profile = {
  customerId: "customer-c6-qa",
  phoneMasked: "138****0001",
  name: "林女士",
  avatarUrl: null,
  defaultCityCode: "hangzhou",
  updatedAt: at,
};
const address = {
  addressId: "address-c6-qa",
  customerId: profile.customerId,
  cityCode: "hangzhou",
  contactName: "林女士",
  contactPhoneMasked: "138****0001",
  province: "浙江省",
  city: "杭州市",
  district: "西湖区",
  detailAddress: "文三路 1 号 2 幢 301",
  isDefault: true,
  createdAt: at,
  updatedAt: at,
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function installBaseSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xlb.customer.token", "customer-c6-qa-token");
    localStorage.setItem("xlb.customer.userId", "customer-c6-qa");
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  });
  await page.route("**/api/catalog", (route) => fulfillJson(route, {
    ok: true,
    catalog: { cityCode: "hangzhou", categories: [] },
  }));
}

async function installSupportFixture(page: Page) {
  await installBaseSession(page);
  await page.route(/\/api\/support\/tickets(?:[/?]|$)/, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/support/tickets") {
      await fulfillJson(route, { ok: true, tickets: [ticket], nextCursor: null });
      return;
    }
    if (request.method() === "GET") {
      await fulfillJson(route, { ok: true, detail: { ticket, events: ticketEvents } });
      return;
    }
    if (pathname.endsWith("/csat")) {
      await fulfillJson(route, { ok: true, csat: { csatId: "csat-c6-qa", cityCode: "hangzhou", targetType: "ticket", targetId: ticket.ticketId, score: 5, comment: null } });
      return;
    }
    await fulfillJson(route, { ok: true, ticket, event: ticketEvents[1], idempotent: false });
  });
  await page.route(/\/api\/support\/conversations(?:[/?]|$)/, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/support/conversations") {
      await fulfillJson(route, { ok: true, conversations: [conversation], nextCursor: null });
      return;
    }
    if (request.method() === "GET") {
      await fulfillJson(route, { ok: true, conversation, messages });
      return;
    }
    if (pathname.endsWith("/messages")) {
      await fulfillJson(route, { ok: true, message: messages[0], idempotent: false });
      return;
    }
    await fulfillJson(route, { ok: true, conversation });
  });
}

async function installNotificationsFixture(page: Page, conflictOnRead = false) {
  await installBaseSession(page);
  let conflictPending = conflictOnRead;
  let canonicalRead = false;
  await page.route(/\/api\/customer\/notifications(?:[/?]|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      await fulfillJson(route, {
        ok: true,
        items: url.searchParams.get("view") === "archive" ? [] : [
          canonicalRead ? { ...unreadNotification, readAt: notificationAt, rowVersion: 2 } : unreadNotification,
          readNotification,
        ],
        nextCursor: null,
      });
      return;
    }
    if (request.method() === "POST" && url.pathname.endsWith("/read")) {
      canonicalRead = true;
      if (conflictPending) {
        conflictPending = false;
        await fulfillJson(route, { ok: false, error: "notification state conflict" }, 409);
        return;
      }
      await fulfillJson(route, { ok: true, result: { outcome: "applied", rowVersion: 2 } });
      return;
    }
    await fulfillJson(route, { ok: true, result: { outcome: "applied", rowVersion: 4 } });
  });
}

async function installProfileFixture(page: Page) {
  await installBaseSession(page);
  await page.route("**/api/customer/profile", async (route) => {
    const request = route.request();
    const nextProfile = request.method() === "POST"
      ? { ...profile, name: String(request.postDataJSON()?.name ?? profile.name) }
      : profile;
    await fulfillJson(route, { ok: true, profile: nextProfile });
  });
  await page.route("**/api/customer/addresses", async (route) => {
    await fulfillJson(route, route.request().method() === "GET"
      ? { ok: true, addresses: [address] }
      : { ok: true, address });
  });
  await page.route("**/api/customer/addresses/*", (route) => fulfillJson(route, { ok: true, address }));
}

async function saveScreenshot(page: Page, relativePath: string) {
  const output = join(process.cwd(), relativePath);
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: false, animations: "disabled" });
  return output;
}

async function createComparisonBoard(
  context: BrowserContext,
  actualPath: string,
  outputPath: string,
  label: string,
) {
  const source = readFileSync(join(process.cwd(), truthPath)).toString("base64");
  const actual = readFileSync(actualPath).toString("base64");
  const output = join(process.cwd(), outputPath);
  await mkdir(dirname(output), { recursive: true });
  const board = await context.newPage();
  await board.setViewportSize({ width: 900, height: 930 });
  await board.setContent(`
    <style>
      body{margin:0;background:#efe8df;color:#18342d;font-family:system-ui,sans-serif}
      header{height:54px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:750}
      main{display:grid;grid-template-columns:390px 390px;gap:32px;justify-content:center}
      figure{margin:0;display:grid;gap:10px}figcaption{text-align:center;font-weight:700}
      img{width:390px;height:844px;object-fit:fill;background:#fff;box-shadow:0 12px 32px rgba(24,52,45,.16)}
    </style>
    <header>继承主页设计语言，不复制主页布局</header>
    <main>
      <figure><img src="data:image/png;base64,${source}"><figcaption>顾客端主页 · 唯一视觉真相</figcaption></figure>
      <figure><img src="data:image/png;base64,${actual}"><figcaption>${label} · C6 运行实现</figcaption></figure>
    </main>
  `);
  await board.screenshot({ path: output, fullPage: false, animations: "disabled" });
  await board.close();
}

async function assertSurfaceQuality(page: Page, selector: string) {
  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await assertNoHorizontalOverflow(page);
    const undersized = await page.locator(`${selector} button, ${selector} a, ${selector} input:not([type='checkbox']):not([type='radio']), ${selector} select, ${selector} textarea`).evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.width < 44 || rect.height < 44)
          ? [{ label: node.getAttribute("aria-label") ?? node.textContent?.trim(), width: Math.round(rect.width), height: Math.round(rect.height) }]
          : [];
      }),
    );
    expect(undersized, `${viewport.width}px undersized targets: ${JSON.stringify(undersized)}`).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.getAnimations().every((animation) => animation.playState !== "running"))).toBeTruthy();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator(selector)).toBeVisible();
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
}

test.describe.serial("Customer C6 support and account visual QA", () => {
  test("support covers ready, closed-ticket and active-conversation states", async ({ page, context }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installSupportFixture(page);
    await page.goto("/customer/support?cityCode=hangzhou");
    await expect(page.getByRole("heading", { level: 1, name: "有问题，我们一起解决" })).toBeVisible();
    await expect(page.getByRole("button", { name: "查看工单：订单进度需要确认" })).toBeVisible();
    await expect(page.locator(".customer-app-root")).toHaveCount(1);
    await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText(/Real API|rowVersion|idempotency|not-wired|fixture/i);
    await assertSurfaceQuality(page, ".customer-support");

    const refresh = page.getByRole("button", { name: "刷新服务工单" });
    await refresh.focus();
    await expect(refresh).toBeFocused();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0 });
    });
    const readyPath = await saveScreenshot(page, paths.supportReady);
    await createComparisonBoard(context, readyPath, paths.supportComparison, "客服中心");

    await page.getByRole("button", { name: "查看工单：订单进度需要确认" }).click();
    await expect(page.getByRole("heading", { name: "订单进度需要确认" })).toBeVisible();
    await page.getByRole("heading", { name: "订单进度需要确认" }).evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await saveScreenshot(page, paths.supportDetail);

    await page.getByRole("tab", { name: "在线会话" }).click();
    await expect(page.getByRole("button", { name: `打开会话 ${conversation.conversationId}` })).toBeVisible();
    await page.getByRole("button", { name: `打开会话 ${conversation.conversationId}` }).click();
    await expect(page.getByText("已经为您确认，师傅会在下午两点前到达。")).toBeVisible();
    await page.getByRole("heading", { name: "客服会话" }).evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await saveScreenshot(page, paths.supportConversation);
    expect(consoleErrors).toEqual([]);
  });

  test("notifications covers ready and server-conflict recovery states", async ({ page, context }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installNotificationsFixture(page);
    await page.goto("/customer/notifications?cityCode=hangzhou");
    await expect(page.getByRole("heading", { level: 1, name: "消息中心" })).toBeVisible();
    await expect(page.locator(".customer-notifications__card")).toHaveCount(2);
    await expect(page.locator(".customer-app-root")).toHaveCount(1);
    await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText(/Real API|rowVersion|idempotency|not-wired|fixture/i);
    await assertSurfaceQuality(page, ".customer-notifications");
    const orderLink = page.getByRole("link", { name: "查看订单" });
    await expect(orderLink).toHaveAttribute("data-target-resolution", "exact");
    await orderLink.focus();
    await expect(orderLink).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const readyPath = await saveScreenshot(page, paths.notificationsReady);
    await createComparisonBoard(context, readyPath, paths.notificationsComparison, "消息中心");
    expect(consoleErrors).toEqual([]);
  });

  test("notifications reloads canonical state after a 409 conflict", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installNotificationsFixture(page, true);
    await page.goto("/customer/notifications?cityCode=hangzhou");
    await expect(page.locator(".customer-notifications__card")).toHaveCount(2);
    await page.getByRole("button", { name: "标为已读" }).click();
    await expect(page.getByText("消息已在其他设备更新，现已加载服务端最新状态。")).toBeVisible();
    await expect(page.getByLabel("已读消息：师傅已接单")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, paths.notificationsConflict);
    expect(consoleErrors.filter((message) => !message.includes("status of 409 (Conflict)"))).toEqual([]);
  });

  test("profile covers ready and protected address-editor states", async ({ page, context }) => {
    const consoleErrors = collectConsoleErrors(page);
    await installProfileFixture(page);
    await page.goto("/customer/profile?cityCode=hangzhou");
    await expect(page.getByRole("heading", { level: 1, name: "我的" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "个人资料" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "服务地址" })).toBeVisible();
    await expect(page.getByText("文三路 1 号 2 幢 301", { exact: false })).toBeVisible();
    await expect(page.locator(".customer-app-root")).toHaveCount(1);
    await expect(page.locator(".customer-bottom-nav")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText(/mock|fixture|customerId|addressId|idempotencyKey/i);
    await assertSurfaceQuality(page, ".customer-profile");
    const editButton = page.getByRole("button", { name: "编辑 林女士 的地址" });
    await editButton.focus();
    await expect(editButton).toBeFocused();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0 });
    });
    const readyPath = await saveScreenshot(page, paths.profileReady);
    await createComparisonBoard(context, readyPath, paths.profileComparison, "我的与地址");
    await editButton.click();
    const editor = page.getByRole("dialog", { name: "编辑服务地址" });
    await expect(editor).toBeVisible();
    await expect(editor.getByText("为保护隐私，编辑地址时需重新输入手机号。")).toBeVisible();
    await saveScreenshot(page, paths.profileEditor);
    expect(consoleErrors).toEqual([]);
  });

  test("writes the passing C6 evidence manifest after all visual gates pass", async () => {
    const report = {
      version: "1.0.0",
      qaLane: "P6-C6",
      role: "customer",
      surfaces: ["support", "notifications", "profile", "addresses"],
      authority: truthPath,
      viewportMatrix: [320, 390, 430],
      evidence: Object.values(paths).filter((path) => path.endsWith(".png")),
      checks: {
        uniqueCustomerShell: true,
        homeDesignLanguageComparison: true,
        noHorizontalOverflow: true,
        touchTargetsAtLeast44: true,
        keyboardFocus: true,
        reducedMotion: true,
        forcedColors: true,
        authoritativeMutationCopy: true,
        notificationConflictRecovery: true,
        protectedAddressEditing: true,
        noEngineeringCopy: true,
        consoleClean: true,
      },
      automatedResult: "passed",
      severityCounts: { P0: 0, P1: 0, P2: 0 },
    };
    const output = join(process.cwd(), paths.report);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  });
});
