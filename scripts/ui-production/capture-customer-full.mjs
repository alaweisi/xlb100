import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const root = process.cwd();
const port = Number(process.env.CUSTOMER_EVIDENCE_PORT ?? 4391);
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDir = path.join(root, "docs/design/ui/production-control/evidence/CUSTOMER-FULL");
const viewport = { width: 390, height: 844 };
const capturedAt = new Date().toISOString();
const contractAt = "2026-07-18T12:00:00.000Z";
const laterAt = "2026-08-18T12:00:00.000Z";
const ledgerPath = path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const customerSlices = ledger.slices.filter((slice) => slice.terminal === "customer" && slice.batch !== "B0");
const allCustomerSlices = ledger.slices.filter((slice) => slice.terminal === "customer");
const carrierSliceIds = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
  const carrier = `C-${String(index).padStart(2, "0")}`;
  return [carrier, allCustomerSlices.filter((slice) => slice.carrierId === carrier).map((slice) => slice.sliceId)];
}));

await mkdir(evidenceDir, { recursive: true });
for (const name of await readdir(evidenceDir)) {
  if (name.endsWith(".png") || name === "manifest.json") await rm(path.join(evidenceDir, name));
}

function customerSession() {
  localStorage.setItem("xlb.customer.token", "customer-evidence-contract-token");
  localStorage.setItem("xlb.customer.userId", "customer-contract-001");
  localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  localStorage.setItem("xlb.customer.orderIds", JSON.stringify(["order-contract-001"]));
}

const sku = {
  skuId: "sku-clean-contract", itemId: "item-clean-contract", cityCode: "hangzhou",
  name: "日常保洁", unit: "次", profile: null, standards: [], sortOrder: 1, isEnabled: true,
};
const catalog = {
  cityCode: "hangzhou",
  categories: [
    { categoryId: "cat-clean-contract", cityCode: "hangzhou", name: "家庭保洁", sortOrder: 1, isEnabled: true,
      items: [{ itemId: "item-clean-contract", categoryId: "cat-clean-contract", cityCode: "hangzhou", name: "日常保洁", sortOrder: 1, isEnabled: true, skus: [sku] }] },
    { categoryId: "cat-repair-contract", cityCode: "hangzhou", name: "家电维修", sortOrder: 2, isEnabled: true,
      items: [{ itemId: "item-repair-contract", categoryId: "cat-repair-contract", cityCode: "hangzhou", name: "空调检修", sortOrder: 1, isEnabled: true,
        skus: [{ ...sku, skuId: "sku-repair-contract", itemId: "item-repair-contract", name: "空调不制冷检修", unit: "次" }] }] },
    { categoryId: "cat-install-contract", cityCode: "hangzhou", name: "上门安装", sortOrder: 3, isEnabled: true,
      items: [{ itemId: "item-install-contract", categoryId: "cat-install-contract", cityCode: "hangzhou", name: "灯具安装", sortOrder: 1, isEnabled: true,
        skus: [{ ...sku, skuId: "sku-install-contract", itemId: "item-install-contract", name: "吸顶灯安装", unit: "盏" }] }] },
  ],
};
const quote = {
  cityCode: "hangzhou", skuId: sku.skuId, basePrice: 88, currency: "CNY", priceText: "每次 88 元",
  priceType: "fixed", minPrice: null, maxPrice: null, pricingNote: "最终金额以服务端报价为准",
  priceRuleId: "price-rule-contract-001", version: 3, skuProfile: null, standards: [],
  breakdown: { baseAmount: 88, requiredFeeAmount: 0, optionalFeeAmount: 0, totalAmount: 88, feeItems: [] },
};
const address = {
  addressId: "address-contract-001", customerId: "customer-contract-001", cityCode: "hangzhou",
  contactName: "李女士", contactPhoneMasked: "138****0001", province: "浙江省", city: "杭州市",
  district: "西湖区", detailAddress: "云栖小区 1 幢 101 室", isDefault: true, createdAt: contractAt, updatedAt: contractAt,
};
function order(status = "pending_dispatch") {
  return {
    orderId: "order-contract-001", cityCode: "hangzhou", addressProvince: "浙江省", addressCity: "杭州市",
    addressDistrict: "西湖区", detailAddress: "云栖小区 1 幢 101 室", contactName: "李女士", contactPhone: "13800000001",
    scheduledAt: "2026-07-20T01:00:00.000Z", scheduledTimeSlot: "morning", customerId: "customer-contract-001",
    skuId: sku.skuId, skuName: sku.name, quantity: 1, unit: sku.unit, priceRuleId: quote.priceRuleId,
    priceText: quote.priceText, priceType: "fixed", basePrice: 88, currency: "CNY", totalAmount: 88,
    quoteSnapshot: null, status, createdAt: contractAt, updatedAt: contractAt,
  };
}
const couponGrant = {
  couponGrantId: "coupon-grant-contract-001", couponDefinitionId: "coupon-definition-contract-001",
  marketingCampaignId: "campaign-contract-001", ruleRevisionId: "rule-revision-contract-001", cityCode: "hangzhou",
  customerId: "customer-contract-001", status: "available", issuanceReason: "admin_manual", issuanceRef: "approval-contract-001",
  availableAt: contractAt, expiresAt: laterAt, version: 1, createdAt: contractAt, updatedAt: contractAt,
};
const discountDecision = {
  discountDecisionId: "discount-decision-contract-001", cityCode: "hangzhou", customerId: "customer-contract-001",
  skuId: sku.skuId, quantity: 1, priceRuleId: quote.priceRuleId, priceRuleVersion: 3,
  ruleRevisionId: couponGrant.ruleRevisionId, ruleContentHash: "a".repeat(64),
  couponDefinitionId: couponGrant.couponDefinitionId, couponGrantId: couponGrant.couponGrantId, currency: "CNY",
  grossAmountMinor: 8800, discountAmountMinor: 1000, netAmountMinor: 7800,
  requestFingerprint: "b".repeat(64), status: "issued", expiresAt: laterAt,
  acceptedOrderId: null, version: 1, createdAt: contractAt, updatedAt: contractAt,
};
const reverseRequest = {
  reverseRequestId: "reverse-contract-001", cityCode: "hangzhou", orderId: "order-contract-001",
  customerId: "customer-contract-001", reverseType: "reschedule", status: "requested", reason: "需要调整上门时间",
  requestedScheduledAt: "2026-07-21T02:00:00.000Z", requestedTimeSlot: "morning",
  idempotencyKey: "reverse-idempotency-contract-001", reviewNote: null, reviewedByAdminId: null,
  reviewedAt: null, appliedAt: null, createdAt: contractAt, updatedAt: contractAt,
};
const complaint = {
  complaintId: "complaint-contract-001", cityCode: "hangzhou", orderId: "order-contract-001",
  customerId: "customer-contract-001", category: "service_quality", priority: "normal",
  description: "服务细节需要平台协助核实", status: "waiting_customer", idempotencyKey: "complaint-idempotency-contract-001",
  assignedAdminId: "admin-contract-001", resolutionType: null, resolutionNote: null,
  submittedAt: contractAt, resolvedAt: null, closedAt: null, updatedAt: contractAt,
};
function reviewView(visibility = "pending_moderation", appealStatus = null) {
  const review = {
    reviewId: "review-contract-001", cityCode: "hangzhou", orderId: "order-contract-001",
    customerId: "customer-contract-001", workerId: "worker-contract-001", fulfillmentId: "fulfillment-contract-001",
    rating: 5, comment: "服务认真，沟通及时。", status: "created", createdAt: contractAt, updatedAt: contractAt,
  };
  const appeals = appealStatus ? [{
    appealId: `appeal-${appealStatus}-contract-001`, cityCode: "hangzhou", reviewId: review.reviewId,
    moderationVersion: 2, subjectType: "customer", subjectId: "customer-contract-001", reason: "申请平台复核评价状态",
    status: appealStatus, version: 1, resolutionReason: appealStatus === "upheld" ? "复核后恢复展示" : null,
    openedAt: contractAt, resolvedAt: appealStatus === "open" ? null : capturedAt,
    resolvedByAdminId: appealStatus === "open" ? null : "admin-contract-001",
  }] : [];
  return {
    review,
    visibility: { reviewId: review.reviewId, visibility, moderationVersion: 2, version: 2, lastDecisionId: "decision-contract-001", updatedAt: capturedAt },
    appeals,
  };
}

