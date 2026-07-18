import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { buildHash, parseHashParams, parseView } from "../hashParams";
import {
  clearAdminSession,
  loginAdminWithCode,
  readStoredAdminSession,
  requestAdminLoginCode,
  adminOpsApi,
  type AdminSession,
} from "../adminAuth";
import {
  Button,
  CityScopeGate,
  FormField,
  IdentityGate,
  Input,
  LoadingState,
  PermissionState,
  Select,
  StatusTag,
} from "@xlb/ui";
import { presentFailure } from "../operationsPresentation";
import { AdminMobileShell, type AdminMobileTool } from "./AdminMobileShell";

const ADMIN_CITY_OPTIONS = ["hangzhou", "shanghai", "beijing"] as const;
const ADMIN_ALLOWED_ROLES = new Set(["admin", "operator", "auditor"]);
const ADMIN_CITY_SCOPE_STORAGE_KEY = "xlb.admin.cityCode";

function adminRoleLabel(role: string): string {
  if (role === "admin") return "平台管理员";
  if (role === "operator") return "运营人员";
  if (role === "auditor") return "审计人员";
  return "未识别角色";
}

function adminCityLabel(cityCode: string): string {
  if (cityCode === "hangzhou") return "杭州";
  if (cityCode === "shanghai") return "上海";
  return "北京";
}

function readStoredAdminCityScope(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(ADMIN_CITY_SCOPE_STORAGE_KEY)?.trim();
  return stored && ADMIN_CITY_OPTIONS.includes(stored as (typeof ADMIN_CITY_OPTIONS)[number]) ? stored : undefined;
}

const SettlementOpsPage = lazy(() => import("../pages/SettlementOpsPage").then((module) => ({ default: module.SettlementOpsPage })));
const SettlementStatementDetailPage = lazy(() => import("../pages/SettlementStatementDetailPage").then((module) => ({ default: module.SettlementStatementDetailPage })));
const SettlementExportReviewPage = lazy(() => import("../pages/SettlementExportReviewPage").then((module) => ({ default: module.SettlementExportReviewPage })));
const SettlementActionGovernancePage = lazy(() => import("../pages/SettlementActionGovernancePage").then((module) => ({ default: module.SettlementActionGovernancePage })));
const OrderTracePage = lazy(() => import("../pages/OrderTracePage").then((module) => ({ default: module.OrderTracePage })));
const WorkerWithdrawalsPage = lazy(() => import("../pages/WorkerWithdrawalsPage").then((module) => ({ default: module.WorkerWithdrawalsPage })));
const AftersaleOpsPage = lazy(() => import("../pages/AftersaleOpsPage").then((module) => ({ default: module.AftersaleOpsPage })));
const EnterpriseOpsPage = lazy(() => import("../pages/EnterpriseOpsPage").then((module) => ({ default: module.EnterpriseOpsPage })));
const DispatchBoardPage = lazy(() => import("../pages/DispatchBoardPage").then((module) => ({ default: module.DispatchBoardPage })));
const PlatformOperationsPage = lazy(() => import("../pages/PlatformOperationsPage").then((module) => ({ default: module.PlatformOperationsPage })));
const SupportTicketsPage = lazy(() => import("../pages/SupportTicketsPage").then((module) => ({ default: module.SupportTicketsPage })));
const SupportQualityPage=lazy(()=>import("../pages/SupportQualityPage").then(module=>({default:module.SupportQualityPage})));
const ReviewModerationPage=lazy(()=>import("../pages/ReviewModerationPage").then(module=>({default:module.ReviewModerationPage})));
const MarketingOperationsPage=lazy(()=>import("../pages/MarketingOperationsPage").then(module=>({default:module.MarketingOperationsPage})));
const AdminOverviewPage=lazy(()=>import("../pages/AdminOverviewPage").then(module=>({default:module.AdminOverviewPage})));

