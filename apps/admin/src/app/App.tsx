import { useState, useEffect, useCallback } from "react";
import { SettlementOpsPage } from "../pages/SettlementOpsPage";
import { SettlementStatementDetailPage } from "../pages/SettlementStatementDetailPage";
import { SettlementExportReviewPage } from "../pages/SettlementExportReviewPage";
import { buildHash, parseView, parseHashParams } from "../hashParams";

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

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  if (view.page === "exports") {
    return <SettlementExportReviewPage onBack={navigateToDashboard} onNavigateToDetail={navigateToDetail} filterStatementId={params.get("statementId") || undefined} filterCityCode={cityCode} />;
  }

  if (view.page === "detail") {
    return <SettlementStatementDetailPage statementId={view.statementId} onBack={navigateToDashboard} cityCode={cityCode} onNavigateToExports={navigateToExports} />;
  }

  return <SettlementOpsPage onNavigate={navigateToDetail} onNavigateToExports={navigateToExports} initialCityCode={cityCode} />;
}
