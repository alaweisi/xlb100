import { useCallback, useEffect, useState } from "react";
import type { FulfillmentEvidenceAggregateResponse } from "@xlb/api-client";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, Select, StatusTag } from "@xlb/ui";
import { adminOrderTraceApi } from "../adminAuth";
import { buildHash, parseHashParams } from "../hashParams";
import {
  cityLabel,
  eventLabel,
  formatCurrency,
  formatDateTime,
  presentFailure,
  reasonLabel,
  statusLabel,
  statusTone,
  useOnlineStatus,
  type OperationsFailure,
} from "../operationsPresentation";
import "./operations-workbench.css";
import "./mobile-core.css";

type AdminApi = typeof adminOrderTraceApi;
type OrderTrace = Awaited<ReturnType<AdminApi["getOrderTrace"]>>["trace"];

interface Props {
  initialCityCode?: string;
  initialOrderId?: string;
}

interface TraceRow {
  key: string;
  stage: string;
  id: string;
  actor: string;
  status: string | null;
  amount: string;
  note: string;
}

function formatMinorMoney(amountMinor?: number | null, currency?: string | null): string {
  return amountMinor == null ? "—" : formatCurrency(amountMinor / 100, currency || "CNY");
}

function pricingSourceLabel(source?: string | null): string {
  if (source === "public") return "公开定价";
  if (source === "enterprise") return "企业定价";
  if (source === "marketing") return "营销定价";
  if (source === "legacy") return "历史定价快照";
  return "未记录定价来源";
}

function evidenceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    before_photo: "服务前照片",
    after_photo: "服务后照片",
    customer_signature: "客户签字",
    completion_note: "完工说明",
    complaint_photo: "投诉凭证",
  };
  return labels[type] ?? `履约凭证（${type}）`;
}