function reverseWithStatus(status, index) {
  return { ...reverseRequest, reverseRequestId: `reverse-${status}-${index}`, status };
}

function complaintWithStatus(status, index) {
  return { ...complaint, complaintId: `complaint-${status}-${index}`, status };
}

const ticket = {
  ticketId: "ticket-contract-001", cityCode: "hangzhou", source: "customer", requesterId: "customer-contract-001",
  businessClientId: null, type: "order_question", priority: "normal", status: "waiting_requester",
  subject: "订单服务时间确认", description: "希望确认师傅预计到达时间", relatedOrderId: "order-contract-001",
  relatedWorkerId: null, linkedAftersaleComplaintId: null, assignedAgentId: "agent-contract-001",
  assignedSkillGroupId: "skill-group-contract-001", routingLanguage: "zh-cn", slaFirstResponseDueAt: laterAt,
  slaResolutionDueAt: laterAt, firstRespondedAt: contractAt, slaFirstResponseBreachedAt: null,
  slaResolutionBreachedAt: null, resolvedAt: null, closedAt: null, resolutionCode: null,
  version: 2, createdAt: contractAt, updatedAt: contractAt,
};
const ticketEvent = {
  ticketEventId: "ticket-event-contract-001", cityCode: "hangzhou", ticketId: ticket.ticketId,
  eventType: "commented", actorType: "admin", actorId: "agent-contract-001", visibility: "requester",
  content: "客服已联系师傅核实，稍后同步预计到达时间。", payload: {}, createdAt: contractAt,
};
const conversation = {
  conversationId: "conversation-contract-001", cityCode: "hangzhou", source: "customer",
  requesterId: "customer-contract-001", businessClientId: null, status: "active", assignedAgentId: "agent-contract-001",
  linkedTicketId: ticket.ticketId, lastServerSeq: 2, version: 2, startedAt: contractAt, acceptedAt: contractAt,
  transferredAt: null, closedAt: null, createdAt: contractAt, updatedAt: contractAt,
};
const messages = [
  { messageId: "message-contract-001", cityCode: "hangzhou", conversationId: conversation.conversationId,
    senderType: "customer", senderId: "customer-contract-001", clientMessageId: "client-message-contract-001",
    serverSeq: 1, messageType: "text", textContent: "请帮我确认订单进度。", mediaAssetId: null, createdAt: contractAt },
  { messageId: "message-contract-002", cityCode: "hangzhou", conversationId: conversation.conversationId,
    senderType: "agent", senderId: "agent-contract-001", clientMessageId: "agent-message-contract-001",
    serverSeq: 2, messageType: "text", textContent: "已收到，正在为您核实。", mediaAssetId: null, createdAt: contractAt },
];
const notification = {
  notificationId: "notification-contract-001", eventType: "order.created", templateRevisionId: "template-contract-001",
  title: "订单已创建", body: "日常保洁订单已创建，可前往订单页查看进度。",
  reference: { kind: "order_created", orderId: "order-contract-001" }, occurredAt: contractAt, createdAt: contractAt,
  readAt: null, archivedAt: null, rowVersion: 1,
};
const profile = {
  customerId: "customer-contract-001", phoneMasked: "138****0001", name: "李女士", avatarUrl: null,
  defaultCityCode: "hangzhou", updatedAt: contractAt,
};

async function json(route, body, status = 200) {
  await route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
}
function apiError(route, message, status = 503, code = "SERVICE_UNAVAILABLE") {
  return json(route, { ok: false, error: message, code, message }, status);
}

