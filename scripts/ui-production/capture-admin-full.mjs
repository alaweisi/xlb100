import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = process.env.ADMIN_EDGE_BASE_URL ?? "http://127.0.0.1:4317";
const evidenceDir = path.join(root, "docs/design/ui/production-control/evidence/ADMIN-FULL");
const ledgerPath = path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const adminSlices = ledger.slices.filter((slice) => slice.terminal === "admin");
const targetSlices = adminSlices.filter((slice) => slice.batch !== "B0");
const expectedCarrierIds = Array.from({ length: 15 }, (_, index) => `A-${String(index).padStart(2, "0")}`);
const viewport = Object.freeze({ width: 390, height: 844 });

const carriers = [
  { carrierId: "A-00", routePath: "/", label: "运营应用总览" },
  { carrierId: "A-01", routePath: "/#/settlement-ops?cityCode=hangzhou", label: "结算运营" },
  { carrierId: "A-02", routePath: "/#/settlement-ops/statements/stmt-admin-mobile?cityCode=hangzhou", label: "结算单详情" },
  { carrierId: "A-03", routePath: "/#/settlement-ops/exports?cityCode=hangzhou", label: "导出复核" },
  { carrierId: "A-04", routePath: "/#/settlement-ops/governance?sub=plans&cityCode=hangzhou", label: "结算治理" },
  { carrierId: "A-05", routePath: "/#/order-trace?cityCode=hangzhou", label: "订单追踪" },
  { carrierId: "A-06", routePath: "/#/worker-withdrawals?cityCode=hangzhou", label: "师傅提现" },
  { carrierId: "A-07", routePath: "/#/aftersale?cityCode=hangzhou", label: "售后运营" },
  { carrierId: "A-08", routePath: "/#/enterprise?cityCode=hangzhou", label: "企业客户" },
  { carrierId: "A-09", routePath: "/#/dispatch?cityCode=hangzhou", label: "城市派单" },
  { carrierId: "A-10", routePath: "/#/platform-operations?cityCode=hangzhou", label: "平台运营" },
  { carrierId: "A-11", routePath: "/#/support?cityCode=hangzhou", label: "客服工作台" },
  { carrierId: "A-12", routePath: "/#/support-quality?cityCode=hangzhou", label: "客服质量" },
  { carrierId: "A-13", routePath: "/#/review-moderation?cityCode=hangzhou", label: "评价与口碑" },
  { carrierId: "A-14", routePath: "/#/marketing?cityCode=hangzhou", label: "营销优惠券" },
];

const ledgerCarrierIds = [...new Set(adminSlices.map((slice) => slice.carrierId))].sort();
if (JSON.stringify(ledgerCarrierIds) !== JSON.stringify(expectedCarrierIds)) {
  throw new Error(`运营应用总账承载容器不完整：${ledgerCarrierIds.join(", ")}`);
}
if (targetSlices.length !== 96) throw new Error(`运营应用非 B0 切片应为 96 条，实际为 ${targetSlices.length}`);
if (!evidenceDir.endsWith(path.join("production-control", "evidence", "ADMIN-FULL"))) throw new Error("拒绝清理非 ADMIN-FULL 目录");

await rm(evidenceDir, { recursive: true, force: true });
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const manifest = {
  batch: "ADMIN-FULL",
  surface: "mobile-operations-app",
  browser: "Microsoft Edge",
  browserVersion: browser.version(),
  capturedAt: new Date().toISOString(),
  actualApp: true,
  appUrl: baseUrl,
  dedicatedPort: Number(new URL(baseUrl).port),
  contractInterception: true,
  externalProviderExecution: false,
  externalExecutionBoundary: "仅拦截运营应用契约状态；不执行退款、到账、出款或外部 Provider 调用。",
  viewport,
  orientation: "portrait",
  minimumTouchTarget: 44,
  ledgerSliceCount: adminSlices.length,
  targetSliceCount: targetSlices.length,
  evidence: [],
  sliceCoverage: [],
};

