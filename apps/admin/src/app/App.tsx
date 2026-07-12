import { lazy, useCallback, useEffect, useState } from "react";
import { buildHash, parseHashParams, parseView } from "../hashParams";
import {
  clearAdminSession,
  loginAdmin,
  loginAdminWithCode,
  readStoredAdminSession,
  requestAdminLoginCode,
  type AdminSession,
} from "../adminAuth";
import { AdminShell, Button, FormField, GuardrailCard, Input, ScopeBadge, SideNav, StatusTag, TopBar } from "@xlb/ui";

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

export function App() {
  const [view, setView] = useState(parseView);
  const [params, setParams] = useState(parseHashParams);
  const [session, setSession] = useState<AdminSession | null>(() => readStoredAdminSession());
  const [authLoading, setAuthLoading] = useState(() => !readStoredAdminSession());
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState(() => readStoredAdminSession()?.username ?? "admin_hz");
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
    let cancelled = false;
    setAuthLoading(true);
    void loginAdmin(loginUsername)
      .then((next) => {
        if (!cancelled) {
          setSession(next);
          setAuthError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : "Admin login failed");
        }
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleRequestCode = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await requestAdminLoginCode(loginUsername);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Admin code request failed");
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
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Admin login failed");
    } finally {
      setAuthLoading(false);
    }
  }, [loginCode, loginUsername]);

  const handleLogout = useCallback(() => {
    clearAdminSession();
    setSession(null);
    setLoginCode("");
  }, []);

  const cityCode = params.get("cityCode") || undefined;

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

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  const viewTitle = view.page === "workerWithdrawals"
    ? "Worker Withdrawals"
    : view.page === "support"
    ? "Support Tickets"
    : view.page === "platformOperations"
    ? "Platform Operations"
    : view.page === "enterprise"
    ? "Enterprise Platform"
    : view.page === "dispatch"
    ? "LBS-lite Dispatch"
    : view.page === "aftersale"
    ? "Aftersale Operations"
    : view.page === "orderTrace"
    ? "Order Trace"
    : view.page === "governance"
      ? "Settlement Governance"
      : view.page === "exports"
        ? "Export Review"
        : view.page === "detail"
          ? "Statement Detail"
          : "Settlement Ops";

  if (!session) {
    return (
      <div style={{ alignItems: "center", background: "#f6f3fb", display: "grid", minHeight: "100vh", padding: 24 }}>
        <div style={{ margin: "0 auto", maxWidth: 440, width: "100%" }}>
          <GuardrailCard
            title="XLB Admin Login"
            actions={<StatusTag tone={authLoading ? "warning" : "primary"}>{authLoading ? "checking" : "token required"}</StatusTag>}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <FormField label="Username">
                <Input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} />
              </FormField>
              <FormField label="Verification code">
                <Input value={loginCode} onChange={(event) => setLoginCode(event.target.value)} />
              </FormField>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={handleRequestCode} disabled={authLoading}>Request code</Button>
                <Button onClick={handleLogin} disabled={authLoading || !loginCode.trim()} variant="primary">Login</Button>
              </div>
              {authError && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{authError}</p>}
            </div>
          </GuardrailCard>
        </div>
      </div>
    );
  }

  const content = view.page === "workerWithdrawals"
    ? <WorkerWithdrawalsPage initialCityCode={cityCode} />
    : view.page === "support"
    ? <SupportTicketsPage initialCityCode={cityCode} />
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

  return (
    <AdminShell
      sideNav={
        <SideNav
          title="XLB Admin"
          style={{ background: "#191225" }}
          items={[
            {
              key: "settlement",
              label: "Settlement",
              active: view.page === "dashboard" || view.page === "detail",
              href: "#",
              onClick: navigateToDashboard,
            },
            {
              key: "exports",
              label: "Export Review",
              active: view.page === "exports",
              href: "#/settlement-ops/exports",
              onClick: () => navigateToExports(),
            },
            {
              key: "governance",
              label: "Governance",
              active: view.page === "governance",
              href: "#/settlement-ops/governance",
              onClick: navigateToGovernance,
            },
            {
              key: "orderTrace",
              label: "Order Trace",
              active: view.page === "orderTrace",
              href: "#/order-trace",
              onClick: navigateToOrderTrace,
            },
            {
              key: "workerWithdrawals",
              label: "Withdrawals",
              active: view.page === "workerWithdrawals",
              href: "#/worker-withdrawals",
              onClick: navigateToWorkerWithdrawals,
            },
            {
              key: "aftersale",
              label: "Aftersale",
              active: view.page === "aftersale",
              href: "#/aftersale",
              onClick: navigateToAftersale,
            },
            { key:"enterprise",label:"Enterprise",active:view.page==="enterprise",href:"#/enterprise",onClick:navigateToEnterprise },
            { key:"dispatch",label:"Dispatch",active:view.page==="dispatch",href:"#/dispatch",onClick:navigateToDispatch },
            { key:"platformOperations",label:"Orders / SKU / Workers",active:view.page==="platformOperations",href:"#/platform-operations",onClick:navigateToPlatformOperations },
            { key: "support", label: "Support Tickets", active: view.page === "support", href: "#/support", onClick: navigateToSupport },
          ]}
        />
      }
      topBar={
        <TopBar
          title={viewTitle}
          subtitle="Admin / Operations / Controlled workflows"
          actions={
            <>
              {cityCode && <ScopeBadge scope={`city: ${cityCode}`} />}
              <StatusTag tone="primary">{session.userId}</StatusTag>
              <StatusTag tone="success">same-origin API</StatusTag>
              <Button onClick={handleLogout}>Logout</Button>
            </>
          }
        />
      }
      style={{ background: "#f6f3fb" }}
      contentStyle={{ display: "grid", gap: 16 }}
    >
      <GuardrailCard
        title="Operations Guardrail"
        actions={<StatusTag tone="warning">controlled ops</StatusTag>}
        style={{
          borderColor: "#ddd6fe",
          boxShadow: "0 12px 28px rgba(25, 18, 37, 0.08)",
        }}
      >
        <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>
          This console keeps settlement and governance surfaces intact. Phase 17 aftersale actions are audited state transitions;
          compensation approval records intent only and never executes a provider refund.
        </p>
      </GuardrailCard>
      {content}
    </AdminShell>
  );
}
