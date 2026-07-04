import { useState, useEffect, useCallback } from "react";
import { SettlementOpsPage } from "../pages/SettlementOpsPage";
import { SettlementStatementDetailPage } from "../pages/SettlementStatementDetailPage";

function parseHash(): { page: "dashboard" } | { page: "detail"; statementId: string } {
  const hash = window.location.hash.replace(/^#/, "");
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

  const navigateToDashboard = useCallback(() => {
    window.location.hash = "";
  }, []);

  if (view.page === "detail") {
    return <SettlementStatementDetailPage statementId={view.statementId} onBack={navigateToDashboard} />;
  }

  return <SettlementOpsPage onNavigate={navigateToDetail} />;
}
