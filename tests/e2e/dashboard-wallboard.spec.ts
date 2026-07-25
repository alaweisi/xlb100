import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DashboardRealtimeSnapshot } from "@xlb/types";

const screenshotPath = path.resolve(
  process.cwd(),
  "apps/dashboard/artifacts/dashboard-wallboard-1920x1080.png",
);

function snapshot(observedAt = new Date().toISOString()): DashboardRealtimeSnapshot {
  const now = Date.parse(observedAt);
  const pulse = Array.from({ length: 12 }, (_, index) => ({
    bucketStart: new Date(now - (11 - index) * 300_000).toISOString(),
    ordersCreated: [12, 18, 16, 23, 20, 31, 28, 34, 29, 37, 40, 43][index]!,
    paymentsPaid: [10, 15, 14, 19, 17, 27, 25, 29, 26, 32, 35, 39][index]!,
    fulfillmentsCompleted: [6, 8, 9, 11, 10, 14, 13, 17, 16, 19, 22, 24][index]!,
  }));
  return {
    contractVersion: "1",
    scope: { kind: "all", label: "全国" },
    generatedAt: new Date().toISOString(),
    observedAt,
    refreshAfterSeconds: 15,
    staleAfterSeconds: 45,
    disconnectedAfterSeconds: 120,
    privacy: {
      containsPersonalData: false,
      exactWorkerLocationIncluded: false,
      messageContentIncluded: false,
    },
    headline: {
      ordersToday: 1286,
      paidAmountToday: "368420.00",
      paymentSuccessRate: 96.82,
      fulfillmentActive: 214,
      dispatchPending: 37,
      completedToday: 906,
    },
    pulse,
    fulfillment: {
      pendingDispatch: 37,
      pendingAcceptance: 18,
      serviceActive: 214,
      completedToday: 906,
      longestPendingSeconds: 4_320,
    },
    aftersale: {
      untriaged: 8,
      active: 26,
      urgentOrCritical: 3,
      pendingRepair: 12,
    },
    support: {
      queueingConversations: 14,
      onlineAgents: 42,
      oldestWaitSeconds: 286,
      resolvedToday: 388,
      slaBreached: 2,
    },
    attention: [
      {
        id: "aftersale-urgent",
        severity: "critical",
        title: "紧急投诉待处置",
        cityLabel: "杭州",
        count: 3,
        ageSeconds: 1_560,
        detail: "紧急或重大投诉仍处于未关闭状态",
        owner: "售后运营",
      },
      {
        id: "support-sla",
        severity: "critical",
        title: "客服 SLA 已超时",
        cityLabel: "上海",
        count: 2,
        ageSeconds: 286,
        detail: "存在首响或解决时限已超时的工单",
        owner: "客服中心",
      },
      {
        id: "dispatch-wait",
        severity: "warning",
        title: "派单等待超过 60 分钟",
        cityLabel: "苏州",
        count: 37,
        ageSeconds: 4_320,
        detail: "待派、重派或人工复核任务需要调度关注",
        owner: "调度中心",
      },
    ],
    cities: [
      { cityCode: "hangzhou", cityName: "杭州", ordersToday: 386, overdueCount: 4, urgentComplaintCount: 2, supportQueueCount: 3, state: "critical" },
      { cityCode: "shanghai", cityName: "上海", ordersToday: 341, overdueCount: 2, urgentComplaintCount: 1, supportQueueCount: 5, state: "critical" },
      { cityCode: "suzhou", cityName: "苏州", ordersToday: 229, overdueCount: 7, urgentComplaintCount: 0, supportQueueCount: 2, state: "warning" },
      { cityCode: "guangzhou", cityName: "广州", ordersToday: 198, overdueCount: 0, urgentComplaintCount: 0, supportQueueCount: 1, state: "healthy" },
    ],
    sources: [
      ["orders", "Orders 订单"],
      ["payments", "Payments 支付"],
      ["dispatch", "Dispatch 派单"],
      ["fulfillment", "Fulfillment 履约"],
      ["aftersale", "Aftersale 售后"],
      ["support", "Support 客服"],
    ].map(([source, label], index) => ({
      source: source as DashboardRealtimeSnapshot["sources"][number]["source"],
      label: label!,
      state: "live",
      observedAt,
      lagSeconds: index + 1,
    })),
  };
}

async function installSession(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("xlb.dashboard.session", JSON.stringify({
      ok: true,
      token: "visual-qa-token",
      userId: "admin-global",
      role: "operator",
      username: "admin_global",
    }));
  });
}

test("renders the selected nationwide realtime wallboard without browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await installSession(page);
  await page.route("**/api/dashboard/realtime**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, snapshot: snapshot() }) }),
  );

  await page.goto("http://127.0.0.1:5177/dashboard/");
  await expect(page.getByRole("heading", { name: "喜乐帮 · 全国实时运营态势" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "订单与交易脉搏" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "投诉与返修" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "即时客服" })).toBeVisible();
  await expect(page.getByText("无个人敏感信息")).toBeVisible();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }))).toEqual({
    width: 1920,
    height: 1080,
    viewportWidth: 1920,
    viewportHeight: 1080,
  });
  expect(browserErrors).toEqual([]);
});

test("labels an old snapshot as stale and retries without misrepresenting it as live", async ({ page }) => {
  await installSession(page);
  let calls = 0;
  let serveStale = true;
  await page.route("**/api/dashboard/realtime**", (route) => {
    calls += 1;
    const observedAt = serveStale
      ? new Date(Date.now() - 60_000).toISOString()
      : new Date().toISOString();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, snapshot: snapshot(observedAt) }),
    });
  });

  await page.goto("http://127.0.0.1:5177/dashboard/");
  await expect(page.getByText("数据刷新延迟")).toBeVisible();
  serveStale = false;
  await page.getByRole("button", { name: "立即重试" }).click();
  await expect(page.getByText("数据刷新延迟")).toBeHidden();
  expect(calls).toBeGreaterThanOrEqual(2);
});