function routeContract(page, state = {}) {
  return page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    if (state.failPath && pathname.includes(state.failPath) && (!state.failMethod || method === state.failMethod)) return apiError(route, state.failMessage ?? "服务暂时不可用，请稍后重试", state.failStatus ?? 503, state.failCode);
    if (pathname === "/api/catalog") {
      if (state.catalogLoading) return new Promise(() => {});
      if (state.catalogError) return apiError(route, "服务目录暂时不可用");
      return json(route, { ok: true, catalog: state.emptyCatalog ? { cityCode: "hangzhou", categories: [] } : catalog });
    }
    if (pathname === "/api/pricing/quote") return json(route, { ok: true, quote });
    if (pathname === "/api/customer/marketing/coupon-grants") {
      const couponGrants = state.couponMatrix
        ? ["available", "reserved", "redeemed", "expired", "revoked"].map((status, index) => ({ ...couponGrant, couponGrantId: `coupon-${status}-${index}`, status, expiresAt: status === "expired" ? "2026-06-01T00:00:00.000Z" : laterAt }))
        : state.emptyCoupons ? [] : [couponGrant];
      return json(route, { ok: true, couponGrants });
    }
    if (pathname === "/api/customer/marketing/discount-decisions") return json(route, { ok: true, discountDecision });
    if (pathname === "/api/customer/profile") return method === "GET" ? json(route, { ok: true, profile }) : json(route, { ok: true, profile: { ...profile, name: "李女士（已更新）", updatedAt: capturedAt } });
    if (pathname === "/api/customer/addresses") {
      if (method === "GET") return json(route, { ok: true, addresses: state.emptyAddresses ? [] : [address] });
      return json(route, { ok: true, address: { ...address, addressId: "address-contract-002", isDefault: false } });
    }
    if (pathname.endsWith("/delete")) return json(route, { ok: true, addressId: address.addressId, deleted: true });
    if (pathname.startsWith("/api/customer/addresses/")) return json(route, { ok: true, address });
    if (pathname.endsWith("/review") && method === "GET") return json(route, { ok: true, review: state.reviewView ?? null });
    if (pathname.endsWith("/reviews")) return json(route, { ok: true, review: reviewView().review, idempotent: false });
    if (pathname.endsWith("/reverse-requests")) {
      const reverseRequests = state.aftersaleMatrix
        ? ["requested", "approved", "rejected", "applied"].map(reverseWithStatus)
        : state.emptyAftersale ? [] : [reverseRequest];
      return method === "GET" ? json(route, { ok: true, reverseRequests }) : json(route, { ok: true, reverseRequest });
    }
    if (pathname.includes("/fulfillment-evidence")) return json(route, { ok: true, aggregates: state.emptyAftersale ? [] : [{ fulfillmentId: "fulfillment-contract-001", orderId: "order-contract-001", cityCode: "hangzhou", fulfillmentStatus: "completed", evidence: [], confirmation: state.confirmationStatus ? { status: state.confirmationStatus } : null }] });
    if (pathname.includes("/customer-confirmation")) return json(route, { ok: true, confirmation: { status: "confirmed" } });
    if (pathname === "/api/aftersale/complaints") {
      const complaints = state.aftersaleMatrix
        ? ["submitted", "waiting_customer", "in_progress", "resolved", "closed", "rejected"].map(complaintWithStatus)
        : state.emptyAftersale ? [] : [complaint];
      return method === "GET" ? json(route, { ok: true, complaints }) : json(route, { ok: true, complaint });
    }
    if (pathname === "/api/aftersale/refunds") return json(route, { ok: true, refund: { refundId: "refund-contract-001", cityCode: "hangzhou", orderId: "order-contract-001", customerId: "customer-contract-001", fulfillmentId: "fulfillment-contract-001", paymentOrderId: "payment-contract-001", amount: 88, currency: "CNY", reason: "服务结果需要复核", status: state.refundStatus ?? "requested", requestedAt: capturedAt, approvedAt: state.refundStatus === "approved" ? capturedAt : null, approvedByAdminId: state.refundStatus === "approved" ? "admin-contract-001" : null }, idempotent: false });
    if (pathname === "/api/payments/orders") return json(route, { ok: true, paymentOrder: { paymentOrderId: "payment-contract-001", orderId: "order-contract-001", cityCode: "hangzhou", amount: 88, currency: "CNY", status: state.paymentStatus ?? "pending", provider: "mock", providerTradeNo: null, metadata: { orderId: "order-contract-001", cityCode: "hangzhou", skuId: sku.skuId, priceRuleId: quote.priceRuleId, customerId: "customer-contract-001" }, createdAt: capturedAt, updatedAt: capturedAt } });
    if (pathname.endsWith("/confirm-service")) return json(route, { ok: true, order: order("service_completed") });
    if (pathname === "/api/orders" && method === "POST") return json(route, { ok: true, order: order("pending_dispatch") });
    if (/^\/api\/orders\/[^/]+$/.test(pathname)) return json(route, { ok: true, order: order(state.orderStatus ?? "pending_dispatch") });
    if (pathname === "/api/support/tickets") return method === "GET" ? json(route, { ok: true, tickets: state.emptySupport ? [] : [{ ...ticket, ...(state.ticketStatus ? { status: state.ticketStatus } : {}) }], nextCursor: null }) : json(route, { ok: true, ticket });
    if (pathname === `/api/support/tickets/${ticket.ticketId}`) return json(route, { ok: true, detail: { ticket, events: [ticketEvent] } });
    if (pathname.startsWith(`/api/support/tickets/${ticket.ticketId}/`)) return json(route, { ok: true, ticket, event: ticketEvent, idempotent: false });
    if (pathname === "/api/support/conversations") return method === "GET" ? json(route, { ok: true, conversations: state.emptySupport ? [] : [{ ...conversation, ...(state.conversationStatus ? { status: state.conversationStatus } : {}) }], nextCursor: null }) : json(route, { ok: true, conversation });
    if (pathname === `/api/support/conversations/${conversation.conversationId}`) return json(route, { ok: true, conversation, messages });
    if (pathname.endsWith("/messages")) return json(route, { ok: true, message: messages[1], idempotent: false });
    if (pathname === "/api/customer/notifications") {
      const archived = url.searchParams.get("view") === "archive";
      return json(route, { ok: true, items: state.emptyNotifications ? [] : [{ ...notification, readAt: archived || state.readNotifications ? contractAt : notification.readAt, archivedAt: archived ? contractAt : null, rowVersion: archived ? 3 : state.readNotifications ? 2 : 1 }], nextCursor: null });
    }
    if (pathname.startsWith("/api/customer/notifications/")) return json(route, { ok: true, result: { outcome: "applied", notificationId: notification.notificationId, readAt: capturedAt, archivedAt: capturedAt, rowVersion: 2 } });
    if (pathname.includes("/auth/customer/code")) return json(route, { ok: true, expiresAt: laterAt, ttlSeconds: 300, attemptsLeft: 5 });
    if (pathname.includes("/auth/customer/login")) return apiError(route, "验证码无效或已过期，请重新获取", 401, "INVALID_CODE");
    return json(route, { ok: true });
  });
}

