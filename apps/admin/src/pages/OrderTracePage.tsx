import { useCallback, useEffect, useState } from "react";
import { adminOrderTraceApi, adminVisibleError } from "../adminAuth";
import { adminDemoCityLabel, IS_ADMIN_INVESTOR_DEMO } from "../investorDemo";
import type { FulfillmentEvidenceAggregateResponse } from "@xlb/api-client";
import { buildHash, parseHashParams } from "../hashParams";
import {
  ApiErrorPanel,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  ScopeBadge,
  StatusTag,
  Table,
} from "@xlb/ui";

type AdminApi = typeof adminOrderTraceApi;
type OrderTrace = Awaited<ReturnType<AdminApi["getOrderTrace"]>>["trace"];
type Tone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

interface Props {
  initialCityCode?: string;
  initialOrderId?: string;
}

function toneFor(status?: string | null): Tone {
  if (!status) return "muted";
  if (status === "paid" || status === "accepted" || status === "completed" || status === "requested" || status === "created" || status === "approved") {
    return "success";
  }
  if (status === "queued" || status === "offering" || status === "reassigning" || status === "in_progress" || status === "pending") return "warning";
  if (status === "failed" || status === "cancelled" || status === "no_match" || status === "manual_review" || status === "timeout" || status === "rejected") return "danger";
  return "primary";
}

function statusTag(status?: string | null) {
  const labels: Record<string, string> = {
    accepted: "已接单",
    approved: "已通过",
    cancelled: "已取消",
    completed: "已完成",
    created: "已创建",
    failed: "失败",
    hidden: "已隐藏",
    in_progress: "服务中",
    manual_review: "待人工确认",
    no_match: "待重新匹配",
    offering: "等待响应",
    paid: "已支付",
    pending: "待处理",
    queued: "等待派单",
    reassigning: "重新派单中",
    rejected: "未通过",
    requested: "已申请",
    service_completed: "服务已完成",
    timeout: "已超时",
    visible: "已展示",
  };
  return <StatusTag tone={toneFor(status)}>{status ? labels[status] ?? "处理中" : "暂无"}</StatusTag>;
}

function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount == null) return "-";
  return !currency || currency === "CNY"
    ? `¥ ${amount.toFixed(2)}`
    : `${currency} ${amount.toFixed(2)}`;
}

