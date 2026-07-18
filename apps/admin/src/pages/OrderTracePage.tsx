import { useCallback, useEffect, useState } from "react";
import type { FulfillmentEvidenceAggregateResponse } from "@xlb/api-client";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
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
    <div className="operations-workbench">
      <Card title="订单全链路追踪" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone="muted">只读查询</StatusTag><StatusTag tone={online ? "success" : "danger"}>{online ? "服务已连接" : "当前离线"}</StatusTag></>}>
        <div className="operations-form-grid">
          <FormField label="城市代码"><Input value={cityCode} onChange={(event) => setCityCode(event.target.value)} /></FormField>
          <FormField label="订单编号"><Input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="输入完整订单编号" /></FormField>
        </div>
        <div className="operations-inline-actions" style={{ marginTop: 10 }}><Button variant="primary" onClick={() => void loadTrace()} disabled={!cityCode.trim() || !orderId.trim() || loading || !online}>{loading ? "查询中…" : "查询订单全链路"}</Button></div>
      </Card>

      {!online && <div className="operations-alert operations-alert--offline" role="status">网络已断开，无法执行新的订单查询。当前页面如有数据，仅代表上次成功读取的结果。</div>}
      {loading && <LoadingState title="正在读取订单全链路" description="正在读取订单、支付、派单、履约、评价、售后与履约凭证。" />}
      {failure && <ApiErrorPanel title={failure.title} detail={failure.detail} action={<Button onClick={() => void loadTrace()}>重新查询</Button>} />}
      {evidenceFailure && <div className="operations-alert" role="status">部分结果：订单主链路已成功读取，但履约凭证未能更新（{evidenceFailure.title}）。页面不会把凭证空白解释为“没有凭证”。</div>}
      {!loading && !failure && !trace && <EmptyState title="尚未选择订单" description="输入当前城市范围内的订单编号，查询支付、派单、履约、评价和售后状态。" />}

      {trace && !loading && (
        <>
          <div className="operations-kpi-grid" aria-label="订单当前状态">
            <div className="operations-kpi"><span>订单编号</span><strong>{trace.order.orderId}</strong></div>
            <div className="operations-kpi"><span>订单状态</span><strong>{statusLabel(trace.order.status)}</strong></div>
            <div className="operations-kpi"><span>订单金额</span><strong>{formatCurrency(trace.order.totalAmount, trace.order.currency)}</strong></div>
            <div className="operations-kpi"><span>服务项目</span><strong>{trace.order.skuName}</strong></div>
            <div className="operations-kpi"><span>支付状态</span><strong>{statusLabel(trace.payment?.status)}</strong></div>
            <div className="operations-kpi"><span>派单状态</span><strong>{statusLabel(trace.dispatch?.status)}</strong></div>
            <div className="operations-kpi"><span>履约师傅</span><strong>{trace.fulfillment?.workerId || "尚未分配"}</strong></div>
            <div className="operations-kpi"><span>售后状态</span><strong>{statusLabel(trace.aftersale?.status)}</strong></div>
          </div>

          <Card title="业务阶段">
            <Table rows={rows} getRowKey={(row) => row.key} columns={[
              { key: "stage", title: "阶段", render: (row) => row.stage, width: 130 },
              { key: "id", title: "业务编号", render: (row) => row.id },
              { key: "actor", title: "关联主体", render: (row) => row.actor },
              { key: "status", title: "状态", render: (row) => row.status ? <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> : "—" },
              { key: "amount", title: "金额 / 评分", render: (row) => row.amount },
              { key: "note", title: "说明", render: (row) => row.note },
            ]} />
          </Card>

          <div className="dispatch-layout">
            <Card title="履约凭证" actions={<StatusTag tone="warning">敏感资料受控展示</StatusTag>}>
              {evidenceFailure ? <EmptyState title="履约凭证未能读取" description="主链路结果仍可核对；请修复权限或网络后重新查询凭证。" /> : evidence.length === 0 ? <EmptyState title="当前订单暂无履约凭证" description="该结论来自本次成功的履约凭证接口响应。" /> : evidence.map((aggregate) => (
                <section key={aggregate.fulfillmentId} className="operations-panel">
                  <h3>{aggregate.fulfillmentId} <StatusTag tone={statusTone(aggregate.confirmation?.status ?? "pending")}>{statusLabel(aggregate.confirmation?.status ?? "pending")}</StatusTag></h3>
                  {aggregate.evidence.length === 0 ? <EmptyState title="该履约记录暂无凭证节点" /> : <Table rows={aggregate.evidence} getRowKey={(item) => item.evidenceId} columns={[
                    { key: "type", title: "凭证类型", render: (item) => evidenceTypeLabel(item.evidenceType) },
                    { key: "complaint", title: "关联投诉", render: (item) => item.complaintId || "—" },
                    { key: "provider", title: "存储状态", render: (item) => statusLabel(item.mediaAsset.storage.providerStatus) },
                    { key: "hash", title: "校验摘要", render: (item) => item.mediaAsset.checksumSha256.slice(0, 16) },
                  ]} />}
                </section>
              ))}
            </Card>

            <Card title="派单事件时间线">
              {trace.dispatch?.timeline.length ? <Table rows={trace.dispatch.timeline} getRowKey={(row) => row.dispatchEventId} columns={[
                { key: "createdAt", title: "发生时间", render: (row) => formatDateTime(row.createdAt) },
                { key: "eventType", title: "事件", render: (row) => eventLabel(row.eventType) },
                { key: "workerId", title: "关联师傅", render: (row) => row.workerId || "—" },
                { key: "reason", title: "原因", render: (row) => reasonLabel(row.reason) },
              ]} /> : <EmptyState title="当前订单暂无派单事件" description="派单任务产生事件后，将按服务端时间顺序展示。" />}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
