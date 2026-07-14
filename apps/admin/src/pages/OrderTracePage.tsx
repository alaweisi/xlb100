import { useCallback, useEffect, useState } from "react";
import { adminOrderTraceApi } from "../adminAuth";
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
  return <StatusTag tone={toneFor(status)}>{status || "none"}</StatusTag>;
}

function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount == null) return "-";
  return `${currency || "CNY"} ${amount.toFixed(2)}`;
}

function formatMinorMoney(amountMinor?: number | null, currency?: string | null): string {
  if (amountMinor == null) return "-";
  return `${currency || "CNY"} ${(amountMinor / 100).toFixed(2)}`;
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
      setError(String(e));
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
          stage: "Order",
          id: trace.order.orderId,
          actor: trace.order.customerId,
          status: trace.order.status,
          amount: formatMoney(trace.order.totalAmount, trace.order.currency),
          note: trace.order.skuName,
        },
        {
          key: "payment",
          stage: "Payment",
          id: trace.payment?.paymentOrderId || "-",
          actor: trace.payment?.provider || "-",
          status: trace.payment?.status || null,
          amount: formatMoney(trace.payment?.amount, trace.payment?.currency),
          note: trace.payment?.updatedAt || "-",
        },
        {
          key: "marketing",
          stage: "Marketing",
          id: trace.pricing?.marketingDecision?.decisionId || "-",
          actor: trace.pricing?.marketingDecision?.grantId || "-",
          status: trace.pricing?.source || null,
          amount: trace.pricing
            ? `${formatMinorMoney(trace.pricing.grossAmountMinor, trace.pricing.currency)} - ${formatMinorMoney(trace.pricing.discountAmountMinor, trace.pricing.currency)} = ${formatMinorMoney(trace.pricing.netAmountMinor, trace.pricing.currency)}`
            : "-",
          note: trace.pricing?.marketingDecision
            ? `rule ${trace.pricing.marketingDecision.ruleRevisionId}; reservation ${trace.pricing.marketingDecision.reservationId}; redemption ${trace.pricing.marketingDecision.redemptionId}`
            : "No Marketing decision",
        },
        {
          key: "dispatch",
          stage: "Dispatch",
          id: trace.dispatch?.dispatchTaskId || "-",
          actor: "-",
          status: trace.dispatch?.status || null,
          amount: "-",
          note: trace.dispatch?.customerMessage || trace.dispatch?.updatedAt || "-",
        },
        {
          key: "fulfillment",
          stage: "Fulfillment",
          id: trace.fulfillment?.fulfillmentId || "-",
          actor: trace.fulfillment?.workerId || "-",
          status: trace.fulfillment?.status || null,
          amount: "-",
          note: trace.fulfillment?.completedAt || trace.fulfillment?.startedAt || "-",
        },
        {
          key: "review",
          stage: "Review",
          id: trace.review?.reviewId || "-",
          actor: trace.order.customerId,
          status: trace.review?.status || null,
          amount: trace.review ? `${trace.review.rating}/5` : "-",
          note: trace.review?.commentRestricted ? "Restricted to Review moderation" : "-",
        },
        {
          key: "aftersale",
          stage: "AfterSale",
          id: trace.aftersale?.refundId || "-",
          actor: trace.order.customerId,
          status: trace.aftersale?.status || null,
          amount: formatMoney(trace.aftersale?.amount, trace.aftersale?.currency),
          note: trace.aftersale?.reason || "-",
        },
        {
          key: "reverse",
          stage: "Order Reverse",
          id: trace.phase17Aftersale.reverseRequests.at(-1)?.reverseRequestId || "-",
          actor: trace.order.customerId,
          status: trace.phase17Aftersale.reverseRequests.at(-1)?.status || null,
          amount: "-",
          note: trace.phase17Aftersale.reverseRequests.at(-1)?.reason || "-",
        },
        {
          key: "complaint",
          stage: "Complaint",
          id: trace.phase17Aftersale.complaints.at(-1)?.complaintId || "-",
          actor: trace.order.customerId,
          status: trace.phase17Aftersale.complaints.at(-1)?.status || null,
          amount: "-",
          note: trace.phase17Aftersale.complaints.at(-1)?.resolutionNote || trace.phase17Aftersale.complaints.at(-1)?.description || "-",
        },
      ]
    : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="Order Fulfillment Trace"
        actions={
          <>
            <ScopeBadge scope={`city: ${cityCode || "-"}`} />
            <StatusTag tone="muted">read-only</StatusTag>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <FormField label="City code">
            <Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} />
          </FormField>
          <FormField label="Order ID">
            <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </FormField>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button onClick={() => void loadTrace()} variant="primary" disabled={!cityCode.trim() || !orderId.trim() || loading}>
            {loading ? "Loading" : "Load trace"}
          </Button>
        </div>
      </Card>

      {loading && <LoadingState title="Loading order trace" description="Reading the read-only admin trace for this order." />}
      {error && <ApiErrorPanel title="Trace request failed" detail={error} action={<Button onClick={() => void loadTrace()}>Retry</Button>} />}
      {!loading && !error && !trace && (
        <EmptyState title="No order selected" description="Enter an order id to inspect payment, dispatch, fulfillment, review, and aftersale state." />
      )}

      {trace && (
        <>
          <Card title="Current state">
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              <div><strong>orderId</strong><br />{trace.order.orderId}</div>
              <div><strong>customer</strong><br />{trace.order.customerId}</div>
              <div><strong>payment</strong><br />{statusTag(trace.payment?.status)}</div>
              <div><strong>dispatch</strong><br />{statusTag(trace.dispatch?.status)}</div>
              <div><strong>worker</strong><br />{trace.fulfillment?.workerId || "-"}</div>
              <div><strong>review</strong><br />{statusTag(trace.review?.status)}</div>
              <div><strong>aftersale</strong><br />{statusTag(trace.aftersale?.status)}</div>
            </div>
          </Card>

          <Card title="Timeline">
            <Table
              rows={rows}
              getRowKey={(row) => row.key}
              columns={[
                { key: "stage", title: "Stage", render: (row) => row.stage, width: 140 },
                { key: "id", title: "ID", render: (row) => row.id },
                { key: "actor", title: "Actor", render: (row) => row.actor },
                { key: "status", title: "Status", render: (row) => statusTag(row.status) },
                { key: "amount", title: "Amount", render: (row) => row.amount },
                { key: "note", title: "Note", render: (row) => row.note },
              ]}
            />
          </Card>

          <Card title="Fulfillment Evidence" actions={<StatusTag tone="primary">Private local/mock</StatusTag>}>
            {evidence.length===0?<EmptyState title="No fulfillment evidence" />:evidence.map((aggregate)=>(
              <div key={aggregate.fulfillmentId} style={{ display:"grid",gap:10,borderTop:"1px solid #e4e7ec",paddingTop:12,marginTop:12 }}>
                <div><strong>{aggregate.fulfillmentId}</strong> {statusTag(aggregate.confirmation?.status ?? "pending")}</div>
                {aggregate.evidence.length===0?<EmptyState title="No evidence nodes" />:<Table rows={aggregate.evidence} getRowKey={(item)=>item.evidenceId} columns={[
                  {key:"type",title:"Node",render:(item)=>item.evidenceType},
                  {key:"complaint",title:"Complaint",render:(item)=>item.complaintId||"-"},
                  {key:"provider",title:"Provider status",render:(item)=>item.mediaAsset.storage.providerStatus},
                  {key:"external",title:"External",render:(item)=>String(item.mediaAsset.storage.externalProviderExecuted)},
                  {key:"hash",title:"SHA-256",render:(item)=>item.mediaAsset.checksumSha256.slice(0,16)},
                ]}/>}
              </div>
            ))}
          </Card>

          <Card title="Dispatch timeline">
            {trace.dispatch?.timeline.length ? (
              <Table
                rows={trace.dispatch.timeline}
                getRowKey={(row) => row.dispatchEventId}
                columns={[
                  { key: "createdAt", title: "Time", render: (row) => row.createdAt },
                  { key: "eventType", title: "Event", render: (row) => row.eventType },
                  { key: "workerId", title: "Worker", render: (row) => row.workerId || "-" },
                  { key: "reason", title: "Reason", render: (row) => row.reason || "-" },
                ]}
              />
            ) : (
              <EmptyState title="No dispatch events" description="Dispatch events appear after run-once, matching, reject, timeout, or accept simulation." />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
