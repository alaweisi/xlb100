import { useState, useEffect, useCallback } from "react";
import { adminSettlementApi as api } from "../adminAuth";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, LoadingState, ScopeBadge, Select, StatusTag } from "@xlb/ui";
import { cityLabel, formatDateTime, type OperationsFailure, presentFailure, useOnlineStatus } from "../operationsPresentation";
import "./mobile-core.css";

interface ExportItem {
  exportId: string; cityCode: string; statementId: string;
  reviewId: string | null; workerId: string;
  exportFormat: string; payloadVersion: string;
  contentHash: string; exportedAt: string; exportedBy: string;
  outboxEventId: string | null;
}

interface Props {
  onBack: () => void;
  onNavigateToDetail?: (statementId: string) => void;
  filterStatementId?: string;
  filterCityCode?: string;
}

function exportFormatLabel(value: string): string {
  if (value.toLowerCase() === "csv") return "CSV 文件";
  if (value.toLowerCase() === "json") return "JSON 文件";
  if (value.toLowerCase() === "xlsx") return "Excel 文件";
  return "结构化导出文件";
}

export function SettlementExportReviewPage({ onBack, onNavigateToDetail, filterStatementId, filterCityCode }: Props) {
  const [cityCode, setCityCode] = useState(filterCityCode || "hangzhou");
  const [items, setItems] = useState<ExportItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<OperationsFailure | null>(null);
  const online = useOnlineStatus();

  const fetchExports = useCallback(async (cursor?: string) => {
    if (!online) {
      setLoading(false);
      setItems([]);
      setNextCursor(null);
      setError(presentFailure({ kind: "network" }, "结算导出记录"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string> = { cityCode };
      if (cursor) query.cursor = cursor;
      if (filterStatementId) query.statementId = filterStatementId;
      const res = await api.listExportAudit(query);
      if (res.ok) {
        setItems(res.items as ExportItem[]);
        setNextCursor(res.nextCursor);
      } else {
        setItems([]);
        setNextCursor(null);
        setError({ kind: "unknown", title: "导出记录读取失败", detail: "服务端未返回可用的导出审计记录，页面不会使用旧列表冒充最新结果。" });
      }
    } catch (e) {
      setItems([]);
      setNextCursor(null);
      setError(presentFailure(e, "结算导出记录"));
    } finally {
      setLoading(false);
    }
  }, [cityCode, filterStatementId, online]);

  useEffect(() => { fetchExports(); }, [fetchExports]);

  return (
    <div className="admin-mobile-core">
      <Card
        title="结算导出复核"
        actions={
          <>
            <ScopeBadge scope={`城市：${cityLabel(cityCode)}`} />
            <StatusTag tone={loading ? "warning" : "success"}>{loading ? "加载中" : "已就绪"}</StatusTag>
          </>
        }
      >
        <div className="admin-mobile-summary" aria-label="导出复核摘要">
          <div className="admin-mobile-summary__item"><span>当前记录</span><strong>{items.length}</strong></div>
          <div className="admin-mobile-summary__item"><span>结算单筛选</span><strong>{filterStatementId || "全部"}</strong></div>
        </div>
        <details className="admin-mobile-filter" open>
          <summary>筛选与刷新</summary>
          <div className="admin-mobile-filter__body">
            <FormField label="城市" description="导出审计继续按城市作用域筛选。">
              <Select value={cityCode} onChange={(e) => setCityCode(e.target.value)}><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></Select>
            </FormField>
            <Button onClick={() => fetchExports()} variant="primary" disabled={!online}>刷新记录</Button>
          </div>
        </details>
      </Card>

      {loading && <LoadingState title="正在读取导出记录" description="正在读取导出审计记录。" />}
      {error && <ApiErrorPanel title={error.title} detail={error.detail} action={<Button onClick={() => fetchExports()} disabled={!online}>重试</Button>} />}
      {!loading && !error && items.length === 0 && <EmptyState title="暂无导出记录" description="当前筛选条件下，服务端返回了真实空导出列表。" />}

      {items.length > 0 && (
        <Card title="导出审计记录" actions={<StatusTag tone="muted">{items.length} 条</StatusTag>}>
          <div className="admin-mobile-list">
            {items.map((item) => <article className="admin-mobile-item" key={item.exportId}>
              <header className="admin-mobile-item__header"><h3>{item.statementId}</h3><StatusTag tone="primary">{exportFormatLabel(item.exportFormat)}</StatusTag></header>
              <dl className="admin-mobile-meta">
                <div><dt>导出编号</dt><dd>{item.exportId}</dd></div><div><dt>师傅</dt><dd>{item.workerId}</dd></div>
                <div><dt>导出时间</dt><dd>{formatDateTime(item.exportedAt)}</dd></div><div><dt>导出人</dt><dd>{item.exportedBy}</dd></div>
                <div><dt>内容哈希</dt><dd>{item.contentHash?.slice(0, 12)}…</dd></div><div><dt>事件编号</dt><dd>{item.outboxEventId || "未关联"}</dd></div>
              </dl>
              {onNavigateToDetail && <div className="admin-mobile-item__actions"><Button onClick={() => onNavigateToDetail(item.statementId)}>查看结算单详情</Button></div>}
            </article>)}
          </div>
          {nextCursor && <div style={{ marginTop: 12 }}><Button onClick={() => fetchExports(nextCursor)}>加载更多</Button></div>}
        </Card>
      )}
      <div className="admin-mobile-bottom-actions"><Button onClick={onBack}>返回结算运营台</Button></div>
    </div>
  );
}
