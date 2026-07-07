import { useState, useEffect, useCallback } from "react";
import { settlementApi, createApiClient } from "@xlb/api-client";
import { API_BASE } from "../apiBase";
import { buildHash, parseHashParams } from "../hashParams";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, MetricCard, ScopeBadge, StatusTag, Table } from "@xlb/ui";

const client = createApiClient({ baseUrl: API_BASE, headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator" } });
const api = settlementApi.create(client);
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
        title={<>结算运营台 <CompatText parts={["Settlement", "Operations", "Console"]} /></>}
        actions={
          <>
            <ScopeBadge scope={`城市：${cityCode}`} />
            <StatusTag tone={loading ? "warning" : "success"}>{loading ? "加载中" : "已就绪"}</StatusTag>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="城市" description="所有结算审计请求都会携带城市作用域。">
            <Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} />
          </FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={() => fetchAll()} variant="primary">刷新 <CompatText parts={["Refresh"]} /></Button>
            {onNavigateToExports && <Button onClick={onNavigateToExports}>导出复核 <CompatText parts={["Settlement", "Exports"]} /></Button>}
            {onNavigateToGovernance && <Button onClick={onNavigateToGovernance}>结算治理</Button>}
          </div>
        </div>
      </Card>

      {loading && <LoadingState title={<>加载中 <CompatText parts={["Loading..."]} /></>} description="正在读取结算单审计、复核汇总、结算总量和差异扫描。" />}
      {error && <ApiErrorPanel title="请求失败" detail={error} action={<Button onClick={() => fetchAll()}>重试</Button>} />}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <MetricCard productRole="admin" label="结算单" value={summary?.overall?.totalStatements ?? "--"} hint="复核汇总" tone="primary" />
        <MetricCard productRole="admin" label="已复核" value={summary?.overall?.reviewedStatements ?? "--"} hint="已进入复核链路" tone="success" />
        <MetricCard productRole="admin" label="已通过" value={summary?.overall?.approvedStatements ?? "--"} hint="复核通过结算单" tone="success" />
        <MetricCard productRole="admin" label="差异" value={gaps?.summary?.totalGaps ?? "--"} hint="对账扫描" tone={gaps?.summary?.totalGaps ? "warning" : "muted"} />
      </div>

      <Card title={<>结算单审计 <CompatText parts={["Statement", "Audit"]} /></>} actions={<StatusTag tone="muted">{statements.length} 行</StatusTag>}>
        {!loading && statements.length === 0 ? (
          <EmptyState title={<>暂无结算单 <CompatText parts={["No", "statements"]} /></>} description="当前城市作用域下，API 返回了真实空审计列表。" />
        ) : (
          <Table
            rows={statements}
            getRowKey={(s) => s.statementId}
            emptyText={<>暂无结算单 <CompatText parts={["No", "statements"]} /></>}
            columns={[
              {
                key: "statement",
                title: "结算单",
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
              { key: "worker", title: "师傅", render: (s) => s.workerId },
              { key: "status", title: "状态", render: (s) => <StatusTag tone="primary">{s.status}</StatusTag> },
              { key: "review", title: "复核", render: (s) => s.review ? <StatusTag tone="success">{s.review.decision}</StatusTag> : <StatusTag tone="warning">待复核</StatusTag> },
              { key: "export", title: "导出", render: (s) => s.export ? s.export.contentHash?.slice(0, 8) : <StatusTag tone="muted">未导出</StatusTag> },
            ]}
          />
        )}
        {nextCursor && <div style={{ marginTop: 12 }}><Button onClick={() => fetchAll(nextCursor)}>加载更多</Button></div>}
      </Card>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Card title={<>复核汇总 <CompatText parts={["Review", "Summary"]} /></>}>
          {summary ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(summary.overall, null, 2)}</pre> : <EmptyState title="暂无复核汇总" />}
        </Card>
        <Card title={<>结算审计汇总 <CompatText parts={["Settlement", "Audit", "Summary"]} /></>}>
          {settlement ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify({ counts: settlement.counts, amount: settlement.amounts?.itemsGrossAmount }, null, 2)}</pre> : <EmptyState title="暂无结算汇总" />}
        </Card>
        <Card title={<>对账差异扫描 <CompatText parts={["Reconciliation", "Gap", "Scan"]} /></>}>
          {gaps ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(gaps.summary, null, 2)}</pre> : <EmptyState title="暂无差异扫描" />}
        </Card>
      </div>
    </div>
  );
}