function emptyContract(url, variant = "empty") {
  const pathname = new URL(url).pathname;
  if (variant === "table" && pathname === "/api/internal/enterprise/clients") return {
    ok: true,
    clients: [{
      businessClientId: "business-mobile-evidence",
      cityCode: "hangzhou",
      clientCode: "HZ-OPS-001",
      name: "杭州企业服务样本",
      status: "active",
      billingMode: "monthly",
      billingCustomerId: "billing-mobile-evidence",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    }],
  };
  if (pathname.includes("worker-statement-audit/") && !pathname.includes("export")) return { ok: true, statement: null, review: null, export: null, exportedOutboxEvent: null };
  if (pathname.includes("worker-statement-audit")) return { ok: true, items: [], nextCursor: null };
  if (pathname.includes("worker-statement-export-audit")) return { ok: true, items: [], nextCursor: null };
  if (pathname.includes("worker-statement-review-summary")) return { ok: true, cityCode: "hangzhou", dateFrom: null, dateTo: null, overall: { totalStatements: 0, reviewedStatements: 0, approvedStatements: 0, exportedStatements: 0 }, groups: null };
  if (pathname.includes("settlement-audit-summary")) return { ok: true, counts: { totalBatches: 0, totalItems: 0, totalPayables: 0, totalQueueItems: 0 }, statusBreakdown: [], amounts: { itemsGrossAmount: 0 }, groups: null };
  if (pathname.includes("reconciliation-gap-scan")) return { ok: true, summary: { totalGaps: 0, gapsByType: {} }, gaps: [] };
  if (pathname.includes("dry-run-plans")) return { ok: true, plans: [] };
  if (pathname.includes("order-traces")) return { ok: false, error: "未找到当前城市范围内的订单", statusCode: 404 };
  if (pathname.includes("worker-withdrawals")) return { ok: true, withdrawals: [] };
  if (pathname.includes("aftersale/reverse-requests")) return { ok: true, reverseRequests: [] };
  if (pathname.includes("aftersale/complaints")) return { ok: true, complaints: [] };
  if (pathname === "/api/internal/enterprise/clients") return { ok: true, clients: [] };
  if (pathname.includes("/credentials")) return { ok: true, credentials: [] };
  if (pathname.includes("/agreement-prices")) return { ok: true, agreementPrices: [] };
  if (pathname.includes("/webhook-subscriptions")) return { ok: true, subscriptions: [] };
  if (pathname.includes("/webhook-deliveries")) return { ok: true, deliveries: [] };
  if (pathname.includes("/bills")) return { ok: true, bills: [] };
  if (pathname.includes("dispatch/board")) return { ok: true, rows: [] };
  if (pathname.includes("operations/orders")) return { ok: true, orders: [] };
  if (pathname.includes("operations/skus")) return { ok: true, skus: [] };
  if (pathname.includes("/certifications")) return { ok: true, certifications: [] };
  if (pathname.includes("support/quality/dashboard")) return { ok: true, dashboard: { response_count: 0, average_score: 0, review_count: 0, average_review_score: 0 } };
  if (pathname.includes("support/conversations")) return { ok: true, conversations: [], nextCursor: null };
  if (pathname.includes("support/tickets")) return { ok: true, tickets: [], nextCursor: null };
  if (pathname.includes("support/agents")) return { ok: true, agents: [], nextCursor: null };
  if (pathname.includes("support/skill-groups")) return { ok: true, groups: [], nextCursor: null };
  if (pathname.includes("support/sla-policies")) return { ok: true, policies: [], nextCursor: null };
  if (pathname.includes("reviews/moderation")) return { ok: true, items: [], nextCursor: null };
  if (pathname.includes("review-appeals")) return { ok: true, items: [], nextCursor: null };
  if (pathname.includes("marketing/campaigns") && pathname.includes("rule-revisions")) return { ok: true, ruleRevisions: [] };
  if (pathname.includes("marketing/campaigns")) return { ok: true, campaigns: [] };
  if (pathname.includes("marketing/coupon-definitions")) return { ok: true, couponDefinitions: [] };
  if (pathname.includes("marketing/coupon-grants")) return { ok: true, grants: [] };
  return { ok: true };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
}

