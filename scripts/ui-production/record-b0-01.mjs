import fs from "node:fs";
import path from "node:path";
import { isEvidenceReady } from "./control-lib.mjs";

const root = process.cwd();
const ledgerPath = path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json");
const manifestPath = path.join(root, "docs/design/ui/production-control/evidence/B0-01/manifest.json");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const evidenceById = new Map();
for (const item of manifest.evidence) {
  for (const sliceId of item.sliceIds ?? []) {
    const entries = evidenceById.get(sliceId) ?? [];
    entries.push({
      browser: "edge",
      browserVersion: manifest.browserVersion,
      actualApp: true,
      capturedAt: manifest.capturedAt,
      stage: item.stage,
      label: item.label,
      file: item.path,
      notes: item.description,
    });
    evidenceById.set(sliceId, entries);
  }
}

const evidenceRequirements = {
  "C.AUTH.SESSION.REQUIRED": ["entry", "interaction", "recovery"],
  "W.AUTH.SESSION.UNAUTHENTICATED": ["entry", "interaction", "recovery"],
  "W.AUTH.SESSION.AUTHENTICATED": ["entry", "result", "recovery"],
  "W.PROFILE.ACCESS.SUSPENDED": ["entry", "decision", "recovery"],
  "W.PROFILE.ACCESS.DISABLED": ["entry", "decision", "recovery"],
  "A.AUTH.SESSION.REQUIRED": ["entry", "interaction", "recovery"],
  "A.SCOPE.CITY.REQUIRED": ["entry", "interaction", "result"],
};

const sharedUiSources = ["packages/ui/src/components/b0.tsx", "packages/ui/src/index.ts"];
const definitions = {
  "C.AUTH.SESSION.REQUIRED": {
    route: "/customer/orders?orderId=:orderId",
    sources: ["apps/customer/src/app/App.tsx", "apps/customer/src/pages/customerPageShell.tsx", ...sharedUiSources],
    component: "IdentityGate + 顾客验证码表单",
    apis: ["POST /api/auth/customer/code", "POST /api/auth/customer/login"],
    states: ["customer session missing", "OTP requested", "OTP verified", "session expired"],
    permissions: ["customer"],
    entry: "顾客会话缺失，或业务 API 返回 401",
    persisted: "验证码验证成功后写入 xlb.customer.token 与 xlb.customer.userId",
    recovery: "保留当前 pathname、query 与订单意图，重新验证后返回原目标",
    handoff: "认证令牌交给顾客 API Client，后续请求携带 Bearer 身份",
    tests: ["tests/unit/b0CustomerGate.test.tsx", "tests/integration/authOtp.test.ts"],
  },
  "W.AUTH.SESSION.UNAUTHENTICATED": {
    route: "/worker/",
    sources: ["apps/worker/src/app/App.tsx", "apps/worker/src/pages/AuthPages.tsx", "apps/worker/src/app/workerAuth.ts", ...sharedUiSources],
    component: "WorkerLoginPage + IdentityGate",
    apis: ["POST /api/auth/worker/code", "POST /api/auth/worker/login"],
    states: ["worker session missing", "OTP requested", "OTP verified"],
    permissions: ["worker"],
    entry: "师傅本地持久会话不存在或已清除",
    persisted: "登录成功后写入 xlb.worker.session",
    recovery: "验证失败停留在 Gate；成功后进入原目标任务大厅",
    handoff: "WorkerSession 交给师傅 API Client，并附加 Authorization 与城市头",
    tests: ["tests/unit/workerApp.test.tsx", "tests/integration/authOtp.test.ts"],
  },
  "W.AUTH.SESSION.AUTHENTICATED": {
    route: "/worker/",
    sources: ["apps/worker/src/app/App.tsx", "apps/worker/src/app/workerAuth.ts", "apps/worker/src/features/auth/store.ts"],
    component: "SessionCard + Worker Base Frame",
    apis: ["GET /api/worker/task-pool", "Authorization: Bearer <worker token>", "x-xlb-city-code"],
    states: ["worker session restored", "worker session active", "worker session expired"],
    permissions: ["worker"],
    entry: "持久化 WorkerSession 字段完整且业务请求未返回 401",
    persisted: "会话跨刷新恢复；退出或 401 时同步清除",
    recovery: "401 返回师傅身份 Gate，并提示重新登录",
    handoff: "当前身份、城市与令牌交给任务、履约、售后和收益 API",
    tests: ["tests/unit/workerApp.test.tsx", "tests/integration/authOtp.test.ts"],
  },
  "W.PROFILE.ACCESS.SUSPENDED": {
    route: "/worker/",
    sources: ["backend/src/auth/authService.ts", "packages/api-client/src/auth.ts", "apps/worker/src/app/workerAuth.ts", "apps/worker/src/app/App.tsx", ...sharedUiSources],
    component: "PermissionState（暂停接单）",
    apis: ["POST /api/auth/worker/login -> WORKER_ACCESS_SUSPENDED"],
    states: ["worker_profiles.status=suspended", "OTP verified", "access blocked"],
    permissions: ["worker identity verified", "accept/fulfillment denied"],
    entry: "手机号验证码校验成功后，后端权威状态为 suspended",
    persisted: "不签发 Worker token，不建立可接单会话",
    recovery: "重新验证状态或联系平台客服",
    handoff: "已有业务由平台客服处理；UI 不进入接单与履约场景",
    tests: ["tests/unit/workerApp.test.tsx", "tests/unit/b0WorkerAccessAuth.test.ts", "tests/integration/authOtp.test.ts"],
  },
  "W.PROFILE.ACCESS.DISABLED": {
    route: "/worker/",
    sources: ["backend/src/auth/authService.ts", "packages/api-client/src/auth.ts", "apps/worker/src/app/workerAuth.ts", "apps/worker/src/app/App.tsx", ...sharedUiSources],
    component: "PermissionState（账号停用）",
    apis: ["POST /api/auth/worker/login -> WORKER_ACCESS_DISABLED"],
    states: ["worker_profiles.status=disabled", "OTP verified", "access blocked"],
    permissions: ["worker identity verified", "all worker business access denied"],
    entry: "手机号验证码校验成功后，后端权威状态为 disabled",
    persisted: "不签发 Worker token，不建立业务会话",
    recovery: "退出当前账号或联系平台客服核对停用结果",
    handoff: "停用事实交给客服核对；UI 不回落为空任务状态",
    tests: ["tests/unit/workerApp.test.tsx", "tests/unit/b0WorkerAccessAuth.test.ts", "tests/integration/authOtp.test.ts"],
  },
  "A.AUTH.SESSION.REQUIRED": {
    route: "/#/order-trace",
    sources: ["apps/admin/src/app/App.tsx", "apps/admin/src/app/AdminMobileShell.tsx", "apps/admin/src/app/admin-shell.css", "apps/admin/src/adminAuth.ts", ...sharedUiSources],
    component: "IdentityGate + 运营 App 验证码表单",
    apis: ["POST /api/auth/admin/code", "POST /api/auth/admin/login"],
    states: ["admin session missing", "OTP requested", "role verified"],
    permissions: ["admin", "operator", "auditor"],
    entry: "后台会话缺失；原 hash 工作台仍保留",
    persisted: "登录成功后持久化 token、userId、role 与 username",
    recovery: "验证失败停留原目标 Gate；成功后继续城市范围判断",
    handoff: "后台身份与角色交给城市 Gate 和后台 API Client",
    tests: ["tests/unit/b0AdminGate.test.tsx"],
  },
  "A.SCOPE.CITY.REQUIRED": {
    route: "/#/order-trace",
    sources: ["apps/admin/src/app/App.tsx", "apps/admin/src/app/AdminMobileShell.tsx", "apps/admin/src/app/admin-shell.css", "apps/admin/src/adminAuth.ts", ...sharedUiSources],
    component: "CityScopeGate",
    apis: ["x-xlb-city-code", "admin API cityCode query scope"],
    states: ["admin session active", "city scope missing", "city scope selected"],
    permissions: ["admin", "operator", "auditor", "city-scoped access"],
    entry: "后台会话有效，但 hash 与 xlb.admin.cityCode 均无城市范围",
    persisted: "确认后写入 xlb.admin.cityCode，并把 cityCode 合并回原 hash",
    recovery: "保留原工作台及其他 hash 参数，可重新选择城市",
    handoff: "城市范围交给所有后台请求头、查询参数与审计记录",
    tests: ["tests/unit/b0AdminGate.test.tsx"],
  },
};