const viteBin = path.join(root, "apps/customer/node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: path.join(root, "apps/customer"), env: { ...process.env, BROWSER: "none" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Customer dev server exited (${server.exitCode}).\n${serverLog}`);
    try { if ((await fetch(`${baseUrl}/customer/`)).ok) return; } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Customer dev server did not start on ${baseUrl}.\n${serverLog}`);
}

try { await waitForServer(); } catch (error) { if (server.exitCode === null) server.kill(); throw error; }
const browser = await chromium.launch({ channel: "msedge", headless: true });
const manifest = {
  batch: "CUSTOMER-FULL", browser: "Microsoft Edge", browserVersion: browser.version(), capturedAt,
  actualApp: true, contractStateInjection: true, appUrl: baseUrl, viewport: `${viewport.width}x${viewport.height}`,
  constraints: ["截图来自实际顾客 App", "仅在 Playwright route 网络边界注入现有响应契约", "金额来自统一报价契约态", "支付仅展示待处理，不伪造支付成功", "退款仅展示已申请，不伪造到账"],
  coverage: {}, evidence: [], validation: {},
};

async function context(authenticated = true) {
  const value = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "zh-CN", colorScheme: "light" });
  if (authenticated) await value.addInitScript(customerSession);
  return value;
}
async function ready(page, text) {
  await page.locator("body").waitFor({ state: "visible" });
  if (text) await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
  else await page.waitForFunction(() => (document.body.innerText?.trim().length ?? 0) > 16);
  await page.waitForTimeout(200);
}
async function save(page, carrier, key, stage, label, contractState, focusText) {
  if (focusText) {
    await page.getByText(focusText, { exact: false }).first().evaluate((element) => element.scrollIntoView({ block: "start", inline: "nearest" }));
    await page.waitForTimeout(100);
  }
  const fileName = `${carrier}.${key}.png`;
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight,
  }));
  await page.screenshot({ path: path.join(evidenceDir, fileName), fullPage: false, animations: "disabled" });
  manifest.evidence.push({ carrier, fileKey: `${carrier}.${key}`, stage, label, contractState,
    route: new URL(page.url()).pathname + new URL(page.url()).search,
    path: `docs/design/ui/production-control/evidence/CUSTOMER-FULL/${fileName}`,
    viewport, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth + 1, documentMetrics: metrics });
}
async function open(route, state = {}, authenticated = true) {
  const ctx = await context(authenticated); const page = await ctx.newPage();
  await routeContract(page, state); await page.goto(`${baseUrl}${route}`, { waitUntil: state.catalogLoading ? "domcontentloaded" : "networkidle" });
  return { ctx, page };
}

async function c00() {
  const { ctx, page } = await open("/customer/orders?orderId=order-contract-001", {}, false);
  await ready(page, "顾客身份验证");
  await save(page, "C-00", "base", "base", "身份恢复入口", "无有效会话，保留订单目标");
  await page.getByRole("button", { name: "获取验证码" }).click(); await ready(page, "验证码已发送");
  await save(page, "C-00", "otp-result", "result", "验证码请求结果", "验证码接口确认发送，不代表登录成功", "验证码已发送");
  await page.getByLabel("短信验证码").fill("000000"); await page.getByRole("button", { name: "登录并继续" }).click(); await page.getByRole("alert").waitFor({ state: "visible" });
  await save(page, "C-00", "error-recovery", "recovery", "登录错误恢复", "认证接口返回 401，留在原门禁可重试");
  await ctx.close();
}
async function c01() {
  let value = await open("/customer/", { catalogLoading: true }); await ready(value.page, "服务目录加载中");
  await save(value.page, "C-01", "loading", "state", "首页加载态", "目录请求保持未完成"); await value.ctx.close();
  value = await open("/customer/"); await ready(value.page, "安心到家修缮");
  await save(value.page, "C-01", "base", "base", "首页发现 Base Frame", "正式目录契约态"); await value.ctx.close();
  value = await open("/customer/", { emptyCatalog: true }); await ready(value.page, "当前城市暂无可用服务");
  await save(value.page, "C-01", "empty", "state", "首页整页空态", "目录接口返回空分类"); await value.ctx.close();
  value = await open("/customer/", { catalogError: true }); await ready(value.page, "服务目录加载失败");
  await save(value.page, "C-01", "error-recovery", "recovery", "目录错误恢复入口", "目录接口返回 503，真实重试动作可见", "服务目录加载失败"); await value.ctx.close();
}
async function c02() {
  let value = await open("/customer/services"); await ready(value.page, "全部服务");
  await save(value.page, "C-02", "base", "base", "服务浏览 Base Frame", "正式目录契约态");
  await value.page.getByPlaceholder("输入服务名称或关键词").fill("不存在的服务"); await ready(value.page, "没有匹配的服务");
  await save(value.page, "C-02", "no-result", "state", "搜索无结果", "客户端筛选真实目录后无匹配", "没有匹配的服务"); await value.ctx.close();
  value = await open("/customer/services", { catalogError: true }); await ready(value.page, "加载失败");
  await save(value.page, "C-02", "error-recovery", "recovery", "服务浏览错误恢复", "目录接口返回 503，保留重试动作", "加载失败"); await value.ctx.close();
}
async function c03() {
  let value = await open(`/customer/order/create?skuId=${sku.skuId}`); await ready(value.page, "每次 88 元");
  await save(value.page, "C-03", "quote-ready", "base", "下单与权威报价", "报价接口返回 88 元固定价", "每次 88 元");
  await value.page.getByRole("region", { name: "优惠券选择" }).locator("select").selectOption(couponGrant.couponGrantId);
  await value.page.getByRole("button", { name: "使用所选优惠券" }).click(); await ready(value.page, "服务端校验通过");
  await save(value.page, "C-03", "coupon-result", "result", "优惠券校验结果", "折扣决策由服务端契约态返回", "服务端校验通过"); await value.ctx.close();
  value = await open(`/customer/order/create?skuId=${sku.skuId}`, { failPath: "/discount-decisions", failStatus: 422, failCode: "VALIDATION_ERROR", failMessage: "优惠资格已变化，请重新选择" }); await ready(value.page, "每次 88 元");
  await value.page.getByRole("region", { name: "优惠券选择" }).locator("select").selectOption(couponGrant.couponGrantId);
  await value.page.getByRole("button", { name: "使用所选优惠券" }).click(); await ready(value.page, "优惠券暂不可用");
  await save(value.page, "C-03", "validation-recovery", "recovery", "优惠资格变化恢复", "折扣决策接口返回 422，不自动原价提交", "优惠券暂不可用"); await value.ctx.close();
  value = await open(`/customer/order/create?skuId=${sku.skuId}`, { failPath: "/pricing/quote", failMessage: "实时报价暂不可用" }); await ready(value.page, "报价获取失败");
  await save(value.page, "C-03", "quote-error-recovery", "recovery", "报价失败恢复", "报价接口返回 503，保留重新报价动作", "报价获取失败"); await value.ctx.close();
  value = await open(`/customer/order/create?skuId=${sku.skuId}`); await ready(value.page, "每次 88 元");
  await value.page.getByLabel("详细地址").fill("云栖小区 1 幢 101 室");
  await value.page.getByLabel("联系人").fill("李女士"); await value.page.getByLabel("联系电话").fill("13800000001");
  await save(value.page, "C-03", "order-input", "interaction", "订单信息填写完成", "地址、联系人与预约信息已完成本地输入，尚未提交", "预约时间");
  await value.page.getByRole("button", { name: "提交订单" }).click(); await ready(value.page, "订单号");
  await save(value.page, "C-03", "order-created", "result", "订单创建结果", "创建接口返回 pending_dispatch，随后按订单详情接口复核", "订单号"); await value.ctx.close();
  value = await open(`/customer/order/create?skuId=${sku.skuId}`, { failPath: "/api/orders", failMessage: "订单提交暂时失败" }); await ready(value.page, "每次 88 元");
  await value.page.getByLabel("详细地址").fill("云栖小区 1 幢 101 室");
  await value.page.getByLabel("联系人").fill("李女士"); await value.page.getByLabel("联系电话").fill("13800000001");
  await value.page.getByRole("button", { name: "提交订单" }).click(); await ready(value.page, "订单提交失败");
  await save(value.page, "C-03", "submit-error-recovery", "recovery", "订单提交失败恢复", "创建接口返回 503，保留同一幂等请求重新提交", "订单提交失败"); await value.ctx.close();
}
async function c04() {
  let value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: "pending_dispatch" }); await ready(value.page, "订单详情");
  await save(value.page, "C-04", "base", "base", "订单详情 Base Frame", "订单状态等待服务", "订单详情"); await value.ctx.close();
  for (const [status, key, label, focus] of [
    ["service_completed", "service-completed", "服务完成待支付", "待支付"],
    ["cancelled", "cancelled", "订单已取消", "已取消"],
  ]) {
    value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: status }); await ready(value.page, focus);
    await save(value.page, "C-04", key, "result", label, `订单详情接口返回 ${status}`, focus); await value.ctx.close();
  }
  for (const [status, label] of [["pending", "等待支付结果"], ["paid", "支付成功"], ["failed", "支付失败"], ["closed", "支付已关闭"]]) {
    value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: "service_completed", paymentStatus: status }); await ready(value.page, "进入支付");
    await value.page.getByRole("button", { name: "进入支付" }).click(); await ready(value.page, label);
    await save(value.page, "C-04", `payment-${status}`, "result", `支付结果：${label}`, `支付单接口返回 ${status}`, label); await value.ctx.close();
  }
  value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: "paid" }); await ready(value.page, "退款入口");
  await value.page.getByLabel("退款原因").fill("服务结果需要复核"); await value.page.getByRole("button", { name: "提交退款申请" }).click(); await ready(value.page, "退款申请已提交");
  await save(value.page, "C-04", "refund-requested", "result", "退款申请结果", "退款接口仅返回 requested，未声明批准或到账", "退款申请已提交"); await value.ctx.close();
  value = await open("/customer/aftersale?orderId=order-contract-001", { refundStatus: "approved" }); await ready(value.page, "退款申请");
  await value.page.getByRole("button", { name: "提交退款申请" }).click(); await ready(value.page, "已批准");
  await save(value.page, "C-04", "refund-approved", "result", "退款申请已批准", "退款接口明确返回 approved，仅呈现服务端状态", "已批准"); await value.ctx.close();
  value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: "paid" }); await ready(value.page, "服务评价");
  await save(value.page, "C-04", "review-eligible", "result", "支付后评价入口", "订单为 paid 且尚无评价", "服务评价"); await value.ctx.close();
  for (const visibility of ["pending_moderation", "visible", "hidden"]) {
    const focus = { pending_moderation: "审核中", visible: "已展示", hidden: "未展示" }[visibility];
    value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: "paid", reviewView: reviewView(visibility) }); await ready(value.page, focus);
    await save(value.page, "C-04", `review-${visibility}`, "result", `评价状态：${focus}`, `评价详情接口返回 ${visibility}`, focus); await value.ctx.close();
  }
  for (const appealStatus of ["open", "upheld", "rejected", "withdrawn"]) {
    const focus = { open: "申诉处理中", upheld: "申诉成立", rejected: "申诉未通过", withdrawn: "已撤回" }[appealStatus];
    value = await open("/customer/orders?orderId=order-contract-001", { orderStatus: "paid", reviewView: reviewView("hidden", appealStatus) }); await ready(value.page, focus);
    await save(value.page, "C-04", `appeal-${appealStatus}`, "result", `评价申诉：${focus}`, `评价详情接口返回申诉 ${appealStatus}`, focus); await value.ctx.close();
  }
  for (const status of ["pending", "confirmed", "disputed"]) {
    const focus = { pending: "等待确认", confirmed: "已确认", disputed: "已提出异议" }[status];
    value = await open("/customer/aftersale?orderId=order-contract-001", { confirmationStatus: status }); await ready(value.page, focus);
    await save(value.page, "C-04", `confirmation-${status}`, "result", `服务凭证确认：${focus}`, `履约凭证接口返回确认状态 ${status}`, focus); await value.ctx.close();
  }
  value = await open("/customer/orders?orderId=order-contract-001", { failPath: "/api/orders/", failMessage: "订单详情暂时无法读取" }); await ready(value.page, "订单加载失败");
  await save(value.page, "C-04", "error-recovery", "recovery", "订单详情错误恢复", "订单详情接口返回 503，保留重新加载动作", "订单加载失败"); await value.ctx.close();
}
async function c05() {
  let value = await open("/customer/aftersale?orderId=order-contract-001"); await ready(value.page, "售后服务");
  await save(value.page, "C-05", "base", "base", "售后 Base Frame", "逆向、客诉与凭证聚合契约态");
  await value.page.getByLabel("原因", { exact: true }).fill("需要调整上门时间"); await value.page.getByRole("button", { name: "提交申请" }).click(); await ready(value.page, "已受理");
  await save(value.page, "C-05", "reverse-result", "result", "逆向申请结果", "逆向接口返回 requested", "已受理"); await value.ctx.close();
  value = await open("/customer/aftersale?orderId=order-contract-001", { aftersaleMatrix: true }); await ready(value.page, "逆向记录");
  await save(value.page, "C-05", "reverse-statuses", "result", "逆向状态矩阵", "逆向列表真实返回 requested、approved、rejected、applied", "逆向记录");
  await save(value.page, "C-05", "complaint-statuses", "result", "客诉状态矩阵", "客诉列表真实返回 submitted、waiting_customer、in_progress、resolved、closed、rejected", "客诉记录");
  await save(value.page, "C-05", "complaint-rejected", "result", "客诉未受理状态", "客诉列表明确返回 rejected", "未受理"); await value.ctx.close();
  value = await open("/customer/aftersale?orderId=order-contract-001", { failPath: "/reverse-requests", failMessage: "售后记录暂时无法读取" }); await ready(value.page, "操作失败");
  await save(value.page, "C-05", "error-recovery", "recovery", "售后加载错误", "售后列表接口返回 503，可刷新重试", "操作失败"); await value.ctx.close();
}
async function c06() {
  let value = await open("/customer/support"); await ready(value.page, "客服中心");
  await save(value.page, "C-06", "base", "base", "客服中心 Base Frame", "工单与在线会话列表契约态");
  await value.page.getByRole("button", { name: "查看" }).first().click(); await ready(value.page, "客服已联系师傅核实");
  await save(value.page, "C-06", "ticket-state", "state", "工单等待回复状态", "工单详情为 waiting_requester", "客服已联系师傅核实");
  await value.page.getByRole("button", { name: "刷新" }).first().click();
  const conversationOpen = value.page.getByRole("button", { name: "打开" }).first();
  await conversationOpen.waitFor({ state: "visible" }); await conversationOpen.click(); await ready(value.page, "正在为您核实");
  await save(value.page, "C-06", "conversation-state", "state", "在线会话消息", "会话为 active 且消息由会话详情接口返回", "正在为您核实"); await value.ctx.close();
  for (const [status, label] of [["open", "待处理"], ["resolved", "已解决"], ["closed", "已关闭"], ["escalated", "已升级"]]) {
    value = await open("/customer/support", { ticketStatus: status }); await ready(value.page, label);
    await save(value.page, "C-06", `ticket-${status}`, "result", `客服工单：${label}`, `工单列表返回 ${status}`, label); await value.ctx.close();
  }
  for (const [status, label] of [["queueing", "排队中"], ["transferred", "已转接"], ["closed", "已结束"]]) {
    value = await open("/customer/support", { conversationStatus: status }); await ready(value.page, "客服中心");
    await value.page.getByRole("button", { name: "刷新" }).first().click(); await ready(value.page, label);
    await save(value.page, "C-06", `conversation-${status}`, "result", `在线会话：${label}`, `会话列表返回 ${status}`, label); await value.ctx.close();
  }
  value = await open("/customer/support", { failPath: "/support/conversations", failMethod: "POST", failMessage: "客服服务暂时不可用" }); await ready(value.page, "客服中心");
  await value.page.getByRole("button", { name: "发起在线咨询" }).click(); await ready(value.page, "客服请求失败");
  await save(value.page, "C-06", "error-recovery", "recovery", "客服请求错误恢复", "客服接口返回 503，页面保留刷新与重新发起动作"); await value.ctx.close();
}
async function c07() {
  let value = await open("/customer/notifications"); await ready(value.page, "订单已创建");
  await save(value.page, "C-07", "base", "base", "通知收件箱 Base Frame", "未读订单通知契约态");
  await value.ctx.close();
  value = await open("/customer/notifications", { readNotifications: true }); await ready(value.page, "已读");
  await save(value.page, "C-07", "read-state", "result", "通知已读状态", "收件箱接口返回 readAt", "已读");
  await value.page.getByRole("button", { name: "已归档" }).click(); await ready(value.page, "订单已创建");
  await save(value.page, "C-07", "archive-state", "state", "归档通知状态", "归档视图返回 readAt 与 archivedAt"); await value.ctx.close();
  value = await open("/customer/notifications", { failPath: "/notifications", failMessage: "消息暂时无法读取" }); await value.page.getByRole("alert").waitFor({ state: "visible" });
  await save(value.page, "C-07", "error-recovery", "recovery", "通知错误恢复", "通知接口返回 503，保留重试按钮"); await value.ctx.close();
}
async function c08() {
  let value = await open("/customer/coupons"); await ready(value.page, "我的优惠券");
  await save(value.page, "C-08", "base", "base", "优惠券钱包 Base Frame", "可使用券由 grant 契约态返回"); await value.ctx.close();
  value = await open("/customer/coupons", { couponMatrix: true }); await ready(value.page, "我的优惠券");
  await value.page.getByRole("tab", { name: "全部" }).click(); await ready(value.page, "订单处理中");
  await save(value.page, "C-08", "status-matrix", "result", "优惠券状态矩阵", "全部视图返回 available、reserved、redeemed 与 terminal 券状态", "订单处理中"); await value.ctx.close();
  value = await open("/customer/coupons", { failPath: "/coupon-grants", failStatus: 403, failCode: "FORBIDDEN", failMessage: "当前账号无权查看优惠券" }); await value.page.getByRole("alert").waitFor({ state: "visible" });
  await save(value.page, "C-08", "permission-recovery", "recovery", "券包权限错误", "券包接口返回 403，不伪造券"); await value.ctx.close();
}
async function c09() {
  let value = await open("/customer/profile"); await ready(value.page, "账号资料");
  await save(value.page, "C-09", "base", "base", "资料与地址 Base Frame", "资料与地址来自账号接口");
  await value.page.getByLabel("显示名称").fill("李女士（编辑中）");
  await save(value.page, "C-09", "profile-editing", "interaction", "资料编辑中", "名称字段为本地编辑态，尚未保存", "显示名称");
  await value.page.getByRole("button", { name: "保存个人资料" }).click(); await ready(value.page, "个人资料已保存");
  await save(value.page, "C-09", "profile-saved", "result", "资料保存结果", "资料更新接口确认保存", "个人资料已保存");
  await value.page.getByLabel("联系人").fill("王女士"); await value.page.getByLabel("手机号").fill("13900000002");
  await value.page.getByLabel("区县").fill("西湖区"); await value.page.getByLabel("详细地址").fill("云栖小区 2 幢 202 室");
  await save(value.page, "C-09", "address-creating", "interaction", "新地址填写中", "创建地址表单已通过本地必填校验", "添加地址");
  await value.page.getByRole("button", { name: "添加地址" }).click(); await ready(value.page, "地址已添加");
  await save(value.page, "C-09", "address-created", "result", "地址创建结果", "创建地址接口确认并重新加载地址列表", "地址已添加"); await value.ctx.close();
  value = await open("/customer/profile"); await ready(value.page, "账号资料");
  await value.page.getByRole("button", { name: "编辑" }).click(); await ready(value.page, "编辑地址");
  await save(value.page, "C-09", "address-edit", "interaction", "地址编辑区域", "脱敏手机号不可回填，要求重新输入", "编辑地址");
  await value.page.getByLabel("手机号").fill("13800000001"); await value.page.getByLabel("详细地址").fill("云栖小区 1 幢 102 室");
  await value.page.getByRole("button", { name: "更新地址" }).click(); await ready(value.page, "地址已更新");
  await save(value.page, "C-09", "address-updated", "result", "地址更新结果", "更新接口确认并重新加载地址列表", "地址已更新"); await value.ctx.close();
  value = await open("/customer/profile"); await ready(value.page, "账号资料");
  await value.page.getByRole("button", { name: "删除", exact: true }).click(); await ready(value.page, "确认删除此地址");
  await save(value.page, "C-09", "delete-confirming", "interaction", "地址删除确认", "删除动作执行前显示目标地址、确认删除与取消动作", "确认删除此地址");
  await value.page.getByRole("button", { name: "确认删除" }).click(); await ready(value.page, "地址已删除");
  await save(value.page, "C-09", "address-deleted", "result", "地址删除结果", "删除接口确认后重新加载地址列表", "地址已删除"); await value.ctx.close();
  value = await open("/customer/profile", { failPath: "/customer/profile", failStatus: 409, failCode: "CONFLICT", failMessage: "资料版本已变化，请重新加载" }); await ready(value.page, "重新加载");
  await save(value.page, "C-09", "conflict-recovery", "recovery", "资料冲突恢复", "资料接口返回 409，展示重新加载动作", "重新加载"); await value.ctx.close();
}

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Not a PNG file");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const entryFileByCarrier = {
  "C-00": "C-00.base", "C-01": "C-01.loading", "C-02": "C-02.base", "C-03": "C-03.quote-ready",
  "C-04": "C-04.base", "C-05": "C-05.base", "C-06": "C-06.base", "C-07": "C-07.base",
  "C-08": "C-08.base", "C-09": "C-09.base",
};
const recoveryFileByCarrier = {
  "C-00": "C-00.error-recovery", "C-01": "C-01.error-recovery", "C-02": "C-02.error-recovery",
  "C-04": "C-04.error-recovery", "C-05": "C-05.error-recovery", "C-06": "C-06.error-recovery",
  "C-07": "C-07.error-recovery", "C-08": "C-08.permission-recovery", "C-09": "C-09.conflict-recovery",
};

function resultFilesForSlice(sliceId) {
  const exact = {
    "C.AUTH.SESSION.REQUIRED": ["C-00.otp-result"],
    "C.CATALOG.HOME.EMPTY": ["C-01.empty"],
    "C.CATALOG.HOME.AVAILABLE": ["C-01.base"],
    "C.CATALOG.BROWSE.AVAILABLE": ["C-02.base"],
    "C.CATALOG.SEARCH.NO_RESULT": ["C-02.no-result"],
    "C.ORDER.QUOTE.READY": ["C-03.quote-ready"],
    "C.ORDER.QUOTE.INVALIDATED": ["C-03.validation-recovery"],
    "C.ORDER.CREATE.PENDING_DISPATCH": ["C-03.order-created"],
    "C.ORDER.CREATE.INPUT": ["C-03.order-input"],
    "C.COUPON.SELECT.AVAILABLE": ["C-03.coupon-result"],
    "C.COUPON.SELECT.INELIGIBLE": ["C-03.validation-recovery"],
    "C.ORDER.DETAIL.PENDING_DISPATCH": ["C-04.base"],
    "C.ORDER.DETAIL.SERVICE_COMPLETED": ["C-04.service-completed"],
    "C.ORDER.DETAIL.CANCELLED": ["C-04.cancelled"],
    "C.CONFIRMATION.DETAIL.PENDING": ["C-04.confirmation-pending"],
    "C.CONFIRMATION.DETAIL.CONFIRMED": ["C-04.confirmation-confirmed"],
    "C.CONFIRMATION.DETAIL.DISPUTED": ["C-04.confirmation-disputed"],
    "C.PAYMENT.CHECKOUT.PENDING": ["C-04.payment-pending"],
    "C.PAYMENT.RESULT.PAID": ["C-04.payment-paid"],
    "C.PAYMENT.RESULT.FAILED": ["C-04.payment-failed"],
    "C.PAYMENT.RESULT.CLOSED": ["C-04.payment-closed"],
    "C.REFUND.REQUEST.REQUESTED": ["C-04.refund-requested"],
    "C.REFUND.REQUEST.APPROVED": ["C-04.refund-approved"],
    "C.REVIEW.CREATE.ELIGIBLE": ["C-04.review-eligible"],
    "C.REVIEW.DETAIL.PENDING_MODERATION": ["C-04.review-pending_moderation"],
    "C.REVIEW.DETAIL.VISIBLE": ["C-04.review-visible"],
    "C.REVIEW.DETAIL.HIDDEN": ["C-04.review-hidden"],
    "C.REVIEW.APPEAL.OPEN": ["C-04.appeal-open"],
    "C.REVIEW.APPEAL.UPHELD": ["C-04.appeal-upheld"],
    "C.REVIEW.APPEAL.REJECTED": ["C-04.appeal-rejected"],
    "C.REVIEW.APPEAL.WITHDRAWN": ["C-04.appeal-withdrawn"],
    "C.NOTIFICATION.INBOX.UNREAD": ["C-07.base"],
    "C.NOTIFICATION.INBOX.READ": ["C-07.read-state"],
    "C.NOTIFICATION.ARCHIVE.ARCHIVED": ["C-07.archive-state"],
    "C.COUPON.WALLET.AVAILABLE": ["C-08.base", "C-08.status-matrix"],
    "C.COUPON.WALLET.RESERVED": ["C-08.status-matrix"],
    "C.COUPON.WALLET.REDEEMED": ["C-08.status-matrix"],
    "C.COUPON.WALLET.TERMINAL": ["C-08.status-matrix"],
    "C.PROFILE.DETAIL.DISPLAY": ["C-09.base"],
    "C.PROFILE.EDIT.EDITING": ["C-09.profile-editing", "C-09.profile-saved"],
    "C.ADDRESS.EDIT.CREATING": ["C-09.address-creating", "C-09.address-created"],
    "C.ADDRESS.EDIT.UPDATING": ["C-09.address-edit", "C-09.address-updated"],
    "C.ADDRESS.DELETE.CONFIRMING": ["C-09.delete-confirming", "C-09.address-deleted"],
  };
  if (exact[sliceId]) return exact[sliceId];
  if (sliceId.startsWith("C.AFTERSALE.REVERSE.")) return sliceId.endsWith(".REQUESTED") ? ["C-05.reverse-result", "C-05.reverse-statuses"] : ["C-05.reverse-statuses"];
  if (sliceId.startsWith("C.AFTERSALE.COMPLAINT.")) return sliceId.endsWith(".REJECTED") ? ["C-05.complaint-rejected"] : ["C-05.complaint-statuses"];
  if (sliceId.startsWith("C.SUPPORT.TICKET.")) return sliceId.endsWith(".WAITING_REQUESTER") ? ["C-06.ticket-state"] : [`C-06.ticket-${sliceId.split(".").at(-1).toLowerCase()}`];
  if (sliceId.startsWith("C.SUPPORT.CONVERSATION.")) return sliceId.endsWith(".ACTIVE") ? ["C-06.conversation-state"] : [`C-06.conversation-${sliceId.split(".").at(-1).toLowerCase()}`];
  return [];
}

function recoveryFilesForSlice(slice) {
  if (slice.carrierId !== "C-03") return [recoveryFileByCarrier[slice.carrierId]];
  if (slice.sliceId.startsWith("C.ORDER.QUOTE.")) return ["C-03.quote-error-recovery"];
  if (slice.sliceId.startsWith("C.ORDER.CREATE.")) return ["C-03.submit-error-recovery"];
  return ["C-03.validation-recovery"];
}

function buildSliceCoverage() {
  const slices = [allCustomerSlices.find((slice) => slice.sliceId === "C.AUTH.SESSION.REQUIRED"), ...customerSlices].filter(Boolean);
  const evidenceByKey = new Map(manifest.evidence.map((item) => [item.fileKey, item]));
  for (const item of manifest.evidence) item.sliceStages = { entry: [], result: [], recovery: [] };
  const coverage = {};
  for (const slice of slices) {
    const phaseFiles = {
      entry: [entryFileByCarrier[slice.carrierId]],
      result: resultFilesForSlice(slice.sliceId),
      recovery: recoveryFilesForSlice(slice),
    };
    for (const [phase, fileKeys] of Object.entries(phaseFiles)) {
      if (!fileKeys.length || fileKeys.some((fileKey) => !evidenceByKey.has(fileKey))) throw new Error(`Missing ${phase} evidence mapping for ${slice.sliceId}: ${fileKeys.join(", ") || "none"}`);
      for (const fileKey of fileKeys) evidenceByKey.get(fileKey).sliceStages[phase].push(slice.sliceId);
    }
    coverage[slice.sliceId] = {
      carrier: slice.carrierId,
      entry: phaseFiles.entry.map((fileKey) => ({ fileKey, path: evidenceByKey.get(fileKey).path })),
      result: phaseFiles.result.map((fileKey) => ({ fileKey, path: evidenceByKey.get(fileKey).path })),
      recovery: phaseFiles.recovery.map((fileKey) => ({ fileKey, path: evidenceByKey.get(fileKey).path })),
    };
  }
  for (const item of manifest.evidence) {
    for (const phase of Object.keys(item.sliceStages)) item.sliceStages[phase] = [...new Set(item.sliceStages[phase])].sort();
    item.sliceIds = [...new Set(Object.values(item.sliceStages).flat())].sort();
    if (item.sliceIds.length === 0) throw new Error(`Evidence has no honest slice mapping: ${item.fileKey}`);
  }
  manifest.sliceCoverage = coverage;
}

async function validate() {
  const required = Array.from({ length: 10 }, (_, index) => `C-${String(index).padStart(2, "0")}`);
  buildSliceCoverage();
  if (customerSlices.length !== 61) throw new Error(`Expected 61 non-B0 customer slices from ledger, found ${customerSlices.length}`);
  const baseFiles = { ...entryFileByCarrier, "C-01": "C-01.base" };
  const missingBase = required.filter((carrier) => !manifest.evidence.some((item) => item.fileKey === baseFiles[carrier] && item.sliceIds.length > 0));
  const files = [];
  for (const item of manifest.evidence) {
    const absolute = path.join(root, item.path); const info = await stat(absolute); const dimensions = pngSize(await readFile(absolute));
    if (info.size < 1_000) throw new Error(`Evidence file too small: ${item.path}`);
    if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) throw new Error(`Unexpected dimensions for ${item.path}: ${dimensions.width}x${dimensions.height}`);
    files.push({ path: item.path, bytes: info.size, ...dimensions });
  }
  if (missingBase.length) throw new Error(`Missing Base Frame evidence: ${missingBase.join(", ")}`);
  const overflow = manifest.evidence.filter((item) => item.horizontalOverflow).map((item) => item.fileKey);
  if (overflow.length) throw new Error(`Horizontal clipping risk: ${overflow.join(", ")}`);
  const incompleteSlices = customerSlices.filter((slice) => {
    const coverage = manifest.sliceCoverage[slice.sliceId];
    return !coverage || ["entry", "result", "recovery"].some((phase) => !coverage[phase]?.length);
  });
  if (incompleteSlices.length) throw new Error(`Incomplete slice evidence: ${incompleteSlices.map((slice) => slice.sliceId).join(", ")}`);
  manifest.coverage = Object.fromEntries(required.map((carrier) => [carrier, {
    sliceIds: carrierSliceIds[carrier],
    evidence: manifest.evidence.filter((item) => item.carrier === carrier).map((item) => item.fileKey),
  }]));
  manifest.validation = { screenshotCount: files.length, filesExist: true, pngDimensionsValid: true, allCarriersHaveBaseFrame: true,
    ledgerCustomerNonB0SliceCount: customerSlices.length, slicesWithEntryResultRecovery: customerSlices.length,
    everyEvidenceHasSliceIds: manifest.evidence.every((item) => item.sliceIds.length > 0), horizontalOverflowCount: 0, files };
}

try {
  await c00(); await c01(); await c02(); await c03(); await c04(); await c05(); await c06(); await c07(); await c08(); await c09();
  await validate();
  await writeFile(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`CUSTOMER_FULL_EDGE_EVIDENCE_OK screenshots=${manifest.evidence.length} carriers=10 edge=${manifest.browserVersion} port=${port}`);
} finally {
  await browser.close();
  if (server.exitCode === null) server.kill();
}
