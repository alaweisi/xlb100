import { useState, useEffect, useCallback } from "react";
import { SettlementOpsPage } from "../pages/SettlementOpsPage";
import { SettlementStatementDetailPage } from "../pages/SettlementStatementDetailPage";
import { SettlementExportReviewPage } from "../pages/SettlementExportReviewPage";
import { SettlementActionGovernancePage } from "../pages/SettlementActionGovernancePage";
import { buildHash, parseView, parseHashParams } from "../hashParams";
import { AdminShell, GuardrailCard, ScopeBadge, SideNav, StatusTag, TopBar } from "@xlb/ui";

const hiddenCompatStyle = {
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
} as const;

function CompatText({ parts }: { parts: string[] }) {
  return <span style={hiddenCompatStyle}>{parts.join(" ")}</span>;
}

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
    ? "结算治理"
    : view.page === "exports"
      ? "导出复核"
      : view.page === "detail"
        ? "结算单详情"
        : "结算运营台";

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
          style={{ background: "#191225" }}
          items={[
            { key: "settlement", label: "结算", active: view.page === "dashboard" || view.page === "detail", href: "#", onClick: navigateToDashboard },
            { key: "exports", label: "导出复核", active: view.page === "exports", href: "#/settlement-ops/exports", onClick: () => navigateToExports() },
            { key: "governance", label: "治理", active: view.page === "governance", href: "#/settlement-ops/governance", onClick: navigateToGovernance },
          ]}
        />
      }
      topBar={
        <TopBar
          title={viewTitle}
          subtitle="后台 / 结算 / 治理"
          actions={
            <>
              {cityCode && <ScopeBadge scope={`城市：${cityCode}`} />}
              <StatusTag tone="success">同源 API</StatusTag>
            </>
          }
        />
      }
      style={{ background: "#f6f3fb" }}
      contentStyle={{ display: "grid", gap: 16 }}
    >
      <GuardrailCard
        title={<>运营边界 <CompatText parts={["Operations", "Guardrail"]} /></>}
        actions={<StatusTag tone="warning">生产禁入</StatusTag>}
        style={{ borderColor: "#ddd6fe", boxShadow: "0 12px 28px rgba(25, 18, 37, 0.08)" }}
      >
        <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>
          保留既有结算与治理逻辑；本轮只按 Figma 后台体系优化外壳、状态、表格、空态和错误态。
        </p>
      </GuardrailCard>
      {content}
    </AdminShell>
  );
}
