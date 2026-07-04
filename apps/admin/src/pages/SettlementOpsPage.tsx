import { useState, useEffect, useCallback } from "react";
import { settlementApi, createApiClient } from "@xlb/api-client";

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

export function SettlementOpsPage() {
  const [cityCode, setCityCode] = useState("hangzhou");
  const [statements, setStatements] = useState<AuditItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settlement, setSettlement] = useState<SettlementAudit | null>(null);
  const [gaps, setGaps] = useState<GapScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [auditRes, summaryRes, settlementRes, gapRes] = await Promise.all([
        api.listStatementAudit({ cityCode }),
        api.getReviewSummary({ cityCode }),
        api.getSettlementAuditSummary({ cityCode }),
        api.scanReconciliationGaps({ cityCode }),
      ]);
      setStatements(auditRes.ok ? (auditRes.items as AuditItem[]) : []);
      setSummary(summaryRes.ok ? (summaryRes as unknown as Summary) : null);
      setSettlement(settlementRes.ok ? (settlementRes as unknown as SettlementAudit) : null);
      setGaps(gapRes.ok ? (gapRes as unknown as GapScan) : null);
    } catch (e) {
      setError(String(e));
    }
  }, [cityCode]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Settlement Operations Console</h1>
      <label>City: <input value={cityCode} onChange={(e) => setCityCode(e.target.value)} /></label>
      <button onClick={fetchAll}>Refresh</button>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      <section><h2>Statement Audit</h2>
        {statements.length === 0 ? <p>No statements</p> :
          <ul>{statements.slice(0, 10).map((s) => (
            <li key={s.statementId}>{s.statementId} — worker {s.workerId} — {s.status}
              {s.review ? ` — review: ${s.review.decision}` : " — pending review"}
              {s["export"] ? ` — hash: ${s["export"].contentHash?.slice(0, 8)}` : ""}
            </li>
          ))}</ul>}
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