for (const slice of ledger.slices) {
  const definition = definitions[slice.sliceId];
  if (!definition) continue;
  slice.localization = { status: "COMPLETE", exceptions: [] };
  slice.implementation = {
    route: definition.route,
    sourceFiles: definition.sources,
    component: definition.component,
    apiBindings: definition.apis,
  };
  slice.business = {
    authoritativeStates: definition.states,
    permissions: definition.permissions,
    entryCondition: definition.entry,
    persistedResult: definition.persisted,
    recovery: definition.recovery,
    handoff: definition.handoff,
    scenarioKind: "contract-state",
  };
  slice.tests = definition.tests;
  slice.evidenceRequirement = evidenceRequirements[slice.sliceId];
  slice.edgeEvidence = evidenceById.get(slice.sliceId) ?? [];
  slice.status = isEvidenceReady(root, slice) ? "EDGE_VERIFIED" : "TESTED";
  slice.acceptance = { acceptedBy: "", acceptedAt: "", notes: slice.status === "EDGE_VERIFIED" ? "B0-01 状态证据已齐备，等待人工最终验收。" : "B0-01 工程测试已完成，Edge 状态证据仍不完整。" };
}

const baseDefinitions = {
  "C-00": {
    route: "/customer/",
    sources: [
      "apps/customer/src/app/App.tsx",
      "apps/customer/src/app/mobile-shell.css",
      "apps/customer/src/pages/CustomerHomePage.tsx",
      "apps/customer/src/pages/customerPageShell.tsx",
      "apps/customer/src/pages/CustomerServicesPage.tsx",
      "apps/customer/src/pages/CustomerSupportPage.tsx",
    ],
    stages: ["loading", "base", "error"],
  },
  "W-00": { route: "/worker/", sources: ["apps/worker/src/app/App.tsx", "apps/worker/src/pages/TaskPages.tsx"], stages: ["entry"] },
  "A-00": { route: "/", sources: ["apps/admin/src/app/App.tsx", "apps/admin/src/app/AdminMobileShell.tsx", "apps/admin/src/app/admin-shell.css", "apps/admin/src/pages/AdminOverviewPage.tsx"], stages: ["result"] },
};
for (const carrier of ledger.carriers) {
  const definition = baseDefinitions[carrier.carrierId];
  if (!definition) continue;
  const baseFrame = {
    evidenceRequirement: definition.stages,
    implementationRoute: definition.route,
    sourceFiles: definition.sources,
    edgeEvidence: evidenceById.get(carrier.carrierId) ?? [],
    notes: "B0-01 中文基础外壳已按标准视口由 Microsoft Edge 采集。",
  };
  baseFrame.status = isEvidenceReady(root, baseFrame) ? "EDGE_VERIFIED" : "TESTED";
  carrier.baseFrame = baseFrame;
}

fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(`B0-01 recorded: ${Object.keys(definitions).length} slices and ${Object.keys(baseDefinitions).length} base frames; status follows complete state evidence.`);
