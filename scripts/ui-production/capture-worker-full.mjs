import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = process.cwd();
const port = Number(process.env.WORKER_EVIDENCE_PORT ?? 4322);
const appUrl = `http://127.0.0.1:${port}`;
const relativeEvidenceDir = "docs/design/ui/production-control/evidence/WORKER-FULL";
const evidenceDir = path.join(root, relativeEvidenceDir);
const ledgerPath = path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json");
const workerRoot = path.join(root, "apps/worker");
const capturedAt = new Date().toISOString();
const at = "2026-07-19T08:00:00.000Z";
const later = "2026-07-19T09:00:00.000Z";
const viewport = { width: 390, height: 844 };

await mkdir(evidenceDir, { recursive: true });

const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const workerSlices = ledger.slices.filter((slice) => slice.terminal === "worker");
const slicesByCarrier = Object.fromEntries(
  [...new Set(workerSlices.map((slice) => slice.carrierId))].map((carrierId) => [
    carrierId,
    workerSlices.filter((slice) => slice.carrierId === carrierId).map((slice) => slice.sliceId),
  ]),
);

const carrierRoutes = {
  "W-00": "/worker/",
  "W-01": "/worker/",
  "W-02": "/worker/tasks",
  "W-03": "/worker/tasks/ful-accepted",
  "W-04": "/worker/repairs",
  "W-05": "/worker/wallet",
  "W-06": "/worker/support",
  "W-07": "/worker/notifications",
  "W-08": "/worker/reputation",
  "W-09": "/worker/profile",
  "W-10": "/worker/certification",
};

const manifest = {
  batch: "WORKER-FULL",
  capturedAt,
  actualApp: true,
  appUrl,
  dedicatedPort: port,
  browser: "Microsoft Edge",
  browserVersion: null,
  viewport,
  fullPageScreenshots: true,
  contractStateInterception: true,
  externalProviderExecuted: false,
  visualChineseGate: { passed: false, rule: "截图正文、表单值和已选选项不得包含英文字母" },
  notes: [
    "截图来自实际 Worker Vite 应用与 Microsoft Edge；API 路由拦截只提供共享契约允许的确定性状态。",
    "认证、提现、审核、打款、地图和外部支付服务均未真实执行；结果态仅表示接口回执或既有合同状态。",
    "W-02 当前台账没有独立 Slice，因此只要求并记录 Carrier 基座。",
  ],
  carriers: Object.entries(carrierRoutes).map(([carrierId, route]) => ({ carrierId, route, sliceIds: slicesByCarrier[carrierId] ?? [] })),
  evidence: [],
  coverage: { carrierBases: {}, slices: {} },
};

function workerSession() {
  localStorage.setItem("xlb.worker.session", JSON.stringify({
    token: "worker-full-evidence-token",
    userId: "worker-evidence-hangzhou",
    role: "worker",
    phone: "13800000001",
  }));
  localStorage.setItem("xlb.worker.local-work-mode", "online");
}

function task(id, status, skuId = `sku-${id}`) {
  return { dispatchTaskId: id, cityCode: "hangzhou", orderId: `order-${id}`, skuId, amount: 12800, streamName: "杭州上门服务", status, createdAt: at };
}

function fulfillment(id, status) {
  return {
    fulfillmentId: id,
    acceptanceId: `accept-${id}`,
    dispatchTaskId: `dispatch-${id}`,
    orderId: `order-${id}`,
    cityCode: "hangzhou",
    workerId: "worker-evidence-hangzhou",
    skuId: "sku_home_service_basic",
    status,
    startedAt: status === "accepted" ? null : at,
    completedAt: status === "completed" ? later : null,
    completionNote: status === "completed" ? "现场服务已完成并留存记录" : null,
    createdAt: at,
    updatedAt: later,
  };
}

function repair(id, status) {
  return {
    repairOrderId: id,
    complaintId: `complaint-${id}`,
    orderId: `order-${id}`,
    workerId: "worker-evidence-hangzhou",
    reason: status === "cancelled" ? "平台已取消返工" : "客户反馈需要再次上门处理",
    serviceNote: status === "completed" ? "已复检并完成返工" : null,
    status,
    startedAt: ["in_progress", "completed"].includes(status) ? at : null,
    completedAt: status === "completed" ? later : null,
    createdAt: at,
    updatedAt: later,
  };
}

