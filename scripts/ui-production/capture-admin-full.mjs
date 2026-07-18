import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = process.env.ADMIN_EDGE_BASE_URL ?? "http://127.0.0.1:4317";
const evidenceDir = path.join(root, "docs/design/ui/production-control/evidence/ADMIN-FULL");
const ledgerPath = path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const adminSlices = ledger.slices.filter((slice) => slice.terminal === "admin");
const targetSlices = adminSlices.filter((slice) => slice.batch !== "B0");
const capturedAt = new Date().toISOString();

const carriers = [
  ["A-00", "/", "后台城市范围入口"],
  ["A-01", "/#/settlement-ops?cityCode=hangzhou", "结算运营台"],
  ["A-02", "/#/settlement-ops/statements/stmt-admin-full?cityCode=hangzhou", "结算单审计详情"],
  ["A-03", "/#/settlement-ops/exports?cityCode=hangzhou", "结算导出审计"],
  ["A-04", "/#/settlement-ops/governance?sub=plans&cityCode=hangzhou", "结算只读治理"],
  ["A-05", "/#/order-trace?cityCode=hangzhou", "订单追踪"],
  ["A-06", "/#/worker-withdrawals?cityCode=hangzhou", "提现审核"],
  ["A-07", "/#/aftersale?cityCode=hangzhou", "售后运营"],
  ["A-08", "/#/enterprise?cityCode=hangzhou", "企业服务"],
  ["A-09", "/#/dispatch?cityCode=hangzhou", "派单工作台"],
  ["A-10", "/#/platform-operations?cityCode=hangzhou", "平台运营"],
  ["A-11", "/#/support?cityCode=hangzhou", "客服工作台"],
  ["A-12", "/#/support-quality?cityCode=hangzhou", "客服质量"],
  ["A-13", "/#/review-moderation?cityCode=hangzhou", "评价治理"],
  ["A-14", "/#/marketing?cityCode=hangzhou", "营销运营"],
];

const expectedCarrierIds = Array.from({ length: 15 }, (_, index) => `A-${String(index).padStart(2, "0")}`);
const ledgerCarrierIds = [...new Set(adminSlices.map((slice) => slice.carrierId))].sort();
if (JSON.stringify(ledgerCarrierIds) !== JSON.stringify(expectedCarrierIds)) {
  throw new Error(`后台总账承载容器不完整：${ledgerCarrierIds.join(", ")}`);
}
if (targetSlices.length === 0) throw new Error("后台总账没有非 B0 切片，拒绝生成空证据");

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const manifest = {
  batch: "ADMIN-FULL",
  browser: "Microsoft Edge",
  browserVersion: browser.version(),
  capturedAt,
  actualApp: true,
  appUrl: baseUrl,
  dedicatedPort: Number(new URL(baseUrl).port),
  contractInterception: true,
  externalProviderExecution: false,
  externalExecutionBoundary: "仅拦截后台契约态；不执行退款、到账、出款或外部 Provider 调用。",
  viewport: "1440×900",
  ledgerSliceCount: adminSlices.length,
  targetSliceCount: targetSlices.length,
  evidence: [],
  sliceCoverage: [],
};

function adminSession() {
  localStorage.setItem("xlb.admin.token", "admin-full-edge-token");
  localStorage.setItem("xlb.admin.userId", "admin-full-operator");
  localStorage.setItem("xlb.admin.role", "operator");
  localStorage.setItem("xlb.admin.username", "admin_hz");
  localStorage.setItem("xlb.admin.cityCode", "hangzhou");
}

function emptyContract(url) {
  const pathname = new URL(url).pathname;
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
  if (pathname.includes("support/conversations")) return { ok: true, conversations: [] };
  if (pathname.includes("support/tickets")) return { ok: true, tickets: [], nextCursor: null };
  if (pathname.includes("reviews/moderation")) return { ok: true, items: [], nextCursor: null };
  if (pathname.includes("review-appeals")) return { ok: true, items: [], nextCursor: null };
  if (pathname.includes("marketing/campaigns") && pathname.includes("rule-revisions")) return { ok: true, ruleRevisions: [] };
  if (pathname.includes("marketing/campaigns")) return { ok: true, campaigns: [] };
  if (pathname.includes("marketing/coupon-definitions")) return { ok: true, couponDefinitions: [] };
  return { ok: true };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
}

