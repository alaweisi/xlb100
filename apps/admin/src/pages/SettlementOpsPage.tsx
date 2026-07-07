import { useState, useEffect, useCallback } from "react";
import { settlementApi, createApiClient } from "@xlb/api-client";
import { API_BASE } from "../apiBase";
import { buildHash, parseHashParams } from "../hashParams";
import { Button, Card, EmptyState, ErrorState, FormField, Input, LoadingState, StatCard, StatusTag, Table } from "@xlb/ui";

const client = createApiClient({ baseUrl: API_BASE, headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator" } });
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
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="Settlement Operations Console"
        actions={
          <>
            <StatusTag tone="primary">city_scope: {cityCode}</StatusTag>
            <StatusTag tone={loading ? "warning" : "success"}>{loading ? "loading" : "ready"}</StatusTag>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="City" description="All settlement audit requests keep the cityCode query scope visible.">
            <Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} />
          </FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={() => fetchAll()} variant="primary">Refresh</Button>
            {onNavigateToExports && <Button onClick={onNavigateToExports}>Settlement Exports</Button>}
            {onNavigateToGovernance && <Button onClick={onNavigateToGovernance}>Settlement Governance</Button>}
          </div>
        </div>
      </Card>

      {loading && <LoadingState title="Loading..." description="Reading statement audit, review summary, settlement totals and gap scan." />}
      {error && <ErrorState title="Error" description={error} action={<Button onClick={() => fetchAll()}>Retry</Button>} />}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <StatCard label="Statements" value={summary?.overall?.totalStatements ?? "--"} hint="review summary" tone="primary" />
        <StatCard label="Reviewed" value={summary?.overall?.reviewedStatements ?? "--"} hint="reviewed statements" tone="success" />
        <StatCard label="Cleared" value={summary?.overall?.approvedStatements ?? "--"} hint="review-cleared statements" tone="success" />
        <StatCard label="Gaps" value={gaps?.summary?.totalGaps ?? "--"} hint="reconciliation scan" tone={gaps?.summary?.totalGaps ? "warning" : "muted"} />
      </div>

      <Card title="Statement Audit" actions={<StatusTag tone="muted">{statements.length} rows</StatusTag>}>
        {!loading && statements.length === 0 ? (
          <EmptyState title="No statements" description="The API returned an empty audit list for this city scope." />
        ) : (
          <Table
            rows={statements}
            getRowKey={(s) => s.statementId}
            emptyText="No statements"
            columns={[
              {
                key: "statement",
                title: "Statement",
                render: (s) => (
                  <button
                    onClick={() => onNavigate?.(s.statementId)}
                    style={{ background: "transparent", border: 0, color: "#2563eb", cursor: "pointer", padding: 0, textAlign: "left" }}
                    type="button"
                  >
                    {s.statementId}
                  </button>
                ),
              },
              { key: "worker", title: "Worker", render: (s) => s.workerId },
              { key: "status", title: "Status", render: (s) => <StatusTag tone="primary">{s.status}</StatusTag> },
              { key: "review", title: "Review", render: (s) => s.review ? <StatusTag tone="success">{s.review.decision}</StatusTag> : <StatusTag tone="warning">pending review</StatusTag> },
              { key: "export", title: "Export", render: (s) => s.export ? s.export.contentHash?.slice(0, 8) : <StatusTag tone="muted">not exported</StatusTag> },
            ]}
          />
        )}
        {nextCursor && <div style={{ marginTop: 12 }}><Button onClick={() => fetchAll(nextCursor)}>Load More</Button></div>}
      </Card>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Card title="Review Summary">
          {summary ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(summary.overall, null, 2)}</pre> : <EmptyState title="No review summary" />}
        </Card>
        <Card title="Settlement Audit Summary">
          {settlement ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify({ counts: settlement.counts, amount: settlement.amounts?.itemsGrossAmount }, null, 2)}</pre> : <EmptyState title="No settlement summary" />}
        </Card>
        <Card title="Reconciliation Gap Scan">
          {gaps ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(gaps.summary, null, 2)}</pre> : <EmptyState title="No gap scan" />}
        </Card>
      </div>
    </div>
  );
}
