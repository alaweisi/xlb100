import { useCallback, useEffect, useState } from "react";
import { SettlementOpsPage } from "../pages/SettlementOpsPage";
import { SettlementStatementDetailPage } from "../pages/SettlementStatementDetailPage";
import { SettlementExportReviewPage } from "../pages/SettlementExportReviewPage";
import { SettlementActionGovernancePage } from "../pages/SettlementActionGovernancePage";
import { OrderTracePage } from "../pages/OrderTracePage";
import { WorkerWithdrawalsPage } from "../pages/WorkerWithdrawalsPage";
import { buildHash, parseHashParams, parseView } from "../hashParams";
import { AdminShell, GuardrailCard, ScopeBadge, SideNav, StatusTag, TopBar } from "@xlb/ui";

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

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  const viewTitle = view.page === "workerWithdrawals"
    ? "Worker Withdrawals"
    : view.page === "orderTrace"
    ? "Order Trace"
    : view.page === "governance"
      ? "Settlement Governance"
      : view.page === "exports"
        ? "Export Review"
        : view.page === "detail"
          ? "Statement Detail"
          : "Settlement Ops";

  const content = view.page === "workerWithdrawals"
    ? <WorkerWithdrawalsPage initialCityCode={cityCode} />
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
          ]}
        />
      }
      topBar={
        <TopBar
          title={viewTitle}
          subtitle="Admin / Operations / Read-only"
          actions={
            <>
              {cityCode && <ScopeBadge scope={`city: ${cityCode}`} />}
              <StatusTag tone="success">same-origin API</StatusTag>
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
          This console keeps existing settlement and governance surfaces intact. Order trace stays read-only; worker withdrawal actions only move
          internal request records through review and marked-paid states.
        </p>
      </GuardrailCard>
      {content}
    </AdminShell>
  );
}