function withdrawal(id, status, amount = 12000) {
  return {
    withdrawalId: id,
    cityCode: "hangzhou",
    workerId: "worker-evidence-hangzhou",
    bankAccountId: "bank-active",
    amount,
    currency: "CNY",
    status,
    requestNote: "师傅工作台提交",
    reviewNote: status === "rejected" ? "账户信息需要复核" : status === "approved" ? "平台审核通过" : null,
    markedPaidNote: status === "marked_paid" ? "仅为平台打款标记，不代表外部支付服务已执行" : null,
    requestedAt: at,
    reviewedAt: ["approved", "rejected", "marked_paid"].includes(status) ? later : null,
    reviewedByAdminId: ["approved", "rejected", "marked_paid"].includes(status) ? "admin-evidence" : null,
    markedPaidAt: status === "marked_paid" ? later : null,
    markedPaidByAdminId: status === "marked_paid" ? "admin-evidence" : null,
    createdAt: at,
    updatedAt: later,
  };
}

function ticket(id, status) {
  return {
    ticketId: id, cityCode: "hangzhou", source: "worker", requesterId: "worker-evidence-hangzhou", businessClientId: null,
    type: "withdrawal_issue", priority: status === "open" ? "high" : "normal", status,
    subject: status === "resolved" ? "提现记录已完成复核" : "需要平台协助核对服务记录",
    description: "请平台根据现有合同记录协助核对。", relatedOrderId: null, relatedWorkerId: "worker-evidence-hangzhou",
    linkedAftersaleComplaintId: null, assignedAgentId: status === "open" ? null : "agent-evidence", assignedSkillGroupId: null,
    routingLanguage: "zh-cn", slaFirstResponseDueAt: null, slaResolutionDueAt: null, firstRespondedAt: null,
    slaFirstResponseBreachedAt: null, slaResolutionBreachedAt: null, resolvedAt: status === "resolved" ? later : null,
    closedAt: status === "closed" ? later : null, resolutionCode: status === "resolved" ? "answered" : null,
    version: 2, createdAt: at, updatedAt: later,
  };
}

function notification(id, { read = false, archived = false } = {}) {
  return {
    notificationId: id,
    eventType: "support.ticket.resolved",
    templateRevisionId: `template-${id}`,
    title: read ? "客服工单状态已更新" : "你有一条新的任务通知",
    body: read ? "工单已处理，可在客服中心查看记录。" : "杭州服务大厅有新的派单状态，请及时查看。",
    reference: { kind: "support_ticket_resolved", ticketId: "ticket-active" },
    occurredAt: at, createdAt: at, readAt: read ? later : null, archivedAt: archived ? later : null,
    rowVersion: archived ? 3 : read ? 2 : 1,
  };
}

function location({ freshness = "fresh", sharing = true } = {}) {
  return {
    locationId: `location-${freshness}-${sharing ? "on" : "off"}`,
    workerId: "worker-evidence-hangzhou", cityCode: "hangzhou", latitude: 30.2741, longitude: 120.1551,
    accuracyMeters: 20, capturedAt: at, expiresAt: later, source: "worker_device", privacyLevel: "private_exact",
    freshness, serviceRadiusKm: 10, locationSharingEnabled: sharing,
  };
}

function certification(status) {
  return {
    certificationId: `cert-${status}`, workerId: "worker-evidence-hangzhou", cityCode: "hangzhou",
    certType: "home_service_basic", certName: "基础上门服务资格", status, submittedAt: at,
    reviewedAt: status === "pending" ? null : later, reviewerId: status === "pending" ? null : "admin-evidence",
    rejectReason: status === "rejected" ? "材料信息不完整，请补充后重新提交" : null,
    createdAt: at, updatedAt: later,
  };
}

