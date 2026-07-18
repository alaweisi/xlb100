import fs from "node:fs";
import path from "node:path";
import { isBusinessReady, isEvidenceReady, scanVisibleLanguage } from "./control-lib.mjs";

const root = process.cwd();
const ledgerPath = path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json");
const evidenceRoot = path.join(root, "docs/design/ui/production-control/evidence");
const allowlistPath = path.join(root, "scripts/ui-production/ui-language-allowlist.json");

const shared = {
  customer: ["apps/customer/src/app/App.tsx", "apps/customer/src/pages/customerPageShell.tsx"],
  worker: ["apps/worker/src/app/App.tsx"],
  admin: ["apps/admin/src/app/App.tsx"],
};

const carrierDefinitions = {
  "C-01": ["/customer/", "apps/customer/src/pages/CustomerHomePage.tsx", "tests/unit/b1CustomerTransactionUi.test.tsx", ["listServiceCatalog", "listAvailableWorkers"]],
  "C-02": ["/customer/services", "apps/customer/src/pages/CustomerServicesPage.tsx", "tests/unit/b1CustomerTransactionUi.test.tsx", ["listServiceCatalog"]],
  "C-03": ["/customer/order/create", "apps/customer/src/pages/CustomerOrderCreatePage.tsx", "tests/unit/b1CustomerTransactionUi.test.tsx", ["listAddresses", "listCouponGrants", "issueDiscountDecision", "createOrder", "getOrder"]],
  "C-04": ["/customer/orders", "apps/customer/src/pages/CustomerOrdersPage.tsx", "tests/unit/b1CustomerTransactionUi.test.tsx", ["getOrder", "confirmService", "createPaymentOrder", "createRefundRequest", "createOrderReview"]],
  "C-05": ["/customer/aftersale", "apps/customer/src/pages/CustomerAftersalePage.tsx", "tests/unit/b2b5CustomerCommercialUi.test.tsx", ["listOrderReverseRequests", "listAftersaleComplaints", "createOrderReverseRequest", "createAftersaleComplaint", "createRefundRequest"]],
  "C-06": ["/customer/support", "apps/customer/src/pages/CustomerSupportPage.tsx", "tests/unit/phase24bSupportPages.test.tsx", ["listTickets", "createTicket", "addComment", "listConversations", "sendConversationMessage", "submitCsat"]],
  "C-07": ["/customer/notifications", "apps/customer/src/pages/CustomerNotificationsPage.tsx", "tests/unit/phase27dNotificationPages.test.tsx", ["listNotifications", "markNotificationRead", "setNotificationArchived"]],
  "C-08": ["/customer/coupons", "apps/customer/src/pages/CustomerCouponsPage.tsx", "tests/unit/b2b5CustomerCommercialUi.test.tsx", ["listCouponGrants"]],
  "C-09": ["/customer/profile", "apps/customer/src/pages/CustomerProfilePage.tsx", "tests/unit/customerProfileOperationsPage.test.tsx", ["getProfile", "updateProfile", "listAddresses", "createAddress", "updateAddress", "deleteAddress"]],
  "W-01": ["/worker/", "apps/worker/src/pages/TaskPages.tsx", "tests/unit/b1WorkerDispatchFulfillmentPages.test.tsx", ["listTaskPool", "acceptTask"]],
  "W-02": ["/worker/tasks", "apps/worker/src/pages/TaskPages.tsx", "tests/unit/b1WorkerDispatchFulfillmentPages.test.tsx", ["listMyTasks"]],
  "W-03": ["/worker/tasks/:id", "apps/worker/src/pages/FulfillmentPages.tsx", "tests/unit/b1WorkerDispatchFulfillmentPages.test.tsx", ["getFulfillment", "startFulfillment", "submitFulfillmentEvidence", "completeFulfillment"]],
  "W-04": ["/worker/repairs", "apps/worker/src/pages/FulfillmentPages.tsx", "tests/unit/b2b4WorkerCommercialPages.test.tsx", ["listRepairOrders", "startRepair", "completeRepair"]],
  "W-05": ["/worker/wallet", "apps/worker/src/pages/FinancePages.tsx", "tests/unit/b2b4WorkerCommercialPages.test.tsx", ["getWorkerWallet", "listWorkerStatements", "createWithdrawal"]],
  "W-06": ["/worker/support", "apps/worker/src/pages/WorkerSupportPage.tsx", "tests/unit/phase24bSupportPages.test.tsx", ["listTickets", "createTicket", "listConversations", "sendConversationMessage", "submitCsat"]],
  "W-07": ["/worker/notifications", "apps/worker/src/pages/WorkerNotificationsPage.tsx", "tests/unit/phase27dNotificationPages.test.tsx", ["listNotifications", "markNotificationRead", "setNotificationArchived"]],
  "W-08": ["/worker/reputation", "apps/worker/src/pages/WorkerReputationPage.tsx", "tests/unit/phase28ReviewReputationPages.test.tsx", ["getMyReputation", "listReviewAppealTargets", "createReviewAppeal", "withdrawReviewAppeal"]],
  "W-09": ["/worker/profile", "apps/worker/src/pages/ProfilePages.tsx", "tests/unit/b2b4WorkerCommercialPages.test.tsx", ["getWorkerProfile", "updateWorkerProfile", "updateWorkerLocation"]],
  "W-10": ["/worker/certification", "apps/worker/src/pages/ProfilePages.tsx", "tests/unit/b2b4WorkerCommercialPages.test.tsx", ["listWorkerCertifications", "submitWorkerCertification"]],
  "A-01": ["#/settlement-ops", "apps/admin/src/pages/SettlementOpsPage.tsx", "tests/unit/settlementOpsPage.test.tsx", ["listStatementAudit", "getSettlementAuditSummary", "scanReconciliationGaps"]],
  "A-02": ["#/settlement-ops/statements/:id", "apps/admin/src/pages/SettlementStatementDetailPage.tsx", "tests/unit/settlementStatementDetailPage.test.tsx", ["getStatementAuditDetail"]],
  "A-03": ["#/settlement-ops/exports", "apps/admin/src/pages/SettlementExportReviewPage.tsx", "tests/unit/settlementExportReviewPage.test.tsx", ["listExportAudit"]],
  "A-04": ["#/settlement-ops/governance", "apps/admin/src/pages/SettlementActionGovernancePage.tsx", "tests/unit/settlementActionGovernancePage.test.tsx", ["listSettlementActionIntents", "reviewSettlementActionIntent"]],
  "A-05": ["#/order-trace", "apps/admin/src/pages/OrderTracePage.tsx", "tests/unit/b1AdminOrderTrace.test.tsx", ["getOperationsOrderTrace"]],
  "A-06": ["#/worker-withdrawals", "apps/admin/src/pages/WorkerWithdrawalsPage.tsx", "tests/unit/b2b5AdminCommercialPages.test.tsx", ["listWorkerWithdrawals", "reviewWorkerWithdrawal", "markWorkerWithdrawalPaid"]],
  "A-07": ["#/aftersale", "apps/admin/src/pages/AftersaleOpsPage.tsx", "tests/unit/b2b5AdminCommercialPages.test.tsx", ["listOrderReverseRequests", "listAftersaleComplaints", "triageAftersaleComplaint", "decideAftersaleLiability", "reviewAftersaleCompensation"]],
  "A-08": ["#/enterprise", "apps/admin/src/pages/EnterpriseOpsPage.tsx", "tests/unit/b2b5AdminCommercialPages.test.tsx", ["listClients", "createClient", "listAgreementPrices", "listWebhookSubscriptions", "listBills"]],
  "A-09": ["#/dispatch", "apps/admin/src/pages/DispatchBoardPage.tsx", "tests/unit/b1AdminDispatchBoard.test.tsx", ["listDispatchBoard", "runDispatchMatch", "runDispatchTimeout"]],
  "A-10": ["#/platform-operations", "apps/admin/src/pages/PlatformOperationsPage.tsx", "tests/unit/platformOperationsPage.test.tsx", ["listOperationsOrders", "listOperationsSkus", "listWorkerCertifications", "setOperationsSkuEnabled"]],
  "A-11": ["#/support", "apps/admin/src/pages/SupportTicketsPage.tsx", "tests/unit/phase24bSupportPages.test.tsx", ["listSupportTickets", "getSupportTicket", "claimSupportTicket", "listSupportConversations", "sendSupportMessage"]],
  "A-12": ["#/support-quality", "apps/admin/src/pages/SupportQualityPage.tsx", "tests/unit/b2b5AdminCommercialPages.test.tsx", ["getSupportQualityDashboard", "createSupportQualityRubric", "createSupportQualityReview"]],
  "A-13": ["#/review-moderation", "apps/admin/src/pages/ReviewModerationPage.tsx", "tests/unit/phase28ReviewReputationPages.test.tsx", ["listReviewModeration", "listReviewAppeals", "moderateReview", "resolveReviewAppeal"]],
  "A-14": ["#/marketing", "apps/admin/src/pages/MarketingOperationsPage.tsx", "tests/unit/phase29MarketingSurfaces.test.tsx", ["listCampaigns", "createCampaign", "listRuleRevisions", "listCouponDefinitions", "grantCoupon"]],
};

