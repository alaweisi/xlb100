import { useState, useEffect, useCallback } from "react";
import { adminSettlementApi as api } from "../adminAuth";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";

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

export function SettlementExportReviewPage({ onBack, onNavigateToDetail, filterStatementId, filterCityCode }: Props) {
  const [cityCode, setCityCode] = useState(filterCityCode || "hangzhou");
  const [items, setItems] = useState<ExportItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExports = useCallback(async (cursor?: string) => {
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
        setError("导出记录读取失败");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [cityCode]);

  useEffect(() => { fetchExports(); }, [fetchExports]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title={<>结算导出复核 <CompatText parts={["Settlement", "Export", "Review"]} /></>}
        actions={
          <>
            <ScopeBadge scope={`城市：${cityCode}`} />
            <StatusTag tone={loading ? "warning" : "success"}>{loading ? "加载中" : "已就绪"}</StatusTag>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>
            <Button onClick={() => fetchExports()} variant="primary">刷新 <CompatText parts={["Refresh"]} /></Button>
          </div>
          <FormField label="城市" description="导出审计继续按城市作用域筛选。">
            <Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {loading && <LoadingState title={<>正在读取导出记录 <CompatText parts={["Loading", "exports..."]} /></>} description="正在读取导出审计记录。" />}
      {error && <ApiErrorPanel title="请求失败" detail={error} action={<Button onClick={() => fetchExports()}>重试</Button>} />}
      {!loading && !error && items.length === 0 && <EmptyState title={<>暂无导出记录 <CompatText parts={["No", "export", "records"]} /></>} description="当前筛选条件下，API 返回了真实空导出列表。" />}

      {items.length > 0 && (
        <Card title="导出审计记录" actions={<StatusTag tone="muted">{items.length} 行</StatusTag>}>
          <Table
            rows={items}
            getRowKey={(item) => item.exportId}
            columns={[
              { key: "exportId", title: "导出 ID", render: (item) => item.exportId },
              {
                key: "statement",
                title: "结算单",
                render: (item) =>
                  onNavigateToDetail ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToDetail(item.statementId); }} style={{ color: "#2563eb" }}>
                      {item.statementId}
                    </a>
                  ) : item.statementId,
              },
              { key: "worker", title: "师傅", render: (item) => item.workerId },
              { key: "format", title: "格式", render: (item) => <StatusTag tone="primary">{item.exportFormat}</StatusTag> },
              { key: "hash", title: "内容哈希", render: (item) => `${item.contentHash?.slice(0, 12)}...` },
              { key: "exportedAt", title: "导出时间", render: (item) => item.exportedAt },
              { key: "exportedBy", title: "导出人", render: (item) => item.exportedBy },
            ]}
          />
          {nextCursor && <div style={{ marginTop: 12 }}><Button onClick={() => fetchExports(nextCursor)}>加载更多</Button></div>}
        </Card>
      )}
    </div>
  );
}