function evidenceAggregate(variant) {
  const fulfillmentStatus = variant === "completed" || variant === "disputed" ? "completed" : variant === "stored" ? "in_progress" : "accepted";
  const stored = ["stored", "completed", "disputed"].includes(variant);
  return {
    fulfillmentId: `ful-${variant === "missing" ? "accepted" : variant}`,
    orderId: `order-${variant}`,
    cityCode: "hangzhou",
    fulfillmentStatus,
    evidence: stored ? [{
      evidenceId: `evidence-${variant}`, evidenceType: "completion", capturedAt: later, note: "现场完工记录",
      mediaAsset: { mediaAssetId: `asset-${variant}`, originalFileName: "现场完工记录.jpg", mimeType: "image/jpeg", sizeBytes: 128000,
        checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", securityScanStatus: "not_malware_scanned_local" },
    }] : [],
    confirmation: variant === "completed" ? { status: "confirmed", confirmedAt: later, disputedAt: null, disputeReason: null }
      : variant === "disputed" ? { status: "disputed", confirmedAt: null, disputedAt: later, disputeReason: "客户申请复核现场结果" }
        : { status: "pending", confirmedAt: null, disputedAt: null, disputeReason: null },
  };
}

function scenarioResponse(carrierId, variant, request) {
  const url = new URL(request.url());
  const pathname = url.pathname;
  const method = request.method();

  if (variant === "recovery") return { status: 503, body: { ok: false, error: "证据采集契约态：服务暂时不可用，请刷新后重试。" } };

  if (pathname === "/api/worker/task-pool") {
    const tasks = carrierId === "W-01" && variant === "result"
      ? ["offering", "accepted", "rejected", "timeout", "cancelled"].map((status) => task(`task-${status}`, status))
      : carrierId === "W-01" ? [task("task-offering", "offering"), task("task-blocked", "offering", "sku-cert-required")] : [];
    return { body: { ok: true, cityCode: "hangzhou", tasks } };
  }
  if (pathname === "/api/worker/eligibility") {
    const skuId = url.searchParams.get("skuId") ?? "unknown";
    const blocked = skuId === "sku-cert-required";
    return { body: { ok: true, eligibility: { workerId: "worker-evidence-hangzhou", cityCode: "hangzhou", skuId, isEligible: !blocked, reasons: blocked ? ["Missing approved certification: home_service_basic"] : [] } } };
  }
  if (pathname === "/api/worker/fulfillments") {
    const states = carrierId === "W-02" || carrierId === "W-03" ? ["accepted", "in_progress", "completed", "cancelled"] : [];
    return { body: { ok: true, cityCode: "hangzhou", fulfillments: states.map((status) => fulfillment(`ful-${status}`, status)) } };
  }
  const fulfillmentMatch = pathname.match(/^\/api\/worker\/fulfillments\/([^/]+)$/);
  if (fulfillmentMatch) {
    const id = decodeURIComponent(fulfillmentMatch[1]);
    const status = id.includes("completed") || id.includes("disputed") ? "completed" : id.includes("stored") ? "in_progress" : id.includes("cancelled") ? "cancelled" : "accepted";
    return { body: { ok: true, fulfillment: fulfillment(id, status) } };
  }
  const evidenceMatch = pathname.match(/^\/api\/worker\/fulfillments\/([^/]+)\/evidence$/);
  if (evidenceMatch && method === "GET") {
    const id = decodeURIComponent(evidenceMatch[1]);
    const kind = id.replace(/^ful-/, "");
    return { body: { ok: true, aggregate: evidenceAggregate(kind) } };
  }
  if (pathname === "/api/worker/aftersale/repair-orders") {
    const states = variant === "result" ? ["assigned", "in_progress", "completed", "cancelled"] : ["assigned"];
    return { body: { ok: true, repairOrders: states.map((status) => repair(`repair-${status}`, status)) } };
  }
  if (pathname === "/api/worker/finance/balance") {
    return { body: { ok: true, balance: { cityCode: "hangzhou", workerId: "worker-evidence-hangzhou", currency: "CNY", accruedAmount: 186800,
      adjustedAmount: -1200, requestedWithdrawalAmount: 36000, markedPaidAmount: 80000, availableAmount: 69600, createdAt: at, updatedAt: later } } };
  }
  if (pathname === "/api/worker/bank-accounts") {
    return { body: { ok: true, bankAccounts: [
      { bankAccountId: "bank-active", cityCode: "hangzhou", workerId: "worker-evidence-hangzhou", accountHolder: "王师傅", bankName: "城市商业银行", bankBranch: "杭州分行", bankCardMasked: "**** **** **** 6218", bankCardLast4: "6218", status: "active", createdAt: at, updatedAt: later },
      { bankAccountId: "bank-inactive", cityCode: "hangzhou", workerId: "worker-evidence-hangzhou", accountHolder: "王师傅", bankName: "旧收款账户", bankBranch: null, bankCardMasked: "**** **** **** 8899", bankCardLast4: "8899", status: "inactive", createdAt: at, updatedAt: later },
    ] } };
  }
  if (pathname === "/api/worker/withdrawal-requests") {
    const states = variant === "result" ? ["requested", "approved", "rejected", "marked_paid", "cancelled"] : ["requested"];
    return { body: { ok: true, withdrawals: states.map((status, index) => withdrawal(`withdrawal-${status}`, status, 10000 + index * 2000)) } };
  }
  if (pathname === "/api/support/tickets") {
    return { body: { ok: true, tickets: variant === "result" ? [ticket("ticket-active", "open"), ticket("ticket-resolved", "resolved"), ticket("ticket-closed", "closed")] : [ticket("ticket-active", "open")], nextCursor: null } };
  }
  if (pathname === "/api/support/conversations") return { body: { ok: true, conversations: [], nextCursor: null } };
  if (pathname === "/api/worker/notifications") {
    return { body: { ok: true, items: variant === "result" ? [notification("notification-unread"), notification("notification-read", { read: true })] : [notification("notification-unread")], nextCursor: null } };
  }
  if (pathname === "/api/worker/reputation") {
    return { body: { ok: true, reputation: variant === "entry" ? null : { workerId: "worker-evidence-hangzhou", cityCode: "hangzhou", ratingCount: 18, ratingSum: 86,
      ratingDistribution: { "1": 0, "2": 1, "3": 1, "4": 3, "5": 13 }, averageRating: 86 / 18, sourceGenerationId: "generation-evidence",
      formulaRevision: "lifetime-visible-arithmetic-v1", sourceWatermark: "delivery-evidence", updatedAt: later } } };
  }
  if (pathname === "/api/worker/review-appeal-targets") {
    return { body: { ok: true, items: variant === "result" ? [
      { reviewId: "review-eligible", visibility: "hidden", moderationVersion: 2, decidedAt: at, activeAppealStatus: null },
      { reviewId: "review-open", visibility: "hidden", moderationVersion: 3, decidedAt: at, activeAppealStatus: "open" },
      { reviewId: "review-resolved", visibility: "visible", moderationVersion: 4, decidedAt: at, activeAppealStatus: "accepted" },
    ] : [] } };
  }
  if (pathname === "/api/worker/location") {
    if (method === "POST") return { body: { ok: true, location: location({ freshness: "fresh", sharing: true }) } };
    const state = variant === "stale" ? location({ freshness: "stale", sharing: true }) : variant === "disabled" ? location({ freshness: "fresh", sharing: false }) : location({ freshness: "fresh", sharing: true });
    return { body: { ok: true, location: state } };
  }
  if (pathname === "/api/worker/certifications" && method === "POST") {
    const status = ["pending", "approved", "rejected", "expired"].includes(variant) ? variant : "pending";
    return { body: { ok: true, certification: certification(status) } };
  }
  return { body: { ok: true } };
}

async function json(route, response) {
  await route.fulfill({ status: response.status ?? 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(response.body) });
}

async function createContext({ authenticated = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "zh-CN", colorScheme: "light" });
  if (authenticated) await context.addInitScript(workerSession);
  return context;
}