export function App() {
  const [view, setView] = useState(parseView);
  const [params, setParams] = useState(parseHashParams);
  const [session, setSession] = useState<AdminSession | null>(() => readStoredAdminSession());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState(() => readStoredAdminSession()?.username ?? "admin_hz");
  const [loginCode, setLoginCode] = useState("");
  const [pendingCityCode, setPendingCityCode] = useState("hangzhou");
  const [toolPanelOpen, setToolPanelOpen] = useState(false);

  const onHashChange = useCallback(() => {
    setView(parseView());
    setParams(parseHashParams());
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onHashChange]);

  const handleRequestCode = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const result = await requestAdminLoginCode(loginUsername);
      setAuthNotice(`验证码已发送，${result.ttlSeconds} 秒内有效。`);
    } catch (error) {
      setAuthError(presentFailure(error, "验证码发送").detail);
    } finally {
      setAuthLoading(false);
    }
  }, [loginUsername]);

  const handleLogin = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const next = await loginAdminWithCode(loginUsername, loginCode);
      setSession(next);
    } catch (error) {
      setAuthError(presentFailure(error, "运营应用登录").detail);
    } finally {
      setAuthLoading(false);
    }
  }, [loginCode, loginUsername]);

  const handleLogout = useCallback(() => {
    clearAdminSession();
    setSession(null);
    setLoginCode("");
  }, []);

  const cityCode = params.get("cityCode") || readStoredAdminCityScope();

  const navigateToDetail = useCallback((statementId: string, extra?: Record<string, string>) => {
    window.location.hash = buildHash(
      `/settlement-ops/statements/${encodeURIComponent(statementId)}`,
      { ...(extra || {}), cityCode: cityCode || "" },
    );
  }, [cityCode]);

  const navigateToExports = useCallback((extra?: Record<string, string>) => {
    window.location.hash = buildHash("/settlement-ops/exports", {
      ...(extra || {}),
      cityCode: cityCode || "",
    });
  }, [cityCode]);

  const navigateToGovernance = useCallback(() => {
    window.location.hash = buildHash("/settlement-ops/governance");
  }, []);

  const navigateToOrderTrace = useCallback(() => {
    window.location.hash = buildHash("/order-trace", { cityCode: cityCode || "" });
  }, [cityCode]);

  const navigateToWorkerWithdrawals = useCallback(() => {
    window.location.hash = buildHash("/worker-withdrawals", { cityCode: cityCode || "" });
  }, [cityCode]);

  const navigateToAftersale = useCallback(() => {
    window.location.hash = buildHash("/aftersale", { cityCode: cityCode || "" });
  }, [cityCode]);
  const navigateToEnterprise = useCallback(() => { window.location.hash=buildHash("/enterprise",{cityCode:cityCode||""}); },[cityCode]);
  const navigateToDispatch = useCallback(() => {window.location.hash=buildHash("/dispatch",{cityCode:cityCode||""});},[cityCode]);
  const navigateToPlatformOperations = useCallback(() => {window.location.hash=buildHash("/platform-operations",{cityCode:cityCode||""});},[cityCode]);
  const navigateToSupport = useCallback(() => { window.location.hash = buildHash("/support", { cityCode: cityCode || "" }); }, [cityCode]);
  const navigateToSupportQuality=useCallback(()=>{window.location.hash=buildHash("/support-quality",{cityCode:cityCode||""})},[cityCode]);
  const navigateToReviewModeration=useCallback(()=>{window.location.hash=buildHash("/review-moderation",{cityCode:cityCode||""})},[cityCode]);
  const navigateToMarketing=useCallback(()=>{window.location.hash=buildHash("/marketing",{cityCode:cityCode||""})},[cityCode]);
  const navigateToSettlement=useCallback(()=>{window.location.hash=buildHash("/settlement-ops",{cityCode:cityCode||""})},[cityCode]);

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  const handleChangeCity = useCallback(() => {
    window.localStorage.removeItem(ADMIN_CITY_SCOPE_STORAGE_KEY);
    const rawHash = window.location.hash.replace(/^#/, "");
    const queryIndex = rawHash.indexOf("?");
    const targetPath = (queryIndex === -1 ? rawHash : rawHash.slice(0, queryIndex)) || "/";
    const nextParams: Record<string, string> = {};
    params.forEach((value, key) => {
      if (key !== "cityCode") nextParams[key] = value;
    });
    window.location.hash = buildHash(targetPath, nextParams);
    setParams(new URLSearchParams(nextParams));
  }, [params]);

  const viewTitle = view.page === "workerWithdrawals"
    ? "师傅提现审核"
    : view.page === "support"
    ? "客服工作台"
    : view.page === "supportQuality"
    ? "客服质量管理"
    : view.page === "reviewModeration"
    ? "评价治理"
    : view.page === "marketing"
    ? "营销与优惠券"
    : view.page === "platformOperations"
    ? "平台运营"
    : view.page === "enterprise"
    ? "企业客户运营"
    : view.page === "dispatch"
    ? "城市派单工作台"
    : view.page === "aftersale"
    ? "售后运营"
    : view.page === "orderTrace"
    ? "订单追踪"
    : view.page === "governance"
      ? "结算治理"
      : view.page === "exports"
        ? "导出复核"
        : view.page === "detail"
          ? "结算单详情"
          : view.page === "settlement"
            ? "结算运营"
            : "运营总览";

  const handleConfirmCityScope = useCallback(() => {
    const rawHash = window.location.hash.replace(/^#/, "");
    const queryIndex = rawHash.indexOf("?");
    const targetPath = (queryIndex === -1 ? rawHash : rawHash.slice(0, queryIndex)) || "/";
    const nextParams: Record<string, string> = {};
    params.forEach((value, key) => { nextParams[key] = value; });
    nextParams.cityCode = pendingCityCode;
    window.localStorage.setItem(ADMIN_CITY_SCOPE_STORAGE_KEY, pendingCityCode);
    window.location.hash = buildHash(targetPath, nextParams);
  }, [params, pendingCityCode]);

  if (!session) {
    return (
      <main className="admin-mobile-gate admin-mobile-gate--identity">
      <IdentityGate
        visualRole="admin"
        title="运营身份验证"
        description="验证账号与角色后进入受控运营工作台。"
        recoveryTarget={`目标工作台：${viewTitle}`}
        status={<StatusTag tone={authLoading ? "warning" : "primary"}>{authLoading ? "验证中" : "需要令牌"}</StatusTag>}
        form={
          <>
              <FormField label="运营账号">
                <Input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} />
              </FormField>
              <FormField label="短信验证码">
                <Input value={loginCode} onChange={(event) => setLoginCode(event.target.value)} />
              </FormField>
          </>
        }
        actions={
          <>
            <Button onClick={handleRequestCode} disabled={authLoading}>获取验证码</Button>
            <Button onClick={handleLogin} disabled={authLoading || !loginCode.trim()} variant="primary">登录</Button>
          </>
        }
        error={authError}
        notice={authNotice}
      />
      </main>
    );
  }

  if (!ADMIN_ALLOWED_ROLES.has(session.role)) {
    return (
      <main className="admin-mobile-gate admin-mobile-gate--permission">
        <PermissionState
          style={{ width: "100%" }}
          title="当前角色无权进入运营应用"
          description="系统不会透露任何业务对象是否存在。请切换到已授权的运营账号。"
          facts={`当前角色：${adminRoleLabel(session.role)}`}
          action={<Button onClick={handleLogout}>退出登录</Button>}
        />
      </main>
    );
  }

  if (view.page === "dispatch" && session.role !== "operator") {
    return (
      <main className="admin-mobile-gate admin-mobile-gate--permission">
        <PermissionState
          style={{ width: "100%" }}
          title="无权进入派单工作台"
          description="该工作台当前仅允许运营人员访问。"
          facts={`当前角色：${adminRoleLabel(session.role)}`}
          action={<Button onClick={navigateToDashboard}>返回运营首页</Button>}
          secondaryAction={<Button onClick={handleLogout}>退出登录</Button>}
        />
      </main>
    );
  }

  if (!cityCode) {
    return (
      <main className="admin-mobile-gate admin-mobile-gate--city">
      <CityScopeGate
        title="选择运营城市"
        description="运营数据、操作权限和审计记录都按城市隔离。"
        currentScope="尚未选择城市范围"
        recoveryTarget={`确认后返回：${viewTitle}`}
        selector={
          <FormField label={<span style={{ color: "var(--xlb-role-admin-text)" }}>工作城市</span>}>
            <Select value={pendingCityCode} onChange={(event) => setPendingCityCode(event.target.value)}>
              {ADMIN_CITY_OPTIONS.map((option) => <option key={option} value={option}>{adminCityLabel(option)}</option>)}
            </Select>
          </FormField>
        }
        actions={<Button onClick={handleConfirmCityScope} variant="primary">进入该城市工作台</Button>}
      />
      </main>
    );
  }

  const content = view.page === "dashboard"
    ? <AdminOverviewPage
        cityCode={cityCode}
        role={session.role}
        onOpenOrderTrace={navigateToOrderTrace}
        onOpenDispatch={navigateToDispatch}
        onOpenSupport={navigateToSupport}
        onOpenSettlement={navigateToSettlement}
      />
    : view.page === "workerWithdrawals"
    ? <WorkerWithdrawalsPage initialCityCode={cityCode} />
    : view.page === "support"
    ? <SupportTicketsPage initialCityCode={cityCode} />
    : view.page === "supportQuality"
    ? <SupportQualityPage initialCityCode={cityCode}/>
    : view.page === "reviewModeration"
    ? <ReviewModerationPage initialCityCode={cityCode}/>
    : view.page === "marketing"
    ? <MarketingOperationsPage api={adminOpsApi.marketing} initialCityCode={cityCode ?? "hangzhou"} role={session.role === "admin" || session.role === "operator" || session.role === "auditor" ? session.role : "auditor"}/>
    : view.page === "platformOperations"
    ? <PlatformOperationsPage initialCityCode={cityCode}/>
    : view.page === "enterprise"
    ? <EnterpriseOpsPage initialCityCode={cityCode}/>
    : view.page === "dispatch"
    ? <DispatchBoardPage initialCityCode={cityCode}/>
    : view.page === "aftersale"
    ? <AftersaleOpsPage initialCityCode={cityCode} />
    : view.page === "orderTrace"
    ? (
        <OrderTracePage
          initialCityCode={cityCode}
          initialOrderId={params.get("orderId") || ""}
        />
      )
    : view.page === "governance"
      ? <SettlementActionGovernancePage onBack={navigateToDashboard} subView={view.subView} />
      : view.page === "exports"
        ? (
            <SettlementExportReviewPage
              onBack={navigateToDashboard}
              onNavigateToDetail={navigateToDetail}
              filterStatementId={params.get("statementId") || undefined}
              filterCityCode={cityCode}
            />
          )
        : view.page === "detail"
          ? (
              <SettlementStatementDetailPage
                statementId={view.statementId}
                onBack={navigateToDashboard}
                cityCode={cityCode}
                onNavigateToExports={navigateToExports}
              />
            )
          : (
              <SettlementOpsPage
                onNavigate={navigateToDetail}
                onNavigateToExports={navigateToExports}
                onNavigateToGovernance={navigateToGovernance}
                initialCityCode={cityCode}
              />
            );

  const guardrailCopy = view.page === "dispatch"
    ? "派单操作仅作用于当前城市范围。候选排序使用服务端结果，页面不会读取精确坐标；重试和超时扫描完成后必须重新读取任务状态。"
    : view.page === "platformOperations"
      ? "订单列表为只读联动入口；服务目录开关与师傅认证审核会写入真实业务记录。发生并发冲突时必须刷新后重新判断。"
      : view.page === "orderTrace"
        ? "订单追踪为当前城市范围内的只读查询。评价正文、精确位置等敏感信息不会在此页面展开，部分接口失败也不会被解释为空数据。"
        : view.page === "aftersale"
          ? "售后处理会写入真实业务状态并保留操作说明。补偿审批只记录业务意图，不直接执行外部退款；部分数据读取失败会单独提示。"
          : view.page === "support"
            ? "客服工单、会话、路由与知识库操作均写入真实服务端。机器人只提供信息说明，不伪造处理结果；并发冲突时必须刷新后重判。"
            : view.page === "supportQuality"
              ? "质检规则和评分写入真实记录，不预填满分或虚构质检时间。评分权重、目标工单和实际得分均需人工明确录入。"
              : view.page === "reviewModeration"
                ? "评价正文按权限按需读取；审核与申诉裁决携带服务端版本号。无审核权限时保持只读，冲突时不会覆盖他人结果。"
                : view.page === "workerWithdrawals"
                  ? "提现批准、驳回和付款标记都要求处理说明。付款标记只更新服务端记录，本页面不会调用银行或支付服务商。"
                  : view.page === "enterprise"
                    ? "企业客户、接入凭据、协议价格、推送订阅与账单均为真实业务数据。密钥仅显示一次；账单快照不执行收款。"
                    : view.page === "marketing"
                      ? "营销活动、规则修订、券定义与发放均受角色和版本约束。所有状态变更要求审计原因，冲突时不会静默覆盖。"
                      : view.page === "governance"
                        ? "结算治理只生成和查看只读计划；出款、退款、账本改写、结算提交、文件生成与服务商派发全部禁用。"
                        : "结算单、详情与导出记录仅供审计查看，不执行付款、退款或服务商操作；部分接口失败不会被解释为空数据。";

  const guardrailTone = ["orderTrace", "settlement", "detail", "exports", "governance"].includes(view.page) ? "只读治理" : "受控操作";
  const showGuardrail = view.page !== "dashboard";

  const tools: AdminMobileTool[] = [
    { key: "settlement", label: "结算运营", description: "结算单与风险复核", active: view.page === "settlement", onClick: navigateToSettlement },
    { key: "detail", label: "结算单详情", description: "从结算列表选择记录", active: view.page === "detail", onClick: navigateToSettlement },
    { key: "exports", label: "导出复核", description: "导出记录与审计", active: view.page === "exports", onClick: () => navigateToExports() },
    { key: "governance", label: "结算治理", description: "只读计划与边界", active: view.page === "governance", onClick: navigateToGovernance },
    { key: "orderTrace", label: "订单追踪", description: "查询完整证据链", active: view.page === "orderTrace", onClick: navigateToOrderTrace },
    { key: "workerWithdrawals", label: "师傅提现", description: "审核与付款标记", active: view.page === "workerWithdrawals", onClick: navigateToWorkerWithdrawals },
    { key: "aftersale", label: "售后运营", description: "投诉、返工与补偿", active: view.page === "aftersale", onClick: navigateToAftersale },
    { key: "enterprise", label: "企业客户", description: "客户、凭据与账单", active: view.page === "enterprise", onClick: navigateToEnterprise },
    { key: "dispatch", label: "城市派单", description: "任务与候选师傅", active: view.page === "dispatch", onClick: navigateToDispatch },
    { key: "platformOperations", label: "平台运营", description: "订单、服务与师傅", active: view.page === "platformOperations", onClick: navigateToPlatformOperations },
    { key: "support", label: "客服工作台", description: "工单、会话与路由", active: view.page === "support", onClick: navigateToSupport },
    { key: "supportQuality", label: "客服质量", description: "质检量表与评分", active: view.page === "supportQuality", onClick: navigateToSupportQuality },
    { key: "reviewModeration", label: "评价与口碑", description: "审核与申诉裁决", active: view.page === "reviewModeration", onClick: navigateToReviewModeration },
    { key: "marketing", label: "营销优惠券", description: "活动、规则与发放", active: view.page === "marketing", onClick: navigateToMarketing },
  ];

  const activeNav = view.page === "dashboard"
    ? "overview"
    : ["orderTrace", "dispatch", "platformOperations"].includes(view.page)
      ? "orders"
      : ["support", "supportQuality", "reviewModeration"].includes(view.page)
        ? "support"
        : ["workerWithdrawals", "aftersale", "settlement", "detail", "exports", "governance"].includes(view.page)
          ? "approvals"
          : "tools";

  return (
    <div className="admin-app-root">
      <AdminMobileShell
        title={viewTitle}
        cityLabel={adminCityLabel(cityCode)}
        isDetail={view.page !== "dashboard"}
        toolPanelOpen={toolPanelOpen}
        tools={tools}
        activeNav={activeNav}
        accountLabel={`${adminRoleLabel(session.role)} · ${session.username}`}
        onBack={navigateToDashboard}
        onOpenOverview={navigateToDashboard}
        onOpenOrders={session.role === "operator" ? navigateToDispatch : navigateToOrderTrace}
        onOpenSupport={navigateToSupport}
        onOpenApprovals={navigateToWorkerWithdrawals}
        onOpenTools={() => setToolPanelOpen(true)}
        onCloseTools={() => setToolPanelOpen(false)}
        onSearch={navigateToOrderTrace}
        onNotifications={navigateToSupport}
        onChangeCity={handleChangeCity}
        onLogout={handleLogout}
      >
        {showGuardrail ? (
          <details className="admin-mobile-guardrail">
            <summary><span>运营操作边界</span><StatusTag tone={view.page === "orderTrace" ? "muted" : "warning"}>{guardrailTone}</StatusTag></summary>
            <p>{guardrailCopy}</p>
          </details>
        ) : null}
        <Suspense fallback={<LoadingState title="正在打开运营工作台" description="正在加载所需模块。" />}>
          {content}
        </Suspense>
      </AdminMobileShell>
    </div>
  );
}
