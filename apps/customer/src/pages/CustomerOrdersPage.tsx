import { useEffect, useMemo, useState } from "react";
import type { CityCode, Order, OrderReview, PaymentOrder, RefundRequest } from "@xlb/types";
import {
  Button,
  CustomerAnswerCard,
  CustomerOrdersTemplate,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  OrderCard,
  StatusTag,
  Textarea,
} from "@xlb/ui";
import { formatScheduledLabel } from "../adapters/orderAddressOptions";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";

interface CustomerOrderApi {
  getOrder(orderId: string): Promise<{ order: Order }>;
  confirmService(orderId: string): Promise<{ order: Order }>;
  createPaymentOrder(payload: { orderId: string }): Promise<{ paymentOrder: PaymentOrder }>;
  mockPaySuccess(payload: {
    paymentOrderId: string;
    providerTradeNo: string;
    status: "paid";
  }): Promise<{
    paymentOrder: PaymentOrder;
    orderId: string;
    idempotent: boolean;
  }>;
  createRefundRequest(payload: { orderId: string; reason?: string }): Promise<{
    refund: RefundRequest;
    idempotent: boolean;
  }>;
  createOrderReview(payload: {
    orderId: string;
    rating: number;
    comment: string;
  }): Promise<{
    review: OrderReview;
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

type ReviewUiState =
  | { status: "idle" | "submitting" }
  | { status: "success"; review: OrderReview; idempotent: boolean }
  | { status: "error"; error: string };

type ConfirmUiState =
  | { status: "idle" | "submitting" }
  | { status: "success"; order: Order }
  | { status: "error"; error: string };

type PaymentUiState =
  | { status: "idle" | "submitting" }
  | { status: "success"; paymentOrder: PaymentOrder; idempotent: boolean }
  | { status: "error"; error: string };

function orderStatusTone(status: string): "success" | "warning" | "muted" {
  if (status === "paid") return "success";
  if (status === "pending_payment" || status === "pending_dispatch" || status === "service_completed") return "warning";
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
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewStates, setReviewStates] = useState<Record<string, ReviewUiState>>({});
  const [confirmStates, setConfirmStates] = useState<Record<string, ConfirmUiState>>({});
  const [paymentStates, setPaymentStates] = useState<Record<string, PaymentUiState>>({});

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

  async function submitReview(orderId: string) {
    const rating = reviewRatings[orderId] || 5;
    const comment = reviewComments[orderId]?.trim() || "Service completed as expected";
    setReviewStates((previous) => ({
      ...previous,
      [orderId]: { status: "submitting" },
    }));
    try {
      const result = await api.createOrderReview({
        orderId,
        rating,
        comment,
      });
      setReviewStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "success",
          review: result.review,
          idempotent: result.idempotent,
        },
      }));
    } catch (err) {
      setReviewStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "error",
          error: err instanceof Error ? err.message : "create review failed",
        },
      }));
    }
  }

  async function confirmService(orderId: string) {
    setConfirmStates((previous) => ({
      ...previous,
      [orderId]: { status: "submitting" },
    }));
    try {
      const result = await api.confirmService(orderId);
      setOrders((previous) =>
        previous.map((order) => (order.orderId === orderId ? result.order : order)),
      );
      setConfirmStates((previous) => ({
        ...previous,
        [orderId]: { status: "success", order: result.order },
      }));
    } catch (err) {
      setConfirmStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "error",
          error: err instanceof Error ? err.message : "confirm service failed",
        },
      }));
    }
  }

  async function payAfterService(orderId: string) {
    setPaymentStates((previous) => ({
      ...previous,
      [orderId]: { status: "submitting" },
    }));
    try {
      const payment = await api.createPaymentOrder({ orderId });
      const paid = await api.mockPaySuccess({
        paymentOrderId: payment.paymentOrder.paymentOrderId,
        providerTradeNo: `mock-trade-service-${Date.now()}`,
        status: "paid",
      });
      const refreshed = await api.getOrder(orderId);
      setOrders((previous) =>
        previous.map((order) => (order.orderId === orderId ? refreshed.order : order)),
      );
      setPaymentStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "success",
          paymentOrder: paid.paymentOrder,
          idempotent: paid.idempotent,
        },
      }));
    } catch (err) {
      setPaymentStates((previous) => ({
        ...previous,
        [orderId]: {
          status: "error",
          error: err instanceof Error ? err.message : "service payment failed",
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
          const reviewState = reviewStates[order.orderId] ?? { status: "idle" };
          const confirmState = confirmStates[order.orderId] ?? { status: "idle" };
          const paymentState = paymentStates[order.orderId] ?? { status: "idle" };
          const isConfirmAllowed = order.status === "pending_dispatch";
          const isPaymentAllowed = order.status === "service_completed";
          const isRefundRequestAllowed = order.status === "paid";
          const isReviewRequestAllowed = order.status === "paid";

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
                  Service confirmation and mock payment
                </strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button
                    disabled={!isConfirmAllowed || confirmState.status === "submitting"}
                    onClick={() => void confirmService(order.orderId)}
                  >
                    {confirmState.status === "submitting" ? "Confirming" : "Confirm service"}
                  </Button>
                  <Button
                    disabled={!isPaymentAllowed || paymentState.status === "submitting"}
                    onClick={() => void payAfterService(order.orderId)}
                    variant="primary"
                  >
                    {paymentState.status === "submitting" ? "Paying" : "Mock pay"}
                  </Button>
                </div>
                {confirmState.status === "success" && (
                  <StatusTag tone="success">confirmed {confirmState.order.status}</StatusTag>
                )}
                {confirmState.status === "error" && (
                  <span style={{ color: "#b42318", fontSize: 12, lineHeight: "18px" }}>{confirmState.error}</span>
                )}
                {paymentState.status === "success" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <StatusTag tone="success">payment {paymentState.paymentOrder.status}</StatusTag>
                    <StatusTag tone="muted">{paymentState.paymentOrder.paymentOrderId}</StatusTag>
                    {paymentState.idempotent && <StatusTag tone="warning">existing payment</StatusTag>}
                  </div>
                )}
                {paymentState.status === "error" && (
                  <span style={{ color: "#b42318", fontSize: 12, lineHeight: "18px" }}>{paymentState.error}</span>
                )}

                <strong style={{ color: "#2b2118", fontSize: 13, lineHeight: "18px" }}>
                  Service review
                </strong>
                <span style={{ color: "#64748b", fontSize: 12, lineHeight: "18px" }}>
                  Creates only a review record with status=created after worker completion.
                </span>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "120px" }}>
                  <Input
                    disabled={!isReviewRequestAllowed || reviewState.status === "submitting"}
                    max={5}
                    min={1}
                    type="number"
                    value={reviewRatings[order.orderId] ?? 5}
                    onChange={(event) =>
                      setReviewRatings((previous) => ({
                        ...previous,
                        [order.orderId]: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <Textarea
                  disabled={!isReviewRequestAllowed || reviewState.status === "submitting"}
                  maxLength={500}
                  placeholder="Review comment"
                  value={reviewComments[order.orderId] ?? ""}
                  onChange={(event) =>
                    setReviewComments((previous) => ({
                      ...previous,
                      [order.orderId]: event.target.value,
                    }))
                  }
                />
                <div>
                  <Button
                    disabled={!isReviewRequestAllowed || reviewState.status === "submitting"}
                    onClick={() => void submitReview(order.orderId)}
                  >
                    {reviewState.status === "submitting" ? "Submitting review" : "Submit review"}
                  </Button>
                </div>
                {!isReviewRequestAllowed && (
                  <StatusTag tone="muted">Available after payment and worker completion</StatusTag>
                )}
                {reviewState.status === "success" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <StatusTag tone="success">review {reviewState.review.status}</StatusTag>
                    <StatusTag tone="muted">{reviewState.review.reviewId}</StatusTag>
                    <StatusTag tone="muted">{reviewState.review.rating}/5</StatusTag>
                    {reviewState.idempotent && <StatusTag tone="warning">existing review</StatusTag>}
                  </div>
                )}
                {reviewState.status === "error" && (
                  <span style={{ color: "#b42318", fontSize: 12, lineHeight: "18px" }}>{reviewState.error}</span>
                )}

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
    </CustomerOrdersTemplate>
  );
}