async function capture({ carrierId, variant, stage, label, route = carrierRoutes[carrierId], sliceIds = slicesByCarrier[carrierId] ?? [], carrierBase = false, action }) {
  const context = await createContext({ authenticated: carrierId !== "W-00" || variant !== "unauthenticated" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", (requestRoute) => json(requestRoute, scenarioResponse(carrierId, variant, requestRoute.request())));
  await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle" });
  await page.locator("body").waitFor({ state: "visible" });
  if (action) await action(page);
  await page.waitForTimeout(180);
  if (pageErrors.length) throw new Error(`${carrierId}/${variant} page error: ${pageErrors.join(" | ")}`);
  const visibleValues = await page.locator("input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea").evaluateAll((elements) => elements.map((element) => element.value));
  const selectedOptions = await page.locator("select").evaluateAll((elements) => elements.map((element) => element.selectedOptions[0]?.textContent ?? ""));
  const visibleContent = [await page.locator("body").innerText(), ...visibleValues, ...selectedOptions].join("\n");
  const visibleEnglish = visibleContent.match(/[A-Za-z]+(?:[A-Za-z0-9_-]*[A-Za-z0-9])?/g) ?? [];
  if (visibleEnglish.length) throw new Error(`${carrierId}/${variant} visual Chinese gate failed: ${[...new Set(visibleEnglish)].join(", ")}`);
  const fileKey = `${carrierId}.${stage}.${variant}`;
  const fileName = `${fileKey}.png`;
  const relativePath = `${relativeEvidenceDir}/${fileName}`;
  await page.screenshot({ path: path.join(evidenceDir, fileName), fullPage: true });
  manifest.evidence.push({
    fileKey, carrierId, sliceIds, stage, label, route, path: relativePath, carrierBase,
    source: "actual-worker-app", browser: "Microsoft Edge", contractState: true,
    externalProviderExecuted: false,
  });
  if (carrierBase) manifest.coverage.carrierBases[carrierId] = relativePath;
  for (const sliceId of sliceIds) {
    manifest.coverage.slices[sliceId] ??= {};
    manifest.coverage.slices[sliceId][stage] ??= [];
    manifest.coverage.slices[sliceId][stage].push(relativePath);
  }
  await context.close();
}

async function captureStandardCarrier(carrierId) {
  const sliceIds = slicesByCarrier[carrierId] ?? [];
  await capture({ carrierId, variant: "entry", stage: "entry", label: `${carrierId} 入口与基座`, sliceIds, carrierBase: true });
  await capture({ carrierId, variant: "result", stage: "result", label: `${carrierId} 主要合同结果态`, sliceIds });
  await capture({ carrierId, variant: "recovery", stage: "recovery", label: `${carrierId} 接口失败恢复态`, sliceIds });
}

async function validateManifest() {
  const expectedCarriers = Object.keys(carrierRoutes);
  for (const carrierId of expectedCarriers) {
    if (!manifest.coverage.carrierBases[carrierId]) throw new Error(`Missing carrier base: ${carrierId}`);
  }
  for (const slice of workerSlices.filter((item) => item.carrierId !== "W-00")) {
    const coverage = manifest.coverage.slices[slice.sliceId] ?? {};
    for (const stage of ["entry", "result", "recovery"]) {
      if (!coverage[stage]?.length) throw new Error(`Missing ${stage} evidence for ${slice.sliceId}`);
    }
  }
  for (const item of manifest.evidence) {
    const absolutePath = path.join(root, item.path);
    await access(absolutePath);
    if ((await stat(absolutePath)).size < 1_000) throw new Error(`Screenshot is unexpectedly small: ${item.path}`);
  }
  manifest.validation = {
    passed: true,
    expectedCarrierCount: expectedCarriers.length,
    capturedCarrierBaseCount: Object.keys(manifest.coverage.carrierBases).length,
    workerSliceCount: workerSlices.length,
    nonB0SliceCount: workerSlices.filter((slice) => slice.carrierId !== "W-00").length,
    requiredNonB0Stages: ["entry", "result", "recovery"],
    screenshotCount: manifest.evidence.length,
    screenshotFilesExist: true,
    visualChineseGatePassed: true,
  };
  manifest.visualChineseGate.passed = true;
}

const requireFromWorker = createRequire(path.join(workerRoot, "package.json"));
const viteEntry = requireFromWorker.resolve("vite");
const { createServer } = await import(pathToFileURL(viteEntry));
const vite = await createServer({ root: workerRoot, server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "warn" });
await vite.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
manifest.browserVersion = browser.version();

try {
  const w00Slices = slicesByCarrier["W-00"] ?? [];
  await capture({ carrierId: "W-00", variant: "unauthenticated", stage: "entry", label: "W-00 未登录身份 Gate", sliceIds: w00Slices, carrierBase: true });
  await capture({ carrierId: "W-00", variant: "entry", stage: "result", label: "W-00 已认证会话进入真实工作台", sliceIds: w00Slices });
  await capture({ carrierId: "W-00", variant: "unauthenticated", stage: "recovery", label: "W-00 Gate 保留重试入口", sliceIds: w00Slices });

  await captureStandardCarrier("W-01");
  await capture({ carrierId: "W-02", variant: "entry", stage: "base", label: "W-02 我的任务 Carrier 基座", sliceIds: [], carrierBase: true });

  const w03Slices = slicesByCarrier["W-03"] ?? [];
  await capture({ carrierId: "W-03", variant: "entry", stage: "entry", label: "W-03 已承接、待证据与待确认入口", sliceIds: w03Slices, carrierBase: true, route: "/worker/tasks/ful-accepted" });
  for (const variant of ["stored", "completed", "cancelled", "disputed"]) {
    await capture({ carrierId: "W-03", variant, stage: "result", label: `W-03 ${variant} 合同结果态`, sliceIds: w03Slices, route: `/worker/tasks/ful-${variant}` });
  }
  await capture({ carrierId: "W-03", variant: "recovery", stage: "recovery", label: "W-03 详情与证据加载失败恢复态", sliceIds: w03Slices });

  await captureStandardCarrier("W-04");
  await captureStandardCarrier("W-05");
  await captureStandardCarrier("W-06");
  await captureStandardCarrier("W-07");
  await captureStandardCarrier("W-08");

  const w09Slices = slicesByCarrier["W-09"] ?? [];
  await capture({ carrierId: "W-09", variant: "entry", stage: "entry", label: "W-09 位置服务入口与基座", sliceIds: w09Slices, carrierBase: true });
  await capture({ carrierId: "W-09", variant: "stale", stage: "result", label: "W-09 位置陈旧合同态", sliceIds: w09Slices });
  await capture({ carrierId: "W-09", variant: "disabled", stage: "result", label: "W-09 位置共享关闭合同态", sliceIds: w09Slices });
  await capture({ carrierId: "W-09", variant: "result", stage: "result", label: "W-09 位置共享开启且新鲜合同态", sliceIds: w09Slices });
  await capture({ carrierId: "W-09", variant: "recovery", stage: "recovery", label: "W-09 位置加载失败恢复态", sliceIds: w09Slices });

  const w10Slices = slicesByCarrier["W-10"] ?? [];
  await capture({ carrierId: "W-10", variant: "entry", stage: "entry", label: "W-10 未提交认证入口与基座", sliceIds: w10Slices, carrierBase: true });
  for (const status of ["pending", "approved", "rejected", "expired"]) {
    await capture({
      carrierId: "W-10", variant: status, stage: "result", label: `W-10 ${status} 本次会话合同回执`, sliceIds: w10Slices,
      action: async (page) => {
        await page.getByRole("button", { name: "提交认证申请" }).click();
        await page.getByText("本次会话申请记录", { exact: true }).waitFor();
      },
    });
  }
  await capture({ carrierId: "W-10", variant: "recovery", stage: "recovery", label: "W-10 认证提交前可恢复失败态", sliceIds: w10Slices });

  await validateManifest();
  await writeFile(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`WORKER-FULL Edge evidence captured: ${manifest.evidence.length} screenshots, ${workerSlices.length} slices, Edge ${manifest.browserVersion}`);
} finally {
  await browser.close();
  await vite.close();
}
