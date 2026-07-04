import { useState, useEffect, useCallback } from "react";
import { SettlementOpsPage } from "../pages/SettlementOpsPage";
import { SettlementStatementDetailPage } from "../pages/SettlementStatementDetailPage";
import { SettlementExportReviewPage } from "../pages/SettlementExportReviewPage";

function parseHash(): { page: "dashboard" } | { page: "detail"; statementId: string } | { page: "exports" } {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "/settlement-ops/exports") return { page: "exports" };
  const match = hash.match(/^\/settlement-ops\/statements\/(.+)$/);
  if (match) return { page: "detail", statementId: decodeURIComponent(match[1]) };
  return { page: "dashboard" };
}

export function App() {
  const [view, setView] = useState(parseHash);

  const onHashChange = useCallback(() => setView(parseHash()), []);
  useEffect(() => {
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [onHashChange]);

  const navigateToDetail = useCallback((statementId: string) => {
    window.location.hash = `#/settlement-ops/statements/${encodeURIComponent(statementId)}`;
  }, []);

  const navigateToExports = useCallback(() => {
    window.location.hash = "#/settlement-ops/exports";
  }, []);

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  if (view.page === "exports") {
    return <SettlementExportReviewPage onBack={navigateToDashboard} onNavigateToDetail={navigateToDetail} />;
  }

  if (view.page === "detail") {
    return <SettlementStatementDetailPage statementId={view.statementId} onBack={navigateToDashboard} />;
  }

  return <SettlementOpsPage onNavigate={navigateToDetail} onNavigateToExports={navigateToExports} />;
}
