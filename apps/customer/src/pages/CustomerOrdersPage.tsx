import { useEffect, useMemo, useState } from "react";
import type { CityCode, Order, RefundRequest } from "@xlb/types";
import {
  Button,
  CustomerAnswerCard,
  CustomerOrdersTemplate,
  EmptyState,
  ErrorState,
  LoadingState,
  OrderCard,
  StatusTag,
  Textarea,
} from "@xlb/ui";
import { formatScheduledLabel } from "../adapters/orderAddressOptions";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { UatDebugPanel } from "./customerPageShell";

interface CustomerOrderApi {
  getOrder(orderId: string): Promise<{ order: Order }>;
  createRefundRequest(payload: { orderId: string; reason?: string }): Promise<{
    refund: RefundRequest;
    idempotent: boolean;
  }>;
}

export interface CustomerOrdersPageProps {
  api: CustomerOrderApi;
  cityCode: CityCode;
  orderIds: string[];
}

type RefundUiState =
  | { status: "idle" | "submitting" }
  | { status: "success"; refund: RefundRequest; idempotent: boolean }
  | { status: "error"; error: string };

function orderStatusTone(status: string): "success" | "warning" | "muted" {
  if (status === "paid") return "success";
  if (status === "pending_payment") return "warning";
  return "muted";
}

export function CustomerOrdersPage({ api, cityCode, orderIds }: CustomerOrdersPageProps) {
  const binding = createCustomerUiBinding({
    route: "orders",
    cityCode,
    hasOrderIds: orderIds.length > 0,
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundReasons, setRefundReasons] = useState<Record<string, string>>({});
  const [refundStates, setRefundStates] = useState<Record<string, RefundUiState>>({});

  useEffect(() => {
    if (orderIds.length === 0) {
      setOrders([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          orderIds.map((orderId) => api.getOrder(orderId).then((item) => item.order)),
        );
        if (!cancelled) {
          setOrders(results);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load orders failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [api, orderIds]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [orders]);

  async function submitRefundRequest(orderId: string) {
    const reason = refundReasons[orderId]?.trim();
    setRefundStates((previous) => ({
      ...previous,
      [orderId]: { status: "submitting" },
    }));
    try {
      const result = await api.createRefundRequest({
        orderId,
        ...(reason ? { reason } : {}),
      });
      setRefundStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "success",
          refund: result.refund,
          idempotent: result.idempotent,
        },
      }));
    } catch (err) {
      setRefundStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "error",
          error: err instanceof Error ? err.message : "create refund request failed",
        },
      }));
    }
  }

  return (
    <CustomerOrdersTemplate route="/customer/orders" cityCode={cityCode} binding={binding}>
      {loading && <LoadingState title="Loading latest orders" description="Reading order API..." />}
      {error && <ErrorState title="Load orders failed" description={error} />}
      {!loading && !error && orders.length === 0 && (
        <EmptyState title="No order yet" description="Create an order first on /customer/order/create." />
      )}
      {!loading &&
        !error &&
        orders.length > 0 &&
        sortedOrders.map((order) => {
          const refundState = refundStates[order.orderId] ?? { status: "idle" };
          const isRefundRequestAllowed = order.status === "paid";

          return (
            <OrderCard
              key={order.orderId}
              title={order.skuName}
              description={`Quantity ${order.quantity}${order.unit} / ${order.addressDistrict} ${order.detailAddress}`.trim()}
              meta={`${formatScheduledLabel(order.scheduledAt, order.scheduledTimeSlot)} / ${order.contactName} ${order.contactPhone}`}
              status={<StatusTag tone={orderStatusTone(order.status)}>{order.status}</StatusTag>}
              priceText={`CNY ${order.totalAmount.toFixed(2)}`}
              actions={
                <Button
                  disabled={!isRefundRequestAllowed || refundState.status === "submitting"}
                  onClick={() => void submitRefundRequest(order.orderId)}
                  variant="primary"
                >
                  {refundState.status === "submitting" ? "Submitting" : "Request aftersale"}
                </Button>
              }
            >
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ color: "#2b2118", fontSize: 13, lineHeight: "18px" }}>
                  Aftersale request
                </strong>
                <span style={{ color: "#64748b", fontSize: 12, lineHeight: "18px" }}>
                  Creates only a refund request with status=requested. Refund execution and approval are outside this stage.
                </span>
                <Textarea
                  disabled={!isRefundRequestAllowed || refundState.status === "submitting"}
                  maxLength={255}
                  placeholder="Reason, optional"
                  value={refundReasons[order.orderId] ?? ""}
                  onChange={(event) =>
                    setRefundReasons((previous) => ({
                      ...previous,
                      [order.orderId]: event.target.value,
                    }))
                  }
                />
                {!isRefundRequestAllowed && (
                  <StatusTag tone="muted">Available after payment, worker completion, and accrual readiness</StatusTag>
                )}
                {refundState.status === "success" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <StatusTag tone="success">refund {refundState.refund.status}</StatusTag>
                    <StatusTag tone="muted">{refundState.refund.refundId}</StatusTag>
                    {refundState.idempotent && <StatusTag tone="warning">existing request</StatusTag>}
                  </div>
                )}
                {refundState.status === "error" && (
                  <span style={{ color: "#b42318", fontSize: 12, lineHeight: "18px" }}>{refundState.error}</span>
                )}
              </div>
            </OrderCard>
          );
        })}

      <CustomerAnswerCard state={binding.state} />
      <UatDebugPanel
        binding={binding}
        facts={[
          { label: "city_code", value: cityCode },
          { label: "order ids", value: orderIds },
          { label: "order list count", value: orders.length },
          { label: "refund request states", value: refundStates },
          { label: "workflow state", value: binding.state },
        ]}
      />
    </CustomerOrdersTemplate>
  );
}
