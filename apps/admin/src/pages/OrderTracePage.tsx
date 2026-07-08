import { useCallback, useEffect, useState } from "react";
import { adminApi, createApiClient } from "@xlb/api-client";
import { API_BASE } from "../apiBase";
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

function createOrderTraceApi(cityCode: string) {
  return adminApi.create(createApiClient({
    baseUrl: API_BASE,
    headers: {
      "x-xlb-app-type": "admin",
      "x-xlb-role": "operator",
      "x-xlb-city-code": cityCode,
    },
  }));
}

type AdminApi = ReturnType<typeof adminApi.create>;
type OrderTrace = Awaited<ReturnType<AdminApi["getOrderTrace"]>>["trace"];
type Tone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

interface Props {
  initialCityCode?: string;
  initialOrderId?: string;
}

function toneFor(status?: string | null): Tone {
  if (!status) return "muted";
  if (status === "paid" || status === "accepted" || status === "completed" || status === "requested") {
    return "success";
  }
  if (status === "queued" || status === "in_progress" || status === "pending") return "warning";
  if (status === "failed" || status === "cancelled") return "danger";
  return "primary";
}

function statusTag(status?: string | null) {
  return <StatusTag tone={toneFor(status)}>{status || "none"}</StatusTag>;
}

function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount == null) return "-";
  return `${currency || "CNY"} ${amount.toFixed(2)}`;
}

export function OrderTracePage({ initialCityCode, initialOrderId }: Props) {
  const params = parseHashParams();
  const [cityCode, setCityCode] = useState(initialCityCode || params.get("cityCode") || "hangzhou");
  const [orderId, setOrderId] = useState(initialOrderId || params.get("orderId") || "");
  const [trace, setTrace] = useState<OrderTrace | null>(null);
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
      const response = await createOrderTraceApi(nextCityCode).getOrderTrace(nextOrderId);
      setTrace(response.trace);
      window.location.hash = buildHash("/order-trace", {
        cityCode: nextCityCode,
        orderId: nextOrderId,
      });
    } catch (e) {
      setTrace(null);
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
          key: "dispatch",
          stage: "Dispatch",
          id: trace.dispatch?.dispatchTaskId || "-",
          actor: "-",
          status: trace.dispatch?.status || null,
          amount: "-",
          note: trace.dispatch?.updatedAt || "-",
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
          key: "aftersale",
          stage: "AfterSale",
          id: trace.aftersale?.refundId || "-",
          actor: trace.order.customerId,
          status: trace.aftersale?.status || null,
          amount: formatMoney(trace.aftersale?.amount, trace.aftersale?.currency),
          note: trace.aftersale?.reason || "-",
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
        <EmptyState title="No order selected" description="Enter an order id to inspect payment, dispatch, fulfillment, and aftersale state." />
      )}

      {trace && (
        <>
          <Card title="Current state">
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
              <div><strong>orderId</strong><br />{trace.order.orderId}</div>
              <div><strong>customer</strong><br />{trace.order.customerId}</div>
              <div><strong>payment</strong><br />{statusTag(trace.payment?.status)}</div>
              <div><strong>dispatch</strong><br />{statusTag(trace.dispatch?.status)}</div>
              <div><strong>worker</strong><br />{trace.fulfillment?.workerId || "-"}</div>
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
        </>
      )}
    </div>
  );
}
