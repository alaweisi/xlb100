import { useState, useEffect } from "react";
import { adminSettlementApi as api } from "../adminAuth";
import { ApiErrorPanel, Button, Card, EmptyState, LoadingState, PriceText, ScopeBadge, StatusTag, Timeline } from "@xlb/ui";
import { cityLabel, eventLabel, formatDateTime, type OperationsFailure, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";
import "./mobile-core.css";

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

  if (loading) return <div className="admin-mobile-core"><LoadingState title="正在读取结算单详情" description="正在读取结算单、复核、导出和事件投递记录。" /></div>;
  if (error) return <div className="admin-mobile-core"><ApiErrorPanel title={error.title} detail={error.detail} action={<Button onClick={onBack}>返回运营台</Button>} /></div>;
  if (!data) return <div className="admin-mobile-core"><EmptyState title="暂无详情数据" action={<Button onClick={onBack}>返回运营台</Button>} /></div>;

  const { statement, review } = data;
  const exportRecord = data.export;
  const outboxEvent = data.exportedOutboxEvent;

  return (
    <div className="admin-mobile-core">
      <Card
        title="结算单详情"
        actions={
          <>
            {cityCode && <ScopeBadge scope={`城市：${cityLabel(cityCode)}`} />}
            {statement?.status && <StatusTag tone={statusTone(statement.status)}>{statusLabel(statement.status)}</StatusTag>}
          </>
        }
      >
        <div className="admin-mobile-summary" aria-label="结算单摘要">
          <div className="admin-mobile-summary__item"><span>结算单</span><strong>{statementId}</strong></div>
          <div className="admin-mobile-summary__item"><span>当前状态</span><strong>{statusLabel(statement?.status)}</strong></div>
          <div className="admin-mobile-summary__item"><span>总金额</span><strong>{statement ? <PriceText amount={statement.grossAmount} currency={statement.currency} /> : "—"}</strong></div>
          <div className="admin-mobile-summary__item"><span>师傅应收</span><strong>{statement ? <PriceText amount={statement.workerReceivableAmount} currency={statement.currency} /> : "—"}</strong></div>
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
          <dl className="admin-mobile-meta">
            <div><dt>结算单编号</dt><dd>{statement.statementId}</dd></div><div><dt>城市</dt><dd>{cityLabel(statement.cityCode)}</dd></div>
            <div><dt>师傅</dt><dd>{statement.workerId}</dd></div><div><dt>状态</dt><dd><StatusTag tone={statusTone(statement.status)}>{statusLabel(statement.status)}</StatusTag></dd></div>
            <div><dt>总金额</dt><dd><PriceText amount={statement.grossAmount} currency={statement.currency} /></dd></div><div><dt>平台服务费</dt><dd><PriceText amount={statement.platformFeeAmount} currency={statement.currency} /></dd></div>
            <div><dt>师傅应收</dt><dd><PriceText amount={statement.workerReceivableAmount} currency={statement.currency} /></dd></div><div><dt>项目数</dt><dd>{statement.itemCount}</dd></div>
            <div><dt>生成时间</dt><dd>{formatDateTime(statement.generatedAt)}</dd></div><div><dt>生成人</dt><dd>{statement.generatedBy}</dd></div>
          </dl>
        </Card>
      )}

      {review && (
        <Card title="复核" actions={<StatusTag tone="success">已复核</StatusTag>}>
          <dl className="admin-mobile-meta"><div><dt>决策</dt><dd>{statusLabel(review.decision)}</dd></div><div><dt>复核人</dt><dd>{review.reviewedBy}</dd></div>{review.reviewNote && <div><dt>备注</dt><dd>{review.reviewNote}</dd></div>}<div><dt>复核时间</dt><dd>{formatDateTime(review.reviewedAt)}</dd></div></dl>
        </Card>
      )}
      {!review && (
        <Card title="复核"><EmptyState title="尚未复核" /></Card>
      )}

      {exportRecord && (
        <Card title="导出记录" actions={<StatusTag tone="success">已记录</StatusTag>}>
          <dl className="admin-mobile-meta"><div><dt>导出编号</dt><dd>{exportRecord.exportId}</dd></div><div><dt>导出人</dt><dd>{exportRecord.exportedBy}</dd></div><div><dt>内容哈希</dt><dd>{exportRecord.contentHash}</dd></div><div><dt>导出时间</dt><dd>{formatDateTime(exportRecord.exportedAt)}</dd></div>{exportRecord.outboxEventId && <div><dt>投递事件编号</dt><dd>{exportRecord.outboxEventId}</dd></div>}</dl>
        </Card>
      )}
      {!exportRecord && (
        <Card title="导出记录"><EmptyState title="尚未导出" /></Card>
      )}

      {outboxEvent && (
        <Card title="事件投递" actions={<StatusTag tone={statusTone(outboxEvent.status)}>{statusLabel(outboxEvent.status)}</StatusTag>}>
          <dl className="admin-mobile-meta"><div><dt>事件编号</dt><dd>{outboxEvent.eventId}</dd></div><div><dt>类型</dt><dd>{eventLabel(outboxEvent.eventType)}</dd></div><div><dt>状态</dt><dd>{statusLabel(outboxEvent.status)}</dd></div>{outboxEvent.publishedAt && <div><dt>发布时间</dt><dd>{formatDateTime(outboxEvent.publishedAt)}</dd></div>}</dl>
        </Card>
      )}
      {!outboxEvent && (
        <Card title="事件投递"><EmptyState title="暂无事件投递记录" /></Card>
      )}

      <div className="admin-mobile-bottom-actions">
        {onNavigateToExports && cityCode && <Button onClick={() => onNavigateToExports({ statementId, cityCode })}>查看{cityLabel(cityCode)}导出记录</Button>}
        <Button onClick={onBack}>返回结算运营台</Button>
      </div>
    </div>
  );
}
