import { useState, useEffect } from "react";
import { adminSettlementApi as api } from "../adminAuth";
import { ApiErrorPanel, Button, Card, EmptyState, LoadingState, PriceText, ScopeBadge, StatusTag, Table, Timeline } from "@xlb/ui";
import { cityLabel, formatDateTime, type OperationsFailure, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";

interface DetailData {
  statement: {
    statementId: string; cityCode: string; workerId: string;
    settlementBatchId: string; queueId: string; settlementPayableId: string;
    currency: string; grossAmount: number; platformFeeAmount: number;
    workerReceivableAmount: number; itemCount: number;
    status: string; generatedAt: string; generatedBy: string;
    createdAt: string; updatedAt: string;
  } | null;
  review: {
    reviewId: string; decision: string; reviewNote: string | null;
    reviewedAt: string; reviewedBy: string;
  } | null;
  export: {
    exportId: string; contentHash: string;
    exportedAt: string; exportedBy: string; outboxEventId: string | null;
  } | null;
  exportedOutboxEvent: {
    eventId: string; eventType: string;
    status: string; publishedAt: string | null;
  } | null;
}

interface Props {
  statementId: string;
  onBack: () => void;
  cityCode?: string;
  onNavigateToExports?: (extra?: Record<string, string>) => void;
}

export function SettlementStatementDetailPage({ statementId, onBack, cityCode, onNavigateToExports }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<OperationsFailure | null>(null);
  const online = useOnlineStatus();

  useEffect(() => {
    let cancelled = false;
    if (!online) {
      setLoading(false);
      setData(null);
      setError(presentFailure({ kind: "network" }, "结算单详情"));
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    api.getStatementAuditDetail(statementId)
      .then((res: unknown) => {
        if (cancelled) return;
        const r = res as { ok: boolean };
        if (r.ok) {
          setData(res as DetailData);
        } else {
          setData(null);
          setError({ kind: "unknown", title: "未找到结算单", detail: "服务端未返回该结算单的审计详情；页面不会推测或补造记录。" });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(presentFailure(e, "结算单详情"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [online, statementId]);

  if (loading) return <LoadingState title="正在读取结算单详情" description="正在读取结算单、复核、导出和事件投递记录。" />;
  if (error) return <ApiErrorPanel title={error.title} detail={error.detail} action={<Button onClick={onBack}>返回运营台</Button>} />;
  if (!data) return <EmptyState title="暂无详情数据" action={<Button onClick={onBack}>返回运营台</Button>} />;

  const { statement, review } = data;
  const exportRecord = data.export;
  const outboxEvent = data.exportedOutboxEvent;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="结算单详情"
        actions={
          <>
            {cityCode && <ScopeBadge scope={`城市：${cityLabel(cityCode)}`} />}
            {statement?.status && <StatusTag tone={statusTone(statement.status)}>{statusLabel(statement.status)}</StatusTag>}
          </>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button onClick={onBack}>返回运营台</Button>
          {onNavigateToExports && cityCode && (
            <Button onClick={() => onNavigateToExports({ statementId, cityCode })}>
              查看{cityLabel(cityCode)}导出记录
            </Button>
          )}
        </div>
      </Card>

      <Card title="审计时间线">
        <Timeline
          items={[
            { key: "generated", title: "已生成", description: statement ? formatDateTime(statement.generatedAt) : "暂无结算单记录" },
            { key: "review", title: "复核", description: review ? `${statusLabel(review.decision)} · ${review.reviewedBy}` : "尚未复核" },
            { key: "export", title: "导出记录", description: exportRecord ? formatDateTime(exportRecord.exportedAt) : "尚未导出" },
            { key: "delivery", title: "事件投递", description: outboxEvent ? statusLabel(outboxEvent.status) : "暂无事件投递记录" },
          ]}
        />
      </Card>

      {statement && (
        <Card title="结算单">
          <Table
            rows={[
              ["结算单编号", statement.statementId],
              ["城市", cityLabel(statement.cityCode)],
              ["师傅", statement.workerId],
              ["状态", <StatusTag tone={statusTone(statement.status)}>{statusLabel(statement.status)}</StatusTag>],
              ["币种", statement.currency],
              ["总金额", <PriceText amount={statement.grossAmount} currency={statement.currency} />],
              ["平台服务费", <PriceText amount={statement.platformFeeAmount} currency={statement.currency} />],
              ["师傅应收", <PriceText amount={statement.workerReceivableAmount} currency={statement.currency} />],
              ["项目数", statement.itemCount],
              ["生成时间", formatDateTime(statement.generatedAt)],
              ["生成人", statement.generatedBy],
            ]}
            getRowKey={(row) => String(row[0])}
            columns={[
              { key: "field", title: "字段", render: (row) => row[0], width: 220 },
              { key: "value", title: "值", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}

      {review && (
        <Card title="复核" actions={<StatusTag tone="success">已复核</StatusTag>}>
          <Table
            rows={[
              ["决策", statusLabel(review.decision)],
              ...(review.reviewNote ? [["备注", review.reviewNote] as [string, string]] : []),
              ["复核时间", formatDateTime(review.reviewedAt)],
              ["复核人", review.reviewedBy],
            ]}
            getRowKey={(row) => String(row[0])}
            columns={[
              { key: "field", title: "字段", render: (row) => row[0], width: 220 },
              { key: "value", title: "值", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}
      {!review && (
        <Card title="复核"><EmptyState title="尚未复核" /></Card>
      )}

      {exportRecord && (
        <Card title="导出记录" actions={<StatusTag tone="success">已记录</StatusTag>}>
          <Table
            rows={[
              ["导出编号", exportRecord.exportId],
              ["内容哈希", exportRecord.contentHash],
              ["导出时间", formatDateTime(exportRecord.exportedAt)],
              ["导出人", exportRecord.exportedBy],
              ...(exportRecord.outboxEventId ? [["投递事件编号", exportRecord.outboxEventId] as [string, string]] : []),
            ]}
            getRowKey={(row) => String(row[0])}
            columns={[
              { key: "field", title: "字段", render: (row) => row[0], width: 220 },
              { key: "value", title: "值", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}
      {!exportRecord && (
        <Card title="导出记录"><EmptyState title="尚未导出" /></Card>
      )}

      {outboxEvent && (
        <Card title="事件投递" actions={<StatusTag tone={statusTone(outboxEvent.status)}>{statusLabel(outboxEvent.status)}</StatusTag>}>
          <Table
            rows={[
              ["事件编号", outboxEvent.eventId],
              ["类型", outboxEvent.eventType],
              ["状态", statusLabel(outboxEvent.status)],
              ...(outboxEvent.publishedAt ? [["发布时间", formatDateTime(outboxEvent.publishedAt)] as [string, string]] : []),
            ]}
            getRowKey={(row) => String(row[0])}
            columns={[
              { key: "field", title: "字段", render: (row) => row[0], width: 220 },
              { key: "value", title: "值", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}
      {!outboxEvent && (
        <Card title="事件投递"><EmptyState title="暂无事件投递记录" /></Card>
      )}

      <div><Button onClick={onBack}>返回运营台</Button></div>
    </div>
  );
}