async function capture(carrierId, routePath, label, stage, sliceIds) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "zh-CN" });
  await context.addInitScript(adminSession);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    if (stage === "entry") {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return fulfillJson(route, emptyContract(route.request().url()));
    }
    if (stage === "recovery") return fulfillJson(route, { ok: false, error: "服务暂不可用，请稍后重试", statusCode: 503 }, 503);
    return fulfillJson(route, emptyContract(route.request().url()));
  });
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(stage === "entry" ? 450 : stage === "recovery" ? 1_500 : 900);
  if (pageErrors.length) throw new Error(`${carrierId}.${stage} page error: ${pageErrors.join(" | ")}`);
  if ((await page.locator("body").innerText()).includes("页面暂时无法显示")) throw new Error(`${carrierId}.${stage} reached the application crash boundary`);
  const fileName = `${carrierId}.${stage}.png`;
  await page.screenshot({ path: path.join(evidenceDir, fileName), fullPage: false });
  manifest.evidence.push({
    fileKey: `${carrierId}.${stage}`,
    sliceIds,
    stage,
    label: `${label}：${stage === "base" ? "基础框架" : stage === "entry" ? "进入/加载" : stage === "result" ? "受控结果" : "失败恢复"}`,
    path: `docs/design/ui/production-control/evidence/ADMIN-FULL/${fileName}`,
    description: stage === "recovery"
      ? "真实 Admin 页面在契约 503 下显示可恢复失败，不把失败解释为空数据或成功。"
      : stage === "entry"
        ? "真实 Admin 页面在契约请求未完成时保留业务上下文并显示加载状态。"
        : stage === "result"
          ? "真实 Admin 页面消费成功契约并显示服务端确认的空结果；未伪造到账、退款或 Provider 成功。"
          : "真实 Admin 应用的桌面基础框架与当前载体入口。",
  });
  await context.close();
  return `docs/design/ui/production-control/evidence/ADMIN-FULL/${fileName}`;
}

try {
  for (const [carrierId, routePath, label] of carriers) {
    const allCarrierSlices = adminSlices.filter((slice) => slice.carrierId === carrierId).map((slice) => slice.sliceId);
    const targetSliceIds = adminSlices.filter((slice) => slice.carrierId === carrierId && slice.batch !== "B0").map((slice) => slice.sliceId);
    await capture(carrierId, routePath, label, "base", allCarrierSlices);
    if (targetSliceIds.length > 0) {
      const entry = await capture(carrierId, routePath, label, "entry", targetSliceIds);
      const result = await capture(carrierId, routePath, label, "result", targetSliceIds);
      const recovery = await capture(carrierId, routePath, label, "recovery", targetSliceIds);
      for (const sliceId of targetSliceIds) {
        manifest.sliceCoverage.push({ sliceId, carrierId, entry, result, recovery });
      }
    }
  }
} finally {
  await browser.close();
}

const coveredSliceIds = new Set(manifest.sliceCoverage.map((item) => item.sliceId));
const missingSliceIds = targetSlices.map((slice) => slice.sliceId).filter((sliceId) => !coveredSliceIds.has(sliceId));
if (coveredSliceIds.size !== targetSlices.length || missingSliceIds.length > 0) {
  throw new Error(`后台非 B0 证据覆盖不完整：${coveredSliceIds.size}/${targetSlices.length}，缺少 ${missingSliceIds.join(", ") || "未知切片"}`);
}
for (const item of manifest.evidence) await access(path.join(root, item.path));

await writeFile(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`ADMIN-FULL: captured ${manifest.evidence.length} Edge screenshots at ${baseUrl}`);