export function OrderTracePage({ initialCityCode, initialOrderId }: Props) {
  const params = parseHashParams();
  const online = useOnlineStatus();
  const [cityCode, setCityCode] = useState(initialCityCode || params.get("cityCode") || "hangzhou");
  const [orderId, setOrderId] = useState(initialOrderId || params.get("orderId") || "");
  const [trace, setTrace] = useState<OrderTrace | null>(null);
  const [evidence, setEvidence] = useState<FulfillmentEvidenceAggregateResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<OperationsFailure | null>(null);
  const [evidenceFailure, setEvidenceFailure] = useState<OperationsFailure | null>(null);

  const loadTrace = useCallback(async () => {
    const nextOrderId = orderId.trim();
    const nextCityCode = cityCode.trim();
    if (!nextOrderId || !nextCityCode) {
      setTrace(null);
      setEvidence([]);
      setFailure(null);
      setEvidenceFailure(null);
      return;
    }

    setLoading(true);
    setFailure(null);
    setEvidenceFailure(null);
    window.location.hash = buildHash("/order-trace", { cityCode: nextCityCode, orderId: nextOrderId });
    try {
      const [traceResult, evidenceResult] = await Promise.allSettled([
        adminOrderTraceApi.getOrderTrace(nextOrderId),
        adminOrderTraceApi.getOrderFulfillmentEvidence(nextOrderId),
      ]);
      if (traceResult.status === "rejected") {
        setTrace(null);
        setEvidence([]);
        setFailure(presentFailure(traceResult.reason, "订单追踪"));
        return;
      }
      setTrace(traceResult.value.trace);
      if (evidenceResult.status === "fulfilled") {
        setEvidence(evidenceResult.value.aggregates);
      } else {
        setEvidence([]);
        setEvidenceFailure(presentFailure(evidenceResult.reason, "履约凭证"));
      }
    } finally {
      setLoading(false);
    }
  }, [cityCode, orderId]);

  useEffect(() => {
    if (initialOrderId?.trim()) void loadTrace();
  }, []);

  const rows: TraceRow[] = trace ? [
    { key: "order", stage: "订单创建", id: trace.order.orderId, actor: trace.order.customerId, status: trace.order.status, amount: formatCurrency(trace.order.totalAmount, trace.order.currency), note: trace.order.skuName },
    { key: "payment", stage: "支付", id: trace.payment?.paymentOrderId || "—", actor: trace.payment?.provider || "—", status: trace.payment?.status || null, amount: trace.payment ? formatCurrency(trace.payment.amount, trace.payment.currency || "CNY") : "—", note: formatDateTime(trace.payment?.updatedAt) },
    { key: "marketing", stage: "定价与营销", id: trace.pricing?.marketingDecision?.decisionId || "—", actor: trace.pricing?.marketingDecision?.grantId || "—", status: null, amount: trace.pricing ? `${formatMinorMoney(trace.pricing.grossAmountMinor, trace.pricing.currency)} − ${formatMinorMoney(trace.pricing.discountAmountMinor, trace.pricing.currency)} = ${formatMinorMoney(trace.pricing.netAmountMinor, trace.pricing.currency)}` : "—", note: trace.pricing?.marketingDecision ? `规则版本 ${trace.pricing.marketingDecision.ruleRevisionId}；预占 ${trace.pricing.marketingDecision.reservationId}；核销 ${trace.pricing.marketingDecision.redemptionId}` : pricingSourceLabel(trace.pricing?.source) },
    { key: "dispatch", stage: "派单", id: trace.dispatch?.dispatchTaskId || "—", actor: "—", status: trace.dispatch?.status || null, amount: "—", note: trace.dispatch?.customerMessage ? reasonLabel(trace.dispatch.customerMessage) : formatDateTime(trace.dispatch?.updatedAt) },
    { key: "fulfillment", stage: "履约", id: trace.fulfillment?.fulfillmentId || "—", actor: trace.fulfillment?.workerId || "—", status: trace.fulfillment?.status || null, amount: "—", note: formatDateTime(trace.fulfillment?.completedAt || trace.fulfillment?.startedAt) },
    { key: "review", stage: "评价", id: trace.review?.reviewId || "—", actor: trace.order.customerId, status: trace.review?.status || null, amount: trace.review ? `${trace.review.rating} 分（满分 5 分）` : "—", note: trace.review?.commentRestricted ? "评价正文仅限评价治理工作台查看" : "—" },
    { key: "aftersale", stage: "退款记录", id: trace.aftersale?.refundId || "—", actor: trace.order.customerId, status: trace.aftersale?.status || null, amount: trace.aftersale ? formatCurrency(trace.aftersale.amount, trace.aftersale.currency || "CNY") : "—", note: trace.aftersale?.reason || "—" },
    { key: "reverse", stage: "订单变更", id: trace.phase17Aftersale.reverseRequests.at(-1)?.reverseRequestId || "—", actor: trace.order.customerId, status: trace.phase17Aftersale.reverseRequests.at(-1)?.status || null, amount: "—", note: trace.phase17Aftersale.reverseRequests.at(-1)?.reason || "—" },
    { key: "complaint", stage: "投诉", id: trace.phase17Aftersale.complaints.at(-1)?.complaintId || "—", actor: trace.order.customerId, status: trace.phase17Aftersale.complaints.at(-1)?.status || null, amount: "—", note: trace.phase17Aftersale.complaints.at(-1)?.resolutionNote || trace.phase17Aftersale.complaints.at(-1)?.description || "—" },
  ] : [];

  return (
    <div className="operations-workbench admin-mobile-core">
      <Card title="订单全链路追踪" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone="muted">只读查询</StatusTag><StatusTag tone={online ? "success" : "danger"}>{online ? "服务已连接" : "当前离线"}</StatusTag></>}>
        <details className="admin-mobile-filter" open><summary>订单筛选</summary><div className="admin-mobile-filter__body"><FormField label="城市"><Select value={cityCode} onChange={(event) => setCityCode(event.target.value)}><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></Select></FormField><FormField label="订单编号"><Input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="输入完整订单编号" /></FormField></div></details>
      </Card>

      {!online && <div className="operations-alert operations-alert--offline" role="status">网络已断开，无法执行新的订单查询。当前页面如有数据，仅代表上次成功读取的结果。</div>}
      {loading && <LoadingState title="正在读取订单全链路" description="正在读取订单、支付、派单、履约、评价、售后与履约凭证。" />}
      {failure && <ApiErrorPanel title={failure.title} detail={failure.detail} action={<Button onClick={() => void loadTrace()}>重新查询</Button>} />}
      {evidenceFailure && <div className="operations-alert" role="status">部分结果：订单主链路已成功读取，但履约凭证未能更新（{evidenceFailure.title}）。页面不会把凭证空白解释为“没有凭证”。</div>}
      {!loading && !failure && !trace && <EmptyState title="尚未选择订单" description="输入当前城市范围内的订单编号，查询支付、派单、履约、评价和售后状态。" />}

      {trace && !loading && (
        <>
          <div className="admin-mobile-summary" aria-label="订单当前状态">
            {[['订单编号', trace.order.orderId], ['订单状态', statusLabel(trace.order.status)], ['订单金额', formatCurrency(trace.order.totalAmount, trace.order.currency)], ['服务项目', trace.order.skuName], ['支付状态', statusLabel(trace.payment?.status)], ['派单状态', statusLabel(trace.dispatch?.status)], ['履约师傅', trace.fulfillment?.workerId || '尚未分配'], ['售后状态', statusLabel(trace.aftersale?.status)]].map(([label, value]) => <div className="admin-mobile-summary__item" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>

          <Card title="业务阶段">
            <div className="admin-mobile-list">{rows.map(row => <article className="admin-mobile-item" key={row.key}><header className="admin-mobile-item__header"><h3>{row.stage}</h3>{row.status ? <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> : null}</header><dl className="admin-mobile-meta"><div><dt>业务编号</dt><dd>{row.id}</dd></div><div><dt>关联主体</dt><dd>{row.actor}</dd></div><div><dt>金额 / 评分</dt><dd>{row.amount}</dd></div><div><dt>说明</dt><dd>{row.note}</dd></div></dl></article>)}</div>
          </Card>

          <div className="dispatch-layout">
            <Card title="履约凭证" actions={<StatusTag tone="warning">敏感资料受控展示</StatusTag>}>
              {evidenceFailure ? <EmptyState title="履约凭证未能读取" description="主链路结果仍可核对；请修复权限或网络后重新查询凭证。" /> : evidence.length === 0 ? <EmptyState title="当前订单暂无履约凭证" description="该结论来自本次成功的履约凭证接口响应。" /> : evidence.map((aggregate) => (
                <section key={aggregate.fulfillmentId} className="operations-panel">
                  <h3>{aggregate.fulfillmentId} <StatusTag tone={statusTone(aggregate.confirmation?.status ?? "pending")}>{statusLabel(aggregate.confirmation?.status ?? "pending")}</StatusTag></h3>
                  {aggregate.evidence.length === 0 ? <EmptyState title="该履约记录暂无凭证节点" /> : <div className="admin-mobile-list">{aggregate.evidence.map(item => <article className="admin-mobile-item" key={item.evidenceId}><header className="admin-mobile-item__header"><h3>{evidenceTypeLabel(item.evidenceType)}</h3><StatusTag tone={statusTone(item.mediaAsset.storage.providerStatus)}>{statusLabel(item.mediaAsset.storage.providerStatus)}</StatusTag></header><dl className="admin-mobile-meta"><div><dt>关联投诉</dt><dd>{item.complaintId || "—"}</dd></div><div><dt>校验摘要</dt><dd>{item.mediaAsset.checksumSha256.slice(0, 16)}</dd></div></dl></article>)}</div>}
                </section>
              ))}
            </Card>

            <Card title="派单事件时间线">
              {trace.dispatch?.timeline.length ? <div className="admin-mobile-list">{trace.dispatch.timeline.map(row => <article className="admin-mobile-item" key={row.dispatchEventId}><header className="admin-mobile-item__header"><h3>{eventLabel(row.eventType)}</h3><span>{formatDateTime(row.createdAt)}</span></header><dl className="admin-mobile-meta"><div><dt>关联师傅</dt><dd>{row.workerId || "—"}</dd></div><div><dt>原因</dt><dd>{reasonLabel(row.reason)}</dd></div></dl></article>)}</div> : <EmptyState title="当前订单暂无派单事件" description="派单任务产生事件后，将按服务端时间顺序展示。" />}
            </Card>
          </div>
        </>
      )}
      <div className="admin-mobile-bottom-actions"><Button variant="primary" onClick={() => void loadTrace()} disabled={!cityCode.trim() || !orderId.trim() || loading || !online}>{loading ? "查询中…" : "查询订单全链路"}</Button></div>
    </div>
  );
}