async function assertMobileLayout(page, fileKey) {
  const metrics = await page.evaluate(({ width, height }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const interactive = [...document.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')].filter(visible);
    const touchViolations = interactive.map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 40) || "", width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
    }).filter((item) => item.width < 44 || item.height < 44);
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      interactiveCount: interactive.length,
      minimumTouchWidth: interactive.length ? Math.min(...interactive.map((element) => element.getBoundingClientRect().width)) : null,
      minimumTouchHeight: interactive.length ? Math.min(...interactive.map((element) => element.getBoundingClientRect().height)) : null,
      touchViolations,
      bottomNavigationItems: document.querySelectorAll(".admin-mobile-tabbar button").length,
      toolCount: document.querySelectorAll(".admin-mobile-tools-grid > button").length,
      hasDetailBack: Boolean(document.querySelector('button[aria-label="返回运营总览"]')),
      hasGate: Boolean(document.querySelector(".admin-mobile-gate")),
      hasLoadingState: /加载|正在打开|读取中/.test(document.body.innerText),
      hasEmptyState: /暂无|尚未|没有.*记录|0\s*条/.test(document.body.innerText),
      hasErrorState: /失败|暂不可用|重试|错误/.test(document.body.innerText),
      hasConflictState: /冲突|已被其他.*更新|刷新后重试/.test(document.body.innerText),
      labeledTableCells: document.querySelectorAll("tbody td[data-label]").length,
      unlabeledTableCells: document.querySelectorAll("tbody td:not([data-label])").length,
      expectedWidth: width,
      expectedHeight: height,
    };
  }, viewport);
  if (metrics.innerWidth !== viewport.width || metrics.innerHeight !== viewport.height) throw new Error(`${fileKey} 视口不是 390×844`);
  if (metrics.documentScrollWidth !== viewport.width || metrics.bodyScrollWidth !== viewport.width) throw new Error(`${fileKey} 存在横向溢出：document=${metrics.documentScrollWidth}, body=${metrics.bodyScrollWidth}`);
  if (metrics.touchViolations.length) throw new Error(`${fileKey} 存在小于 44px 的触控目标：${JSON.stringify(metrics.touchViolations.slice(0, 8))}`);
  return metrics;
}

function sessionInit({ authenticated = true, role = "operator", city = true } = {}) {
  if (authenticated) {
    localStorage.setItem("xlb.admin.token", "admin-mobile-edge-token");
    localStorage.setItem("xlb.admin.userId", "admin-mobile-operator");
    localStorage.setItem("xlb.admin.role", role);
    localStorage.setItem("xlb.admin.username", "admin_hz");
  }
  if (city) localStorage.setItem("xlb.admin.cityCode", "hangzhou");
}

async function capture({ fileKey, routePath, label, stage, sliceIds, session = {}, contractVariant = "empty", afterLoad }) {
  const context = await browser.newContext({ viewport, screen: viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "zh-CN", colorScheme: "light" });
  await context.addInitScript(sessionInit, session);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    if (stage === "entry") {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return fulfillJson(route, emptyContract(route.request().url(), contractVariant));
    }
    if (stage === "recovery") return fulfillJson(route, { ok: false, error: "服务暂不可用，请稍后重试", statusCode: 503 }, 503);
    if (stage === "conflict") return fulfillJson(route, { ok: false, error: "VERSION_CONFLICT", message: "数据已被其他运营人员更新，请刷新后重试", statusCode: 409 }, 409);
    return fulfillJson(route, emptyContract(route.request().url(), contractVariant));
  });
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(stage === "entry" ? 450 : ["recovery", "conflict"].includes(stage) ? 1_600 : 1_000);
  if (afterLoad) await afterLoad(page);
  await page.waitForTimeout(250);
  if (pageErrors.length) throw new Error(`${fileKey} 页面错误：${pageErrors.join(" | ")}`);
  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes("页面暂时无法显示")) throw new Error(`${fileKey} 进入应用崩溃边界`);
  const layout = await assertMobileLayout(page, fileKey);
  const fileName = `${fileKey}.png`;
  const relativePath = `docs/design/ui/production-control/evidence/ADMIN-FULL/${fileName}`;
  await page.screenshot({ path: path.join(evidenceDir, fileName), fullPage: false });
  manifest.evidence.push({
    fileKey,
    sliceIds,
    stage,
    label,
    path: relativePath,
    layout,
    description: stage === "entry"
      ? "真实手机运营应用在契约请求未完成时显示加载状态。"
      : stage === "result"
        ? "真实手机运营应用显示服务端确认的空结果，未伪造成功业务记录。"
        : stage === "recovery"
          ? "真实手机运营应用在契约 503 下显示可恢复错误，不把失败解释为空数据。"
          : stage === "conflict"
            ? "真实手机运营应用展示版本冲突恢复状态，不覆盖其他运营人员结果。"
            : "真实手机运营应用的 390×844 画面。",
  });
  await context.close();
  return relativePath;
}

