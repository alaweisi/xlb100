import { useEffect, useMemo, useState } from "react";
import type {
  CityCode,
  CustomerOrderReviewView,
  Order,
  OrderReview,
  PaymentOrder,
  RefundRequest,
  ReviewAppeal,
} from "@xlb/types";
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
import { CustomerRouteShell } from "./customerPageShell";
import "./customer-orders.css";

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
  getOrderReview(orderId: string): Promise<{ review: CustomerOrderReviewView | null }>;
  createReviewAppeal(reviewId: string, payload: {
    moderationVersion: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ appeal: ReviewAppeal; idempotent: boolean }>;
  withdrawReviewAppeal(reviewId: string, payload: {
    moderationVersion: number;
    idempotencyKey: string;
  }): Promise<{ appeal: ReviewAppeal; idempotent: boolean }>;
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
  const [reviewViews, setReviewViews] = useState<Record<string, CustomerOrderReviewView | null>>({});
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});
  const [appealStates, setAppealStates] = useState<Record<string, "idle" | "submitting" | "success" | "error">>({});
  const [appealErrors, setAppealErrors] = useState<Record<string, string>>({});
  const [appealKeys, setAppealKeys] = useState<Record<string, string>>({});
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
          const reviewResults = await Promise.all(
            results.map(async (order) => [order.orderId, (await api.getOrderReview(order.orderId)).review] as const),
          );
          if (!cancelled) setReviewViews(Object.fromEntries(reviewResults));
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
    const comment = reviewComments[orderId]?.trim() ?? "";
    if (!comment) {
      setReviewStates((previous) => ({
        ...previous,
        [orderId]: { status: "error", error: "Please enter your own review comment" },
      }));
      return;
    }
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
      try {
        const persisted = await api.getOrderReview(orderId);
        setReviewViews((previous) => ({ ...previous, [orderId]: persisted.review }));
      } catch {
        // The immutable review mutation succeeded. Keep success state and let the next page load reconcile its view.
      }
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

  async function submitReviewAppeal(orderId: string, view: CustomerOrderReviewView) {
    const reason = appealReasons[orderId]?.trim() ?? "";
    if (!reason) {
      setAppealStates((previous) => ({ ...previous, [orderId]: "error" }));
      return;
    }
    setAppealStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setAppealErrors((previous) => ({ ...previous, [orderId]: "" }));
    const idempotencyKey = appealKeys[orderId]
      ?? `customer-review-appeal-${crypto.randomUUID()}`;
    if (!appealKeys[orderId]) {
      setAppealKeys((previous) => ({ ...previous, [orderId]: idempotencyKey }));
    }
    try {
      await api.createReviewAppeal(view.review.reviewId, {
        moderationVersion: view.visibility.moderationVersion,
        reason,
        idempotencyKey,
      });
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((previous) => ({ ...previous, [orderId]: persisted.review }));
      setAppealStates((previous) => ({ ...previous, [orderId]: "success" }));
      setAppealKeys((previous) => {
        const next = { ...previous };
        delete next[orderId];
        return next;
      });
    } catch (cause) {
      setAppealStates((previous) => ({ ...previous, [orderId]: "error" }));
      setAppealErrors((previous) => ({
        ...previous,
        [orderId]: cause && typeof cause === "object" && "status" in cause && cause.status === 409
          ? "This moderation decision changed or already has an active appeal. Refresh the order and try again."
          : cause instanceof Error ? cause.message : "Appeal failed",
      }));
    }
  }

  async function withdrawReviewAppeal(orderId: string, view: CustomerOrderReviewView) {
    setAppealStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setAppealErrors((previous) => ({ ...previous, [orderId]: "" }));
    const commandKey = `withdraw:${orderId}:${view.visibility.moderationVersion}`;
    const idempotencyKey = appealKeys[commandKey]
      ?? `customer-review-withdraw-${crypto.randomUUID()}`;
    if (!appealKeys[commandKey]) {
      setAppealKeys((previous) => ({ ...previous, [commandKey]: idempotencyKey }));
    }
    try {
      await api.withdrawReviewAppeal(view.review.reviewId, {
        moderationVersion: view.visibility.moderationVersion,
        idempotencyKey,
      });
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((previous) => ({ ...previous, [orderId]: persisted.review }));
      setAppealStates((previous) => ({ ...previous, [orderId]: "success" }));
      setAppealKeys((previous) => {
        const next = { ...previous };
        delete next[commandKey];
        return next;
      });
    } catch (cause) {
      setAppealStates((previous) => ({ ...previous, [orderId]: "error" }));
      setAppealErrors((previous) => ({
        ...previous,
        [orderId]: cause instanceof Error ? cause.message : "Appeal withdrawal failed",
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
    <CustomerRouteShell currentRoute="orders">
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
          const persistedReview = reviewViews[order.orderId];
          const appealState = appealStates[order.orderId] ?? "idle";
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
                  Your review is immutable and enters moderation before it contributes to reputation.
                </span>
                {persistedReview && (
                  <div className="customer-review-stack">
                    <div className="customer-review-inline">
                      <StatusTag tone="success">submitted {persistedReview.review.rating}/5</StatusTag>
                      <StatusTag tone={persistedReview.visibility.visibility === "visible" ? "success" : "warning"}>
                        {persistedReview.visibility.visibility}
                      </StatusTag>
                      <StatusTag tone="muted">version {persistedReview.visibility.moderationVersion}</StatusTag>
                    </div>
                    <span className="customer-review-comment">{persistedReview.review.comment}</span>
                  </div>
                )}
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "120px" }}>
                  <Input
                    disabled={!isReviewRequestAllowed || !!persistedReview || reviewState.status === "submitting" || reviewState.status === "success"}
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
                  disabled={!isReviewRequestAllowed || !!persistedReview || reviewState.status === "submitting" || reviewState.status === "success"}
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
                    disabled={
                      !isReviewRequestAllowed ||
                      !!persistedReview ||
                      reviewState.status === "submitting" ||
                      reviewState.status === "success" ||
                      !(reviewComments[order.orderId]?.trim())
                    }
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
                {persistedReview?.visibility.visibility === "hidden" &&
                  !persistedReview.appeals.some((appeal) => appeal.status === "open") && (
                    <div className="customer-review-stack">
                      <Textarea
                        maxLength={1_000}
                        placeholder="Explain why this moderation decision should be reviewed"
                        value={appealReasons[order.orderId] ?? ""}
                        onChange={(event) => setAppealReasons((previous) => ({
                          ...previous,
                          [order.orderId]: event.target.value,
                        }))}
                      />
                      <Button
                        disabled={appealState === "submitting" || !appealReasons[order.orderId]?.trim()}
                        onClick={() => void submitReviewAppeal(order.orderId, persistedReview)}
                      >
                        {appealState === "submitting" ? "Submitting appeal" : "Appeal moderation"}
                      </Button>
                      {appealState === "error" && (
                        <span className="customer-review-error">
                          {appealErrors[order.orderId] || "Appeal failed"}
                        </span>
                      )}
                    </div>
                  )}
                {persistedReview?.appeals.map((appeal) => (
                  <div className="customer-review-inline" key={appeal.appealId}>
                    <StatusTag tone={appeal.status === "upheld" ? "success" : "warning"}>
                      appeal {appeal.status}
                    </StatusTag>
                    {appeal.status === "open" && (
                      <Button
                        disabled={appealState === "submitting"}
                        onClick={() => void withdrawReviewAppeal(order.orderId, persistedReview)}
                      >
                        Withdraw appeal
                      </Button>
                    )}
                  </div>
                ))}

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
    </CustomerRouteShell>
  );
}
