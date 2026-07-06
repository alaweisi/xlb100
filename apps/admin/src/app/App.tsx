import { useState, useEffect, useCallback } from "react";
import { SettlementOpsPage } from "../pages/SettlementOpsPage";
import { SettlementStatementDetailPage } from "../pages/SettlementStatementDetailPage";
import { SettlementExportReviewPage } from "../pages/SettlementExportReviewPage";
import { SettlementActionGovernancePage } from "../pages/SettlementActionGovernancePage";
import { buildHash, parseView, parseHashParams } from "../hashParams";
import { AdminShell, Badge, SideNav, TopBar } from "@xlb/ui";

export function App() {
  const [view, setView] = useState(parseView);
  const [params, setParams] = useState(parseHashParams);

  const onHashChange = useCallback(() => {
    setView(parseView());
    setParams(parseHashParams());
  }, []);
  useEffect(() => {
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onHashChange]);

  const cityCode = params.get("cityCode") || undefined;

  const navigateToDetail = useCallback((statementId: string, extra?: Record<string, string>) => {
    window.location.hash = buildHash(`/settlement-ops/statements/${encodeURIComponent(statementId)}`, { ...(extra || {}), cityCode: cityCode || "" });
  }, [cityCode]);

  const navigateToExports = useCallback((extra?: Record<string, string>) => {
    window.location.hash = buildHash("/settlement-ops/exports", { ...(extra || {}), cityCode: cityCode || "" });
  }, [cityCode]);

  const navigateToGovernance = useCallback(() => {
    window.location.hash = buildHash("/settlement-ops/governance");
  }, []);

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  const viewTitle = view.page === "governance"
    ? "Settlement Governance"
    : view.page === "exports"
      ? "Export Review"
      : view.page === "detail"
        ? "Statement Detail"
        : "Settlement Operations";

  const content = view.page === "governance"
    ? <SettlementActionGovernancePage onBack={navigateToDashboard} subView={view.subView} />
    : view.page === "exports"
      ? <SettlementExportReviewPage onBack={navigateToDashboard} onNavigateToDetail={navigateToDetail} filterStatementId={params.get("statementId") || undefined} filterCityCode={cityCode} />
      : view.page === "detail"
        ? <SettlementStatementDetailPage statementId={view.statementId} onBack={navigateToDashboard} cityCode={cityCode} onNavigateToExports={navigateToExports} />
        : <SettlementOpsPage onNavigate={navigateToDetail} onNavigateToExports={navigateToExports} onNavigateToGovernance={navigateToGovernance} initialCityCode={cityCode} />;

  return (
    <AdminShell
      sideNav={
        <SideNav
          title="XLB Admin"
          items={[
            { key: "settlement", label: "结算", active: view.page === "dashboard" || view.page === "detail", href: "#", onClick: navigateToDashboard },
            { key: "exports", label: "导出复核", active: view.page === "exports", href: "#/settlement-ops/exports", onClick: () => navigateToExports() },
            { key: "governance", label: "治理", active: view.page === "governance", href: "#/settlement-ops/governance", onClick: navigateToGovernance },
          ]}
        />
      }
      topBar={<TopBar title={viewTitle} actions={<Badge tone="success">same-origin API</Badge>} />}
    >
      {content}
    </AdminShell>
  );
}