function formatMinorMoney(amountMinor?: number | null, currency?: string | null): string {
  if (amountMinor == null) return "-";
  return !currency || currency === "CNY"
    ? `¥ ${(amountMinor / 100).toFixed(2)}`
    : `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

function evidenceTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    after_service: "服务后",
    arrival: "到达现场",
    before_service: "服务前",
    completion: "完工凭证",
    diagnosis: "现场检查",
    material: "服务材料",
  };
  return labels[value] ?? "服务凭证";
}

function dispatchEventLabel(value: string): string {
  const labels: Record<string, string> = {
    accepted: "师傅已接单",
    matched: "已匹配师傅",
    no_match: "暂未匹配到师傅",
    offered: "已向师傅发出任务",
    queued: "进入派单队列",
    rejected: "师傅未接取",
    timeout: "等待响应超时",
  };
  return labels[value] ?? "派单状态已更新";
}

function dispatchReasonLabel(value?: string | null): string {
  if (!value) return "-";
  if (/timeout/iu.test(value)) return "等待师傅响应超时";
  if (/reject/iu.test(value)) return "师傅未接取本次任务";
  if (/no.?match/iu.test(value)) return "当前范围内暂未匹配到师傅";
  return "派单状态已更新";
}

export function OrderTracePage({ initialCityCode, initialOrderId }: Props) {
  const params = parseHashParams();
  const [cityCode, setCityCode] = useState(initialCityCode || params.get("cityCode") || "hangzhou");
  const [orderId, setOrderId] = useState(initialOrderId || params.get("orderId") || "");
  const [trace, setTrace] = useState<OrderTrace | null>(null);
  const [evidence, setEvidence] = useState<FulfillmentEvidenceAggregateResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrace = useCallback(async () => {
    const nextOrderId = orderId.trim();
    const nextCityCode = cityCode.trim();
    if (!nextOrderId || !nextCityCode) {
      setTrace(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      window.location.hash = buildHash("/order-trace", {
        cityCode: nextCityCode,
        orderId: nextOrderId,
      });
      const [response,evidenceResponse] = await Promise.all([
        adminOrderTraceApi.getOrderTrace(nextOrderId),
        adminOrderTraceApi.getOrderFulfillmentEvidence(nextOrderId),
      ]);
      setTrace(response.trace);
      setEvidence(evidenceResponse.aggregates);
    } catch (e) {
      setTrace(null);
      setEvidence([]);
      setError(adminVisibleError(e, "订单信息暂时无法加载，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }, [cityCode, orderId]);

  useEffect(() => {
    if (orderId.trim()) {
      void loadTrace();
    }
  }, []);

  const rows = trace
    ? [
        {
          key: "order",
          stage: "订单",
          id: trace.order.orderId,
          actor: IS_ADMIN_INVESTOR_DEMO ? "演示客户" : trace.order.customerId,
          status: trace.order.status,
          amount: formatMoney(trace.order.totalAmount, trace.order.currency),
          note: trace.order.skuName,
        },
        {
          key: "payment",
          stage: "支付",
          id: trace.payment?.paymentOrderId || "-",
          actor: trace.payment ? "演示支付渠道" : "-",
          status: trace.payment?.status || null,
          amount: formatMoney(trace.payment?.amount, trace.payment?.currency),
          note: trace.payment?.updatedAt || "-",
        },
        {
          key: "marketing",
          stage: "优惠",
          id: trace.pricing?.marketingDecision?.decisionId || "-",
          actor: trace.pricing?.marketingDecision?.grantId || "-",
          status: trace.pricing?.source || null,
          amount: trace.pricing
            ? `${formatMinorMoney(trace.pricing.grossAmountMinor, trace.pricing.currency)} - ${formatMinorMoney(trace.pricing.discountAmountMinor, trace.pricing.currency)} = ${formatMinorMoney(trace.pricing.netAmountMinor, trace.pricing.currency)}`
            : "-",
          note: trace.pricing?.marketingDecision ? "已应用订单优惠" : "未使用优惠",
        },
        {
          key: "dispatch",
          stage: "派单",
          id: trace.dispatch?.dispatchTaskId || "-",
          actor: "-",
          status: trace.dispatch?.status || null,
          amount: "-",
          note: trace.dispatch?.customerMessage || trace.dispatch?.updatedAt || "-",
        },
        {
          key: "fulfillment",
          stage: "上门服务",
          id: trace.fulfillment?.fulfillmentId || "-",
          actor: trace.fulfillment
            ? (IS_ADMIN_INVESTOR_DEMO ? "演示师傅" : trace.fulfillment.workerId)
            : "-",
          status: trace.fulfillment?.status || null,
          amount: "-",
          note: trace.fulfillment?.completedAt || trace.fulfillment?.startedAt || "-",
        },
        {
          key: "review",
          stage: "评价",
          id: trace.review?.reviewId || "-",
          actor: IS_ADMIN_INVESTOR_DEMO ? "演示客户" : trace.order.customerId,
          status: trace.review?.status || null,
          amount: trace.review ? `${trace.review.rating}/5` : "-",
          note: trace.review?.commentRestricted ? "评价内容受权限保护" : "-",
        },
        {
          key: "aftersale",
          stage: "售后退款",
          id: trace.aftersale?.refundId || "-",
          actor: IS_ADMIN_INVESTOR_DEMO ? "演示客户" : trace.order.customerId,
          status: trace.aftersale?.status || null,
          amount: formatMoney(trace.aftersale?.amount, trace.aftersale?.currency),
          note: trace.aftersale?.reason || "-",
        },
        {
          key: "reverse",
          stage: "订单变更",
          id: trace.phase17Aftersale.reverseRequests.at(-1)?.reverseRequestId || "-",
          actor: IS_ADMIN_INVESTOR_DEMO ? "演示客户" : trace.order.customerId,
          status: trace.phase17Aftersale.reverseRequests.at(-1)?.status || null,
          amount: "-",
          note: trace.phase17Aftersale.reverseRequests.at(-1)?.reason || "-",
        },
        {
          key: "complaint",
          stage: "投诉",
          id: trace.phase17Aftersale.complaints.at(-1)?.complaintId || "-",
          actor: IS_ADMIN_INVESTOR_DEMO ? "演示客户" : trace.order.customerId,
          status: trace.phase17Aftersale.complaints.at(-1)?.status || null,
          amount: "-",
          note: trace.phase17Aftersale.complaints.at(-1)?.resolutionNote || trace.phase17Aftersale.complaints.at(-1)?.description || "-",
        },
      ]
    : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="订单全链路"
        actions={
          <>
            <ScopeBadge scope={`城市：${adminDemoCityLabel(cityCode)}`} />
            <StatusTag tone="muted">只读查看</StatusTag>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <FormField label="服务城市">
            {IS_ADMIN_INVESTOR_DEMO ? (
              <Input aria-label="杭州演示区" value={adminDemoCityLabel(cityCode)} readOnly />
            ) : (
              <Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} />
            )}
          </FormField>
          <FormField label="订单编号">
            <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </FormField>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button onClick={() => void loadTrace()} variant="primary" disabled={!cityCode.trim() || !orderId.trim() || loading}>
            {loading ? "正在加载" : "查看订单"}
          </Button>
        </div>
      </Card>

      {loading && <LoadingState title="正在加载订单" description="正在读取订单的支付、派单和服务进度。" />}
      {error && <ApiErrorPanel title="订单加载失败" detail={error} action={<Button onClick={() => void loadTrace()}>重新加载</Button>} />}
      {!loading && !error && !trace && (
        <EmptyState title="请输入订单编号" description="可查看支付、派单、上门服务和评价的完整进度。" />
      )}

      {trace && (
        <>
          <Card title="当前进度">
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              <div><strong>订单编号</strong><br />{trace.order.orderId}</div>
              <div><strong>客户</strong><br />{IS_ADMIN_INVESTOR_DEMO ? "演示客户" : trace.order.customerId}</div>
              <div><strong>支付</strong><br />{statusTag(trace.payment?.status)}</div>
              <div><strong>派单</strong><br />{statusTag(trace.dispatch?.status)}</div>
              <div><strong>师傅</strong><br />{trace.fulfillment ? (IS_ADMIN_INVESTOR_DEMO ? "演示师傅" : trace.fulfillment.workerId) : "-"}</div>
              <div><strong>评价</strong><br />{statusTag(trace.review?.status)}</div>
              <div><strong>售后</strong><br />{statusTag(trace.aftersale?.status)}</div>
            </div>
          </Card>

          <Card title="业务进度">
            <Table
              rows={rows}
              getRowKey={(row) => row.key}
              columns={[
                { key: "stage", title: "环节", render: (row) => row.stage, width: 140 },
                { key: "id", title: "业务编号", render: (row) => row.id },
                { key: "actor", title: "关联方", render: (row) => row.actor },
                { key: "status", title: "状态", render: (row) => statusTag(row.status) },
                { key: "amount", title: "金额", render: (row) => row.amount },
                { key: "note", title: "说明", render: (row) => row.note },
              ]}
            />
          </Card>

          <Card title="上门服务凭证" actions={<StatusTag tone="primary">隐私信息已保护</StatusTag>}>
            {evidence.length===0?<EmptyState title="暂无服务凭证" />:evidence.map((aggregate)=>(
              <div key={aggregate.fulfillmentId} style={{ display:"grid",gap:10,borderTop:"1px solid #e4e7ec",paddingTop:12,marginTop:12 }}>
                <div><strong>{aggregate.fulfillmentId}</strong> {statusTag(aggregate.confirmation?.status ?? "pending")}</div>
                {aggregate.evidence.length===0?<EmptyState title="暂无凭证节点" />:<Table rows={aggregate.evidence} getRowKey={(item)=>item.evidenceId} columns={[
                  {key:"type",title:"凭证类型",render:(item)=>evidenceTypeLabel(item.evidenceType)},
                  {key:"complaint",title:"关联投诉",render:(item)=>item.complaintId||"-"},
                  {key:"status",title:"保存状态",render:()=>"已保存"},
                ]}/>}
              </div>
            ))}
          </Card>

          <Card title="派单进度">
            {trace.dispatch?.timeline.length ? (
              <Table
                rows={trace.dispatch.timeline}
                getRowKey={(row) => row.dispatchEventId}
                columns={[
                  { key: "createdAt", title: "时间", render: (row) => row.createdAt },
                  { key: "eventType", title: "进度", render: (row) => dispatchEventLabel(row.eventType) },
                  {
                    key: "workerId",
                    title: "师傅",
                    render: (row) => row.workerId
                      ? (IS_ADMIN_INVESTOR_DEMO ? "演示师傅" : row.workerId)
                      : "-",
                  },
                  { key: "reason", title: "说明", render: (row) => dispatchReasonLabel(row.reason) },
                ]}
              />
            ) : (
              <EmptyState title="暂无派单进度" description="匹配师傅后，派单进度会显示在这里。" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
