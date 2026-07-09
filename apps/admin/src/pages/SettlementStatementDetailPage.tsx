import { useState, useEffect } from "react";
import { adminSettlementApi as api } from "../adminAuth";
import { ApiErrorPanel, Button, Card, EmptyState, LoadingState, PriceText, ScopeBadge, StatusTag, Table, Timeline } from "@xlb/ui";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getStatementAuditDetail(statementId)
      .then((res: unknown) => {
        if (cancelled) return;
        const r = res as { ok: boolean };
        if (r.ok) {
          setData(res as DetailData);
        } else {
          setError("未找到结算单");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [statementId]);

  if (loading) return <LoadingState title={<>正在读取结算单详情 <CompatText parts={["Loading", "statement", "detail..."]} /></>} description="正在读取结算单、复核、导出和 outbox 记录。" />;
  if (error) return <ApiErrorPanel title="请求失败" detail={error} action={<Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>} />;
  if (!data) return <EmptyState title="暂无详情数据" action={<Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>} />;

  const { statement, review } = data;
  const exportRecord = data.export;
  const outboxEvent = data.exportedOutboxEvent;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title={<>结算单详情 <CompatText parts={["Statement", "Detail"]} /></>}
        actions={
          <>
            {cityCode && <ScopeBadge scope={`城市：${cityCode}`} />}
            {statement?.status && <StatusTag tone="success">{statement.status}</StatusTag>}
          </>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>
          {onNavigateToExports && cityCode && (
            <Button onClick={() => onNavigateToExports({ statementId, cityCode })}>
              查看 {cityCode} 导出记录
            </Button>
          )}
        </div>
      </Card>

      <Card title="审计时间线">
        <Timeline
          items={[
            { key: "generated", title: "已生成", description: statement?.generatedAt ?? "暂无结算单记录" },
            { key: "review", title: "复核", description: review ? `${review.decision} / ${review.reviewedBy}` : "尚未复核" },
            { key: "export", title: "导出记录", description: exportRecord ? exportRecord.exportedAt : "尚未导出" },
            { key: "outbox", title: "Outbox 事件", description: outboxEvent ? outboxEvent.status : "暂无 outbox 事件" },
          ]}
        />
      </Card>

      {statement && (
        <Card title="结算单">
          <Table
            rows={[
              ["结算单 ID", statement.statementId],
              ["城市", statement.cityCode],
              ["师傅", statement.workerId],
              ["状态", <StatusTag tone="success">{statement.status}</StatusTag>],
              ["币种", statement.currency],
              ["总金额", <PriceText amount={statement.grossAmount} currency={statement.currency} />],
              ["平台服务费", <PriceText amount={statement.platformFeeAmount} currency={statement.currency} />],
              ["师傅应收", <PriceText amount={statement.workerReceivableAmount} currency={statement.currency} />],
              ["项目数", statement.itemCount],
              ["生成时间", statement.generatedAt],
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
              ["决策", review.decision],
              ...(review.reviewNote ? [["备注", review.reviewNote] as [string, string]] : []),
              ["复核时间", review.reviewedAt],
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
              ["导出 ID", exportRecord.exportId],
              ["内容哈希", exportRecord.contentHash],
              ["导出时间", exportRecord.exportedAt],
              ["导出人", exportRecord.exportedBy],
              ...(exportRecord.outboxEventId ? [["Outbox 事件", exportRecord.outboxEventId] as [string, string]] : []),
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
        <Card title="Outbox 事件" actions={<StatusTag tone="primary">{outboxEvent.status}</StatusTag>}>
          <Table
            rows={[
              ["事件 ID", outboxEvent.eventId],
              ["类型", outboxEvent.eventType],
              ["状态", outboxEvent.status],
              ...(outboxEvent.publishedAt ? [["发布时间", outboxEvent.publishedAt] as [string, string]] : []),
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
        <Card title="Outbox 事件"><EmptyState title="暂无 outbox 事件" /></Card>
      )}

      <div><Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button></div>
    </div>
  );
}