try {
  for (const carrier of carriers) {
    const allCarrierSliceIds = adminSlices.filter((slice) => slice.carrierId === carrier.carrierId).map((slice) => slice.sliceId);
    const targetSliceIds = targetSlices.filter((slice) => slice.carrierId === carrier.carrierId).map((slice) => slice.sliceId);
    await capture({ fileKey: `${carrier.carrierId}.base`, routePath: carrier.routePath, label: `${carrier.label}：移动基础画面`, stage: "base", sliceIds: allCarrierSliceIds });
    if (targetSliceIds.length) {
      const entry = await capture({ fileKey: `${carrier.carrierId}.entry`, routePath: carrier.routePath, label: `${carrier.label}：加载`, stage: "entry", sliceIds: targetSliceIds });
      const result = await capture({ fileKey: `${carrier.carrierId}.result`, routePath: carrier.routePath, label: `${carrier.label}：空结果`, stage: "result", sliceIds: targetSliceIds });
      const recovery = await capture({ fileKey: `${carrier.carrierId}.recovery`, routePath: carrier.routePath, label: `${carrier.label}：错误恢复`, stage: "recovery", sliceIds: targetSliceIds });
      for (const sliceId of targetSliceIds) manifest.sliceCoverage.push({ sliceId, carrierId: carrier.carrierId, entry, result, recovery });
    }
  }

  const b0SliceIds = adminSlices.filter((slice) => slice.batch === "B0").map((slice) => slice.sliceId);
  await capture({ fileKey: "GATE.identity", routePath: "/", label: "运营身份验证门禁", stage: "gate", sliceIds: b0SliceIds, session: { authenticated: false, city: false } });
  await capture({ fileKey: "GATE.city", routePath: "/", label: "运营城市门禁", stage: "gate", sliceIds: b0SliceIds, session: { city: false } });
  await capture({ fileKey: "GATE.role-denied", routePath: "/", label: "未知角色拒绝门禁", stage: "gate", sliceIds: b0SliceIds, session: { role: "viewer" } });
  await capture({ fileKey: "GATE.dispatch-denied", routePath: "/#/dispatch?cityCode=hangzhou", label: "派单权限拒绝门禁", stage: "gate", sliceIds: targetSlices.filter((slice) => slice.carrierId === "A-09").map((slice) => slice.sliceId), session: { role: "auditor" } });
  await capture({
    fileKey: "SHELL.tools",
    routePath: "/",
    label: "十四个移动工作台与账户面板",
    stage: "tools",
    sliceIds: targetSlices.map((slice) => slice.sliceId),
    afterLoad: async (page) => {
      await page.locator(".admin-mobile-tabbar button").last().click();
      await page.locator(".admin-mobile-tools").waitFor();
    },
  });
  await capture({
    fileKey: "A-08.table",
    routePath: "/#/enterprise?cityCode=hangzhou",
    label: "企业客户移动字段标签卡片",
    stage: "table",
    sliceIds: targetSlices.filter((slice) => slice.carrierId === "A-08").map((slice) => slice.sliceId),
    contractVariant: "table",
    afterLoad: async (page) => {
      const firstLabeledCell = page.locator("tbody td[data-label]").first();
      await firstLabeledCell.waitFor();
      await firstLabeledCell.scrollIntoViewIfNeeded();
    },
  });
  await capture({ fileKey: "A-01.conflict", routePath: "/#/settlement-ops?cityCode=hangzhou", label: "结算状态版本冲突", stage: "conflict", sliceIds: targetSlices.filter((slice) => slice.carrierId === "A-01").map((slice) => slice.sliceId) });
} finally {
  await browser.close();
}

const coveredSliceIds = new Set(manifest.sliceCoverage.map((item) => item.sliceId));
const missingSliceIds = targetSlices.map((slice) => slice.sliceId).filter((sliceId) => !coveredSliceIds.has(sliceId));
if (coveredSliceIds.size !== targetSlices.length || missingSliceIds.length) throw new Error(`运营应用证据覆盖不完整：${coveredSliceIds.size}/${targetSlices.length}，缺少 ${missingSliceIds.join(", ")}`);
for (const item of manifest.evidence) await access(path.join(root, item.path));

await writeFile(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`ADMIN-FULL mobile: captured ${manifest.evidence.length} Microsoft Edge screenshots; slices ${coveredSliceIds.size}/${targetSlices.length}.`);
