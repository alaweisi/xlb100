import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { DashboardRealtimeSnapshot } from "@xlb/types";

const oaArtifact = (name: string) => path.resolve(process.cwd(), "apps/oa/artifacts", name);
const dashboardArtifact = (name: string) => path.resolve(process.cwd(), "apps/dashboard/artifacts", name);

async function assertViewport(page: Page) {
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(layout.viewportWidth).toBe(1440);
  expect(layout.viewportHeight).toBe(1024);
  expect(layout.width).toBeLessThanOrEqual(1440);
}

function dashboardSnapshot(observedAt = new Date().toISOString()): DashboardRealtimeSnapshot {
  const now = Date.parse(observedAt);
  return {
    contractVersion: "1",
    scope: { kind: "all", label: "全国" },
    generatedAt: observedAt,
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
    pulse: Array.from({ length: 12 }, (_, index) => ({
      bucketStart: new Date(now - (11 - index) * 300_000).toISOString(),
      ordersCreated: 12 + index * 3,
      paymentsPaid: 10 + index * 3,
      fulfillmentsCompleted: 6 + index * 2,
    })),
    fulfillment: {
      pendingDispatch: 37,
      pendingAcceptance: 18,
      serviceActive: 214,
      completedToday: 906,
      longestPendingSeconds: 4_320,
    },
    aftersale: { untriaged: 8, active: 26, urgentOrCritical: 3, pendingRepair: 12 },
    support: {
      queueingConversations: 14,
      onlineAgents: 42,
      oldestWaitSeconds: 286,
      resolvedToday: 388,
      slaBreached: 2,
    },
    attention: [
      { id: "aftersale", severity: "critical", title: "紧急投诉待处置", cityLabel: "杭州", count: 3, ageSeconds: 1560, detail: "紧急投诉仍处于未关闭状态", owner: "售后运营" },
      { id: "support", severity: "critical", title: "客服 SLA 已超时", cityLabel: "上海", count: 2, ageSeconds: 286, detail: "存在首响或解决时限已超时的工单", owner: "客服中心" },
      { id: "dispatch", severity: "warning", title: "派单等待超过 60 分钟", cityLabel: "苏州", count: 37, ageSeconds: 4320, detail: "待派或重派任务需要关注", owner: "调度中心" },
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

test("OA workbench, organization, capability and Admin handoff are healthy at 1440x1024", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("http://127.0.0.1:5276/oa/");
  await page.getByLabel("账号").fill("admin_global");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/本地调试码已自动填入/u)).toBeVisible();
  const workbenchLoaded = page.waitForResponse((response) =>
    response.url().includes("/api/oa/workbench") && response.status() === 200,
  );
  await page.getByRole("button", { name: "进入运营中枢" }).click();
  await workbenchLoaded;
  await expect(page.getByRole("heading", { name: "运营工作台" })).toBeVisible();
  await expect(page.getByText("待办队列")).toBeVisible();
  await expect.poll(() => page.locator(".oa-scope-select option").count()).toBeGreaterThan(1);
  await page.screenshot({ path: oaArtifact("01-oa-workbench-1440x1024.png"), fullPage: false });
  await assertViewport(page);

  await page.getByRole("button", { name: "组织与权限" }).click();
  await expect(page.getByRole("heading", { name: "组织与权限", level: 2 })).toBeVisible();
  await expect(page.getByText("总部超级管理员").first()).toBeVisible();
  await page.screenshot({ path: oaArtifact("02-oa-organization-1440x1024.png"), fullPage: false });
  await assertViewport(page);

  await page.getByRole("button", { name: "管理能力" }).click();
  await expect(page.getByRole("heading", { name: "统一管理能力" })).toBeVisible();
  await page.screenshot({ path: oaArtifact("03-oa-capabilities-1440x1024.png"), fullPage: false });
  await assertViewport(page);

  await page.locator(".oa-scope-select select").selectOption("hangzhou");
  await page.getByRole("link", { name: /订单与履约/u }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5275\/admin\/#\/platform-operations\?.*identity=oa/u);
  await expect(page.getByText("OA delegated")).toBeVisible();
  await expect(page.getByText("Verifying OA capability")).toHaveCount(0);
  await expect(page.getByText("Platform Operations", { exact: true })).toHaveCount(2);
  await expect(page.getByText("OA capability denied")).toHaveCount(0);
  await page.screenshot({ path: oaArtifact("04-oa-admin-handoff-1440x1024.png"), fullPage: false });
  await assertViewport(page);

  const dispatchLoaded = page.waitForResponse((response) =>
    response.url().includes("/api/oa/domains/api/internal/dispatch/board")
      && response.status() === 200,
  );
  await page.getByRole("link", { name: "Dispatch" }).click();
  await dispatchLoaded;
  await expect(page.getByText("LBS-lite Dispatch Board")).toBeVisible();
  await expect(page.getByText("OA delegated")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("Dashboard wallboard remains readable and privacy-labelled at 1440x1024", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("xlb.dashboard.session", JSON.stringify({
      ok: true,
      token: "visual-qa-token",
      userId: "admin-global",
      role: "operator",
      username: "admin_global",
    }));
  });
  await page.route("**/api/dashboard/realtime**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, snapshot: dashboardSnapshot() }),
    }),
  );
  await page.goto("http://127.0.0.1:5177/dashboard/");
  await expect(page.getByRole("heading", { name: "喜乐帮 · 全国实时运营态势" })).toBeVisible();
  await expect(page.getByText("无个人敏感信息")).toBeVisible();
  await page.screenshot({ path: dashboardArtifact("dashboard-wallboard-1440x1024.png"), fullPage: false });
  await assertViewport(page);
  expect(browserErrors).toEqual([]);
});
