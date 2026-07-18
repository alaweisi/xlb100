import { useCallback, useEffect, useState } from "react";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, LoadingState, ScopeBadge, Select, StatusTag } from "@xlb/ui";
import { adminSettlementApi as api } from "../adminAuth";
import { buildHash, parseHashParams } from "../hashParams";
import { businessLabel, cityLabel, formatCurrency, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";
import "./mobile-core.css";

interface AuditItem { statementId: string; workerId: string; status: string; review: { decision: string } | null; export: { contentHash: string } | null; }
interface Summary { overall: { totalStatements: number; reviewedStatements: number; approvedStatements: number; exportedStatements: number }; }
interface SettlementAudit { counts: { totalBatches: number; totalItems: number; totalPayables: number; totalQueueItems: number }; amounts: { itemsGrossAmount: number }; }
interface GapScan { summary: { totalGaps: number; gapsByType: Record<string, number> }; }
interface Props { onNavigate?: (statementId: string) => void; onNavigateToExports?: () => void; onNavigateToGovernance?: () => void; initialCityCode?: string; }

export function SettlementOpsPage({ onNavigate, onNavigateToExports, onNavigateToGovernance, initialCityCode }: Props) {
  const params = parseHashParams();
  const online = useOnlineStatus();
  const [cityCode, setCityCode] = useState(initialCityCode || params.get("cityCode") || "hangzhou");
  const [statements, setStatements] = useState<AuditItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settlement, setSettlement] = useState<SettlementAudit | null>(null);
  const [gaps, setGaps] = useState<GapScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [partial, setPartial] = useState<string | null>(null);

  const fetchAll = useCallback(async (cursor?: string) => {
    if (!online) {
      setLoading(false); setStatements([]); setNextCursor(null); setSummary(null); setSettlement(null); setGaps(null); setPartial(null);
      const failure = presentFailure({ kind: "network" }, "结算运营数据");
      setError({ title: failure.title, detail: failure.detail });
      return;
    }
    setLoading(true); setError(null); setPartial(null);
    const query: Record<string, string> = { cityCode };
    if (cursor) query.cursor = cursor;
    const results = await Promise.allSettled([
      api.listStatementAudit(query), api.getReviewSummary({ cityCode }), api.getSettlementAuditSummary({ cityCode }), api.scanReconciliationGaps({ cityCode }),
    ]);
    const failed: string[] = [];
    const [auditRes, summaryRes, settlementRes, gapRes] = results;
    if (auditRes.status === "fulfilled" && auditRes.value.ok) {
      const rows = Array.isArray(auditRes.value.items) ? auditRes.value.items as AuditItem[] : [];
      setStatements(current => cursor ? [...current, ...rows] : rows); setNextCursor(auditRes.value.nextCursor || null);
    } else {
      const cause = auditRes.status === "rejected" ? auditRes.reason : new Error("结算单审计返回未成功");
      const failure = presentFailure(cause, "结算单审计列表"); setError({ title: failure.title, detail: failure.detail });
      if (failure.kind === "forbidden") { setStatements([]); setNextCursor(null); }
      failed.push("结算单列表");
    }
    if (summaryRes.status === "fulfilled" && summaryRes.value.ok && "overall" in summaryRes.value) setSummary(summaryRes.value as unknown as Summary); else { setSummary(null); failed.push("复核汇总"); }
    if (settlementRes.status === "fulfilled" && settlementRes.value.ok && "counts" in settlementRes.value && "amounts" in settlementRes.value) setSettlement(settlementRes.value as unknown as SettlementAudit); else { setSettlement(null); failed.push("结算审计汇总"); }
    if (gapRes.status === "fulfilled" && gapRes.value.ok && "summary" in gapRes.value) setGaps(gapRes.value as unknown as GapScan); else { setGaps(null); failed.push("对账差异扫描"); }
    if (failed.length > 0 && failed.length < 4) setPartial(`${failed.join("、")}暂不可用，页面保留其余已成功读取的数据。`);
    if (failed.length === 4) {
      const first = results.find(result => result.status === "rejected");
      const failure = presentFailure(first?.status === "rejected" ? first.reason : new Error("全部接口失败"), "结算运营数据");
      setError({ title: failure.title, detail: failure.detail });
    }
    setLoading(false);
  }, [cityCode, online]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);
  useEffect(() => { const target = buildHash("/settlement-ops", { cityCode }); if (window.location.hash !== target) window.location.hash = target; }, [cityCode]);

  return <div className="admin-mobile-core">
    <Card title="结算运营台" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? (loading ? "读取中" : "在线") : "离线"}</StatusTag></>}>
      <p>本页仅汇总审计、复核、导出与差异扫描结果，不执行付款、退款或服务商操作。</p>
      <details className="admin-mobile-filter" open><summary>城市筛选与操作入口</summary><div className="admin-mobile-filter__body"><FormField label="城市" description="所有结算审计请求均携带城市作用域。"><Select value={cityCode} onChange={event => setCityCode(event.target.value)}><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></Select></FormField><Button onClick={() => void fetchAll()} variant="primary" disabled={!online || loading}>刷新结算数据</Button></div></details>
    </Card>
    {!online && <ApiErrorPanel title="当前网络不可用" detail="页面不会把旧数据标记为最新；恢复网络后请刷新。" />}
    {loading && <LoadingState title="正在加载结算数据" description="并行读取结算单审计、复核汇总、结算汇总与差异扫描。" />}
    {error && <ApiErrorPanel title={error.title} detail={error.detail} action={<Button disabled={!online} onClick={() => void fetchAll()}>重试</Button>} />}
    {partial && <p role="status">{partial}</p>}
    <div className="admin-mobile-summary" aria-label="结算运营摘要"><div className="admin-mobile-summary__item"><span>结算单</span><strong>{summary?.overall.totalStatements ?? "—"}</strong></div><div className="admin-mobile-summary__item"><span>已复核</span><strong>{summary?.overall.reviewedStatements ?? "—"}</strong></div><div className="admin-mobile-summary__item"><span>已通过</span><strong>{summary?.overall.approvedStatements ?? "—"}</strong></div><div className="admin-mobile-summary__item"><span>对账差异</span><strong>{gaps?.summary.totalGaps ?? "—"}</strong></div></div>
    <Card title="结算单审计" actions={<StatusTag tone="muted">{statements.length} 条</StatusTag>}>
      {!loading && statements.length === 0 ? <EmptyState title="暂无结算单" description="当前城市作用域下，服务端返回空审计列表。" /> : <div className="admin-mobile-list">{statements.map(row => <article className="admin-mobile-item" key={row.statementId}><header className="admin-mobile-item__header"><h3>{row.statementId}</h3><StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag></header><dl className="admin-mobile-meta"><div><dt>师傅</dt><dd>{row.workerId}</dd></div><div><dt>复核</dt><dd>{row.review ? <StatusTag tone={statusTone(row.review.decision)}>{statusLabel(row.review.decision)}</StatusTag> : <StatusTag tone="warning">待复核</StatusTag>}</dd></div><div><dt>导出</dt><dd>{row.export ? `摘要 ${row.export.contentHash.slice(0, 8)}` : "未导出"}</dd></div></dl>{onNavigate && <div className="admin-mobile-item__actions"><Button onClick={() => onNavigate(row.statementId)}>查看结算单详情</Button></div>}</article>)}</div>}
      {nextCursor && <div style={{ marginTop: 12 }}><Button disabled={!online || loading} onClick={() => void fetchAll(nextCursor)}>加载更多</Button></div>}
    </Card>
    <div className="admin-mobile-stack">
      <Card title="复核汇总">{summary ? <dl className="admin-mobile-meta"><div><dt>全部结算单</dt><dd>{summary.overall.totalStatements}</dd></div><div><dt>已复核</dt><dd>{summary.overall.reviewedStatements}</dd></div><div><dt>复核通过</dt><dd>{summary.overall.approvedStatements}</dd></div><div><dt>已导出</dt><dd>{summary.overall.exportedStatements}</dd></div></dl> : <EmptyState title="暂无复核汇总" />}</Card>
      <Card title="结算审计汇总">{settlement ? <dl className="admin-mobile-meta"><div><dt>结算批次</dt><dd>{settlement.counts.totalBatches}</dd></div><div><dt>结算项目</dt><dd>{settlement.counts.totalItems}</dd></div><div><dt>应付款项</dt><dd>{settlement.counts.totalPayables}</dd></div><div><dt>队列项目</dt><dd>{settlement.counts.totalQueueItems}</dd></div><div><dt>项目总额</dt><dd>{formatCurrency(settlement.amounts.itemsGrossAmount)}</dd></div></dl> : <EmptyState title="暂无结算审计汇总" />}</Card>
      <Card title="对账差异扫描">{gaps ? <dl className="admin-mobile-meta"><div><dt>差异总数</dt><dd>{gaps.summary.totalGaps}</dd></div>{Object.entries(gaps.summary.gapsByType).map(([type, count]) => <div key={type}><dt>{businessLabel(type)}</dt><dd>{count}</dd></div>)}</dl> : <EmptyState title="暂无差异扫描结果" />}</Card>
    </div>
    <div className="admin-mobile-bottom-actions"><div className="admin-mobile-actions">{onNavigateToExports && <Button onClick={onNavigateToExports}>导出复核</Button>}{onNavigateToGovernance && <Button onClick={onNavigateToGovernance}>结算动作治理</Button>}</div><Button onClick={() => void fetchAll()} variant="primary" disabled={!online || loading}>刷新最新数据</Button></div>
  </div>;
}
