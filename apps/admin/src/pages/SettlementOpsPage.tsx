import { useState, useEffect, useCallback } from "react";
import { settlementApi, createApiClient } from "@xlb/api-client";
import { buildHash, parseHashParams } from "../hashParams";

const client = createApiClient({ baseUrl: "http://localhost:3000", headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator" } });
const api = settlementApi.create(client);

interface AuditItem {
  statementId: string; workerId: string; status: string;
  review: { decision: string } | null; export: { contentHash: string } | null;
}

interface Summary {
  overall: { totalStatements: number; reviewedStatements: number; approvedStatements: number; exportedStatements: number };
}

interface SettlementAudit {
  counts: { totalBatches: number; totalItems: number; totalPayables: number; totalQueueItems: number };
  amounts: { itemsGrossAmount: number };
}

interface GapScan {
  summary: { totalGaps: number; gapsByType: Record<string, number> };
}

interface Props {
  onNavigate?: (statementId: string) => void;
  onNavigateToExports?: () => void;
  onNavigateToGovernance?: () => void;
  initialCityCode?: string;
}

export function SettlementOpsPage({ onNavigate, onNavigateToExports, onNavigateToGovernance, initialCityCode }: Props) {
  const params = parseHashParams();
  const [cityCode, setCityCode] = useState(initialCityCode || params.get("cityCode") || "hangzhou");
  const [statements, setStatements] = useState<AuditItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settlement, setSettlement] = useState<SettlementAudit | null>(null);
  const [gaps, setGaps] = useState<GapScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string> = { cityCode };
      if (cursor) query.cursor = cursor;
      const [auditRes, summaryRes, settlementRes, gapRes] = await Promise.all([
        api.listStatementAudit(query),
        api.getReviewSummary({ cityCode }),
        api.getSettlementAuditSummary({ cityCode }),
        api.scanReconciliationGaps({ cityCode }),
      ]);
      setStatements(auditRes.ok && Array.isArray(auditRes.items) ? (auditRes.items as AuditItem[]) : []);
      setNextCursor(auditRes.nextCursor || null);
      setSummary(summaryRes.ok ? (summaryRes as unknown as Summary) : null);
      setSettlement(settlementRes.ok ? (settlementRes as unknown as SettlementAudit) : null);
      setGaps(gapRes.ok ? (gapRes as unknown as GapScan) : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [cityCode]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Sync cityCode to URL hash
  useEffect(() => {
    const h = buildHash("", cityCode !== "hangzhou" ? { cityCode } : {});
    const target = h === "#" ? "" : h;
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
  }, [cityCode]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Settlement Operations Console</h1>
      <label>City: <input value={cityCode} onChange={(e) => setCityCode(e.target.value)} /></label>
      <button onClick={() => fetchAll()}>Refresh</button>
      {onNavigateToExports && <button onClick={onNavigateToExports}>Settlement Exports</button>}
      {onNavigateToGovernance && <button onClick={onNavigateToGovernance}>Settlement Governance</button>}
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <section><h2>Statement Audit</h2>
        {!loading && statements.length === 0 ? <p>No statements</p> :
          <ul>{statements.map((s) => (
            <li key={s.statementId} style={{ cursor: "pointer", padding: "4px 0" }}
                onClick={() => onNavigate?.(s.statementId)}>{s.statementId} — worker {s.workerId} — {s.status}
              {s.review ? ` — review: ${s.review.decision}` : " — pending review"}
              {s["export"] ? ` — hash: ${s["export"].contentHash?.slice(0, 8)}` : ""}
            </li>
          ))}</ul>}
        {nextCursor && (
          <button onClick={() => fetchAll(nextCursor)}>Load More</button>
        )}
      </section>

      <section><h2>Review Summary</h2>
        {summary && <pre>{JSON.stringify(summary.overall, null, 2)}</pre>}
      </section>

      <section><h2>Settlement Audit Summary</h2>
        {settlement && <pre>{JSON.stringify({ counts: settlement.counts, amount: settlement.amounts?.itemsGrossAmount }, null, 2)}</pre>}
      </section>

      <section><h2>Reconciliation Gap Scan</h2>
        {gaps && <pre>{JSON.stringify(gaps.summary, null, 2)}</pre>}
      </section>
    </div>
  );
}