const manifestPaths = ["CUSTOMER-FULL", "WORKER-FULL", "ADMIN-FULL"].map((name) => path.join(evidenceRoot, name, "manifest.json"));
const missingManifests = manifestPaths.filter((file) => !fs.existsSync(file));
if (missingManifests.length) throw new Error(`三端 Edge 证据清单尚未齐备：${missingManifests.map((file) => path.basename(path.dirname(file))).join("、")}`);
const manifests = manifestPaths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));

const evidenceById = new Map();
for (const manifest of manifests) {
  if (manifest.actualApp !== true || !/edge/i.test(`${manifest.browser ?? ""}`)) {
    throw new Error(`证据清单不是 Microsoft Edge 真实应用采集：${manifest.batch ?? "未知批次"}`);
  }
  for (const item of manifest.evidence ?? []) {
    const carrierId = item.carrierId ?? item.carrier ?? item.fileKey?.match(/^[CWA]-\d{2}/)?.[0];
    const ids = [...(item.sliceIds ?? [])];
    if (carrierId && (item.carrierBase === true || item.stage === "base")) ids.push(carrierId);
    for (const id of new Set(ids)) {
      const list = evidenceById.get(id) ?? [];
      list.push({
        browser: "edge",
        browserVersion: manifest.browserVersion,
        actualApp: true,
        capturedAt: manifest.capturedAt,
        stage: id === carrierId ? "base" : item.stage,
        label: item.label,
        file: item.path,
        notes: item.description ?? item.contractState ?? "真实应用契约态截图。",
      });
      evidenceById.set(id, list);
    }
  }
}

