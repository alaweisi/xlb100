import { lazy, useCallback, useEffect, useState } from "react";
import { buildHash, parseHashParams, parseView } from "../hashParams";
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  adminVisibleError,
  clearAdminSession,
  exchangeOaHandoff,
  hydrateOaBridgeSession,
  loginAdminWithCode,
  oaReturnUrl,
  readStoredAdminSession,
  readOaHandoffTicket,
  requestAdminLoginCode,
  adminOpsApi,
  type AdminSession,
} from "../adminAuth";
import {
  ADMIN_INVESTOR_DEMO_CITY_CODE,
  ADMIN_INVESTOR_DEMO_USERNAME,
  adminDemoCityLabel,
  AdminInvestorDemoNotice,
  IS_ADMIN_INVESTOR_DEMO,
} from "../investorDemo";
import { AdminShell, Button, FormField, GuardrailCard, Input, ScopeBadge, SideNav, StatusTag, TopBar } from "@xlb/ui";
import "../admin-responsive.css";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

function isNativeMobileRuntime(): boolean {
  return Boolean((window as CapacitorWindow).Capacitor?.isNativePlatform?.());
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

export function App() {
  const [view, setView] = useState(parseView);
  const [params, setParams] = useState(parseHashParams);
  const [session, setSession] = useState<AdminSession | null>(() => readStoredAdminSession());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState(() => (
    IS_ADMIN_INVESTOR_DEMO
      ? ADMIN_INVESTOR_DEMO_USERNAME
      : readStoredAdminSession()?.username ?? "admin_hz"
  ));
  const [loginCode, setLoginCode] = useState("");

  const onHashChange = useCallback(() => {
    setView(parseView());
    setParams(parseHashParams());
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onHashChange]);

  useEffect(() => {
    if (session) return;
    const handoff = readOaHandoffTicket();
    if (!handoff) return;
    let cancelled = false;
    setAuthLoading(true);
    void exchangeOaHandoff(handoff)
      .then((next) => {
        if (!cancelled) {
          setSession(next);
          setAuthError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAuthError(adminVisibleError(error, "授权登录未完成，请返回后重试。"));
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (session?.identity !== "oa" || session.permissions) return;
    let cancelled = false;
    setAuthLoading(true);
    void hydrateOaBridgeSession(session)
      .then((next) => {
        if (!cancelled) {
          setSession(next);
          setAuthError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          clearAdminSession();
          setAuthError(adminVisibleError(error, "账号授权信息暂时无法读取，请重新登录。"));
          setSession(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    const expireSession = () => {
      clearAdminSession();
      setSession(null);
      setLoginCode("");
      setAuthNotice(null);
      setAuthError("演示登录已过期，请重新登录。");
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, expireSession);
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT));
      return;
    }
    const timeout = window.setTimeout(
      () => window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT)),
      remaining,
    );
    return () => window.clearTimeout(timeout);
  }, [session]);

  const handleRequestCode = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const result = await requestAdminLoginCode(loginUsername);
      if (result.stagingDemoCode) {
        setLoginCode(result.stagingDemoCode);
        setAuthNotice(`Staging 演示验证码：${result.stagingDemoCode}`);
      } else {
        setAuthNotice("验证码已发送，请在有效期内完成登录。");
      }
    } catch (error) {
      setAuthError(adminVisibleError(error, "验证码暂时无法获取，请稍后重试。"));
    } finally {
      setAuthLoading(false);
    }
  }, [loginUsername]);

  const handleLogin = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const next = await loginAdminWithCode(loginUsername, loginCode);
      setSession(next);
      setAuthNotice(null);
    } catch (error) {
      setAuthError(adminVisibleError(error, "登录未完成，请重新获取验证码。"));
    } finally {
      setAuthLoading(false);
    }
  }, [loginCode, loginUsername]);

  const handleLogout = useCallback(() => {
    if (session?.identity === "oa") {
      clearAdminSession();
      window.location.assign(oaReturnUrl());
      return;
    }
    clearAdminSession();
    setSession(null);
    setLoginCode("");
    setAuthNotice(null);
    setAuthError(null);
  }, [session]);

  const cityCode = IS_ADMIN_INVESTOR_DEMO
    ? ADMIN_INVESTOR_DEMO_CITY_CODE
    : params.get("cityCode") || undefined;
  const can = useCallback((...permissions: NonNullable<AdminSession["permissions"]>[number][]) => {
    if (IS_ADMIN_INVESTOR_DEMO && session?.identity === "admin") {
      const demoPermissions = new Set<NonNullable<AdminSession["permissions"]>[number]>([
        "operations.orders.read",
        "operations.dispatch.read",
        "operations.dispatch.manage",
        "reviews.read",
      ]);
      return permissions.some((permission) => demoPermissions.has(permission));
    }
    return session?.identity !== "oa" || permissions.some((permission) => (
      session.permissions?.includes(permission)
      && (!cityCode || session.permissionCityCodes?.[permission]?.includes(cityCode))
    ));
  }, [cityCode, session]);

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
    window.location.hash = buildHash("/settlement-ops/governance", { cityCode: cityCode || "" });
  }, [cityCode]);

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

  const navigateToDashboard = useCallback(() => {
    window.location.hash = buildHash("/", { cityCode: cityCode || "" });
  }, [cityCode]);

  const viewTitle = view.page === "workerWithdrawals"
    ? "师傅提现"
    : view.page === "support"
    ? "客服工作台"
    : view.page === "supportQuality"
    ? "服务质量"
    : view.page === "reviewModeration"
    ? "评价与申诉"
    : view.page === "marketing"
    ? "营销与优惠券"
    : view.page === "platformOperations"
    ? "订单与师傅"
    : view.page === "enterprise"
    ? "企业服务"
    : view.page === "dispatch"
    ? "智能派单"
    : view.page === "aftersale"
    ? "售后处理"
    : view.page === "orderTrace"
    ? "订单全链路"
    : view.page === "governance"
      ? "结算治理"
      : view.page === "exports"
        ? "导出复核"
        : view.page === "detail"
          ? "结算单详情"
          : IS_ADMIN_INVESTOR_DEMO ? "演示工作台" : "结算运营";

  if (!session) {
    return (
      <div style={{ alignItems: "center", background: "var(--xlb-surface-muted)", display: "grid", minHeight: "100vh", padding: 24 }}>
        <div style={{ display: "grid", gap: 12, margin: "0 auto", maxWidth: 520, width: "100%" }}>
          <AdminInvestorDemoNotice />
          <GuardrailCard
            title="管理端演示登录"
            actions={<StatusTag tone={authLoading ? "warning" : "primary"}>{authLoading ? "正在验证" : "需要验证码"}</StatusTag>}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <FormField label="演示账号">
                {IS_ADMIN_INVESTOR_DEMO ? (
                  <Input aria-label="杭州演示管理员" value="杭州演示管理员" readOnly />
                ) : (
                  <Input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} />
                )}
              </FormField>
              <FormField label="验证码">
                <Input value={loginCode} onChange={(event) => setLoginCode(event.target.value)} />
              </FormField>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={handleRequestCode} disabled={authLoading}>获取验证码</Button>
                <Button onClick={handleLogin} disabled={authLoading || !loginCode.trim()} variant="primary">安全登录</Button>
              </div>
              {authNotice && <p className="xlb-admin-demo-auth-notice">{authNotice}</p>}
              {authError && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{authError}</p>}
            </div>
          </GuardrailCard>
        </div>
      </div>
    );
  }

  const pageAllowed = IS_ADMIN_INVESTOR_DEMO
    ? view.page === "dashboard"
      || (view.page === "orderTrace" && can("operations.orders.read"))
      || (view.page === "dispatch" && can("operations.dispatch.read"))
      || (
        view.page === "platformOperations"
        && can("operations.orders.read", "operations.catalog.read", "operations.certification.read")
      )
      || (view.page === "reviewModeration" && can("reviews.read"))
    : view.page === "workerWithdrawals"
    ? can("finance.withdrawal.read")
    : view.page === "support"
    ? can("support.read")
    : view.page === "supportQuality"
    ? can("support.quality.read")
    : view.page === "reviewModeration"
    ? can("reviews.read")
    : view.page === "marketing"
    ? can("marketing.read")
    : view.page === "platformOperations"
    ? can("operations.orders.read", "operations.catalog.read", "operations.certification.read")
    : view.page === "enterprise"
    ? can("enterprise.read")
    : view.page === "dispatch"
    ? can("operations.dispatch.read")
    : view.page === "aftersale"
    ? can("aftersale.read")
    : view.page === "orderTrace"
    ? can("operations.orders.read")
    : can("finance.settlement.read");

  const content = session.identity === "oa" && !session.permissions
    ? (
        <GuardrailCard title="Verifying OA capability" actions={<StatusTag tone="warning">checking</StatusTag>}>
          <p>The delegated session is loading its effective city and permission scope.</p>
        </GuardrailCard>
      )
    : !pageAllowed
    ? (
        <GuardrailCard
          title={IS_ADMIN_INVESTOR_DEMO ? "此功能未向演示账号开放" : "OA capability denied"}
          actions={<StatusTag tone="danger">{IS_ADMIN_INVESTOR_DEMO ? "已安全拦截" : "forbidden"}</StatusTag>}
        >
          <p>
            {IS_ADMIN_INVESTOR_DEMO
              ? "投资人演示仅开放订单、派单和评价查看，财务及其他敏感操作已关闭。"
              : "The current OA membership has no effective permission for this page and city."}
          </p>
          {IS_ADMIN_INVESTOR_DEMO && <Button onClick={navigateToDashboard}>返回演示首页</Button>}
        </GuardrailCard>
      )
    : view.page === "workerWithdrawals"
    ? <WorkerWithdrawalsPage initialCityCode={cityCode} canReview={can("finance.withdrawal.review")} />
    : view.page === "support"
    ? <SupportTicketsPage initialCityCode={cityCode} canManage={can("support.manage")} />
    : view.page === "supportQuality"
    ? <SupportQualityPage initialCityCode={cityCode} canManage={can("support.quality.manage")}/>
    : view.page === "reviewModeration"
    ? <ReviewModerationPage initialCityCode={cityCode} canModerate={can("reviews.moderate")}/>
    : view.page === "marketing"
    ? <MarketingOperationsPage api={adminOpsApi.marketing} initialCityCode={cityCode ?? "hangzhou"} role={can("marketing.manage") ? "admin" : "auditor"}/>
    : view.page === "platformOperations"
    ? <PlatformOperationsPage
        initialCityCode={cityCode}
        access={{
          orders: can("operations.orders.read"),
          catalog: can("operations.catalog.read"),
          catalogManage: can("operations.catalog.manage"),
          certification: can("operations.certification.read"),
          certificationDecide: can("operations.certification.decide"),
        }}
      />
    : view.page === "enterprise"
    ? <EnterpriseOpsPage initialCityCode={cityCode} canManage={can("enterprise.manage")}/>
    : view.page === "dispatch"
    ? <DispatchBoardPage initialCityCode={cityCode} canManage={can("operations.dispatch.manage")}/>
    : view.page === "aftersale"
    ? <AftersaleOpsPage initialCityCode={cityCode} canManage={can("aftersale.manage")} />
    : view.page === "orderTrace"
    ? (
        <OrderTracePage
          initialCityCode={cityCode}
          initialOrderId={params.get("orderId") || ""}
        />
      )
    : view.page === "dashboard" && IS_ADMIN_INVESTOR_DEMO
      ? (
          <GuardrailCard
            title="投资人演示工作台"
            actions={<StatusTag tone="success">低权限演示账号</StatusTag>}
          >
            <div className="xlb-admin-demo-dashboard">
              <p className="xlb-admin-demo-dashboard-copy">
                当前账号仅开放订单查看、派单演示和评价查看。财务、提现、营销等敏感能力不会出现在演示模式中。
              </p>
              <div className="xlb-admin-demo-dashboard-actions">
                <Button variant="primary" onClick={navigateToOrderTrace}>查看订单全链路</Button>
                <Button onClick={navigateToDispatch}>进入智能派单</Button>
                <Button onClick={navigateToPlatformOperations}>查看订单列表</Button>
                <Button onClick={navigateToReviewModeration}>查看评价结果</Button>
              </div>
            </div>
          </GuardrailCard>
        )
    : view.page === "governance"
      ? <SettlementActionGovernancePage
          onBack={navigateToDashboard}
          subView={view.subView}
          canReview={can("finance.settlement.review")}
        />
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

  return (
    <div data-native-mobile={isNativeMobileRuntime() ? "true" : undefined}>
      <AdminShell
      sideNav={
        <SideNav
          title="XLB Admin"
          style={{ background: "var(--xlb-role-admin-page)" }}
          items={[
            {
              key: "settlement",
              label: IS_ADMIN_INVESTOR_DEMO ? "演示首页" : "结算运营",
              active: view.page === "dashboard" || view.page === "detail",
              href: "#",
              onClick: navigateToDashboard,
            },
            {
              key: "exports",
              label: "导出复核",
              active: view.page === "exports",
              href: "#/settlement-ops/exports",
              onClick: () => navigateToExports(),
            },
            {
              key: "governance",
              label: "结算治理",
              active: view.page === "governance",
              href: "#/settlement-ops/governance",
              onClick: navigateToGovernance,
            },
            {
              key: "orderTrace",
              label: "订单全链路",
              active: view.page === "orderTrace",
              href: "#/order-trace",
              onClick: navigateToOrderTrace,
            },
            {
              key: "workerWithdrawals",
              label: "师傅提现",
              active: view.page === "workerWithdrawals",
              href: "#/worker-withdrawals",
              onClick: navigateToWorkerWithdrawals,
            },
            {
              key: "aftersale",
              label: "售后处理",
              active: view.page === "aftersale",
              href: "#/aftersale",
              onClick: navigateToAftersale,
            },
            { key:"enterprise",label:"企业服务",active:view.page==="enterprise",href:"#/enterprise",onClick:navigateToEnterprise },
            { key:"dispatch",label:"智能派单",active:view.page==="dispatch",href:"#/dispatch",onClick:navigateToDispatch },
            { key:"platformOperations",label:"订单与师傅",active:view.page==="platformOperations",href:"#/platform-operations",onClick:navigateToPlatformOperations },
            { key: "support", label: "客服工作台", active: view.page === "support", href: "#/support", onClick: navigateToSupport },
            {key:"supportQuality",label:"服务质量",active:view.page==="supportQuality",href:"#/support-quality",onClick:navigateToSupportQuality},
            {key:"reviewModeration",label:"评价与申诉",active:view.page==="reviewModeration",href:"#/review-moderation",onClick:navigateToReviewModeration},
            {key:"marketing",label:"营销与优惠券",active:view.page==="marketing",href:"#/marketing",onClick:navigateToMarketing},
          ].filter((item) => {
            if (IS_ADMIN_INVESTOR_DEMO) {
              if (item.key === "settlement") return true;
              if (!["orderTrace", "dispatch", "platformOperations", "reviewModeration"].includes(item.key)) {
                return false;
              }
            }
            if (item.key === "settlement" || item.key === "exports" || item.key === "governance") {
              return IS_ADMIN_INVESTOR_DEMO || can("finance.settlement.read");
            }
            if (item.key === "orderTrace") return can("operations.orders.read");
            if (item.key === "workerWithdrawals") return can("finance.withdrawal.read");
            if (item.key === "aftersale") return can("aftersale.read");
            if (item.key === "enterprise") return can("enterprise.read");
            if (item.key === "dispatch") return can("operations.dispatch.read");
            if (item.key === "platformOperations") {
              return can("operations.orders.read", "operations.catalog.read", "operations.certification.read");
            }
            if (item.key === "support") return can("support.read");
            if (item.key === "supportQuality") return can("support.quality.read");
            if (item.key === "reviewModeration") return can("reviews.read");
            if (item.key === "marketing") return can("marketing.read");
            return false;
          })}
        />
      }
      topBar={
        <TopBar
          title={viewTitle}
          subtitle={IS_ADMIN_INVESTOR_DEMO ? "管理端演示 · 受限操作范围" : "管理端 / 运营 / 受控工作流"}
          actions={
            <>
              {cityCode && <ScopeBadge scope={`城市：${adminDemoCityLabel(cityCode)}`} />}
              <StatusTag tone="success">{session.identity === "oa" ? "OA 授权会话" : "已安全登录"}</StatusTag>
              <Button onClick={handleLogout}>{session.identity === "oa" ? "返回 OA" : "退出并清除演示数据"}</Button>
            </>
          }
        />
      }
      style={{ background: "var(--xlb-surface-muted)" }}
      contentStyle={{ display: "grid", gap: 16, alignContent: "start" }}
    >
      <AdminInvestorDemoNotice />
      <GuardrailCard
        title={IS_ADMIN_INVESTOR_DEMO ? "演示安全边界" : "运营安全边界"}
        actions={<StatusTag tone="warning">{IS_ADMIN_INVESTOR_DEMO ? "权限已收敛" : "受控操作"}</StatusTag>}
        style={{
          borderColor: "#ddd6fe",
          boxShadow: "0 12px 28px rgba(25, 18, 37, 0.08)",
        }}
      >
        <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>
          {IS_ADMIN_INVESTOR_DEMO
            ? "演示模式仅展示订单、派单和评价固定链路；退出、登录过期或服务返回未授权时会清除本机演示会话。"
            : "本控制台保留结算与治理边界；售后操作均记录受控状态变化，补偿审批不会直接执行外部退款。"}
        </p>
      </GuardrailCard>
      {content}
      </AdminShell>
    </div>
  );
}