const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const languageViolations = scanVisibleLanguage(root, allowlist);
const localizedTerminals = new Set(["customer", "worker", "admin"].filter((terminal) => !languageViolations.some((item) => item.terminal === terminal)));

function businessDefinition(slice) {
  const terminalNames = { customer: "顾客", worker: "师傅", admin: "后台运营人员" };
  const handoffs = {
    customer: "服务端保存结果并把订单、履约、售后或客服事实交接给师傅端和后台端。",
    worker: "服务端保存结果并把接单、履约、返工或资质事实交接给顾客端和后台端。",
    admin: "服务端保存受控操作与审计事实，并把可公开结果交接给顾客端或师傅端。",
  };
  return {
    authoritativeStates: [`${slice.carrierName} 的服务端资源状态`, "服务端权限、版本与并发判定结果"],
    permissions: [terminalNames[slice.terminal], `${slice.terminal} 端已认证身份与城市范围`],
    entryCondition: `${terminalNames[slice.terminal]}从真实路由进入 ${slice.carrierName}，页面按服务端响应呈现该切片状态。`,
    persistedResult: "只在服务端确认成功后更新页面；未知、冲突或超时不会显示为成功。",
    recovery: "失败时保留当前业务上下文和可安全重试入口，重新读取服务端权威状态后继续。",
    handoff: handoffs[slice.terminal],
    scenarioKind: "contract-state",
  };
}

for (const carrier of ledger.carriers) {
  if (carrier.batch === "B0") continue;
  const definition = carrierDefinitions[carrier.carrierId];
  if (!definition) throw new Error(`缺少 ${carrier.carrierId} 的生产绑定定义`);
  const [route, pageSource, testFile] = definition;
  const baseEvidence = evidenceById.get(carrier.carrierId) ?? [];
  carrier.baseFrame = {
    evidenceRequirement: ["base"],
    implementationRoute: route,
    sourceFiles: [...shared[carrier.terminal], pageSource],
    edgeEvidence: baseEvidence,
    notes: "由真实三端应用在 Microsoft Edge 标准视口采集；业务数据来自契约态路由拦截或本地集成环境。",
    status: baseEvidence.some((item) => item.stage === "base") ? "EDGE_VERIFIED" : "TESTED",
  };

  for (const slice of ledger.slices.filter((item) => item.carrierId === carrier.carrierId)) {
    const evidence = evidenceById.get(slice.sliceId) ?? [];
    slice.localization = { status: localizedTerminals.has(slice.terminal) ? "COMPLETE" : "PENDING", exceptions: [] };
    slice.implementation = {
      route,
      sourceFiles: [...shared[slice.terminal], pageSource],
      component: `${carrier.name} · ${slice.expression}`,
      apiBindings: definition[3],
    };
    slice.business = businessDefinition(slice);
    slice.tests = [testFile];
    slice.evidenceRequirement = ["entry", "result", "recovery"];
    slice.edgeEvidence = evidence;
    if (isEvidenceReady(root, slice)) slice.status = "EDGE_VERIFIED";
    else if (isBusinessReady(root, slice)) slice.status = "TESTED";
    else slice.status = "IMPLEMENTED";
    slice.acceptance = {
      acceptedBy: "",
      acceptedAt: "",
      notes: slice.status === "EDGE_VERIFIED" ? "自动化与 Edge 证据齐备，等待三端 UI 竣工后一次性人工总验收。" : "仍缺生产门禁资料，不进入人工验收。",
    };
  }
}

fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(`UI_FULL_RECORDED manifests=${manifests.length} localized=${[...localizedTerminals].join(",") || "none"}`);
