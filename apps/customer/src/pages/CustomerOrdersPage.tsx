import { useCallback, useEffect, useMemo, useState } from "react";
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
import { toCustomerError } from "../adapters/customerError";
import "./customer-orders.css";

interface CustomerOrderApi {
  listOrders(query?: { cursor?: string; limit?: number }): Promise<{
    orders: Order[];
    nextCursor: string | null;
  }>;
  getOrder(orderId: string): Promise<{ order: Order }>;
  confirmService(orderId: string): Promise<{ order: Order }>;
  createPaymentOrder(payload: { orderId: string }): Promise<{ paymentOrder: PaymentOrder }>;
  createRefundRequest(payload: { orderId: string; reason?: string }): Promise<{
    refund: RefundRequest;
    idempotent: boolean;
  }>;
  createOrderReview(payload: { orderId: string; rating: number; comment: string }): Promise<{
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
}

type MutationState<T> =
  | { status: "idle" | "submitting" }
  | { status: "success"; value: T; idempotent?: boolean; resultUnknown?: boolean }
  | { status: "error"; title: string; error: string };

function orderStatusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "cancelled") return "danger";
  if (status === "pending_payment" || status === "pending_dispatch" || status === "service_completed") return "warning";
  return "muted";
}

function orderStatusLabel(status: string): string {
  return ({
    draft: "待提交",
    pending_dispatch: "服务进行中",
    service_completed: "待支付",
    pending_payment: "支付处理中",
    paid: "已支付",
    cancelled: "已取消",
  } as Record<string, string>)[status] ?? "状态待确认";
}

function reviewVisibilityLabel(visibility: string): string {
  return ({ pending_moderation: "审核中", visible: "已展示", hidden: "未展示" } as Record<string, string>)[visibility]
    ?? "状态待确认";
}

function appealStatusLabel(status: string): string {
  return ({ open: "申诉处理中", upheld: "申诉成立", rejected: "申诉未通过", withdrawn: "已撤回" } as Record<string, string>)[status]
    ?? "状态待确认";
}

function isSubmitting(state: { status: string }): boolean {
  return state.status === "submitting";
}

function isSucceeded(state: { status: string }): boolean {
  return state.status === "success";
}

function succeededState<T>(state: MutationState<T>): Extract<MutationState<T>, { status: "success" }> | null {
  return state.status === "success" ? state : null;
}

function paymentStatusTone(status: string): "success" | "warning" {
  return status === "paid" ? "success" : "warning";
}

function paymentStatusLabel(status: string): string {
  if (status === "paid") return "支付成功";
  if (status === "failed") return "支付失败";
  if (status === "closed") return "支付已关闭";
  return "等待支付结果";
}

function isVisibleReview(visibility?: string): boolean {
  return visibility === "visible";
}

function isHiddenReview(visibility?: string): boolean {
  return visibility === "hidden";
}

function isOpenAppeal(status: string): boolean {
  return status === "open";
}

function appealStatusTone(status: string): "success" | "warning" {
  return status === "upheld" ? "success" : "warning";
}

export function CustomerOrdersPage({ api, cityCode }: CustomerOrdersPageProps) {
  const initialOrderId = typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("orderId") ?? "";
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ title: string; description: string } | null>(null);
  const [partialNotice, setPartialNotice] = useState<string | null>(null);
  const [reviewViews, setReviewViews] = useState<Record<string, CustomerOrderReviewView | null>>({});
  const [confirmStates, setConfirmStates] = useState<Record<string, MutationState<Order>>>({});
  const [paymentStates, setPaymentStates] = useState<Record<string, MutationState<PaymentOrder>>>({});
  const [refundStates, setRefundStates] = useState<Record<string, MutationState<RefundRequest>>>({});
  const [refundReasons, setRefundReasons] = useState<Record<string, string>>({});
  const [reviewStates, setReviewStates] = useState<Record<string, MutationState<OrderReview>>>({});
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});
  const [appealStates, setAppealStates] = useState<Record<string, MutationState<ReviewAppeal>>>({});
  const [idempotencyKeys, setIdempotencyKeys] = useState<Record<string, string>>({});
  const binding = createCustomerUiBinding({ route: "orders", cityCode, hasOrderIds: orders.length > 0 });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartialNotice(null);
    setLoadMoreError(null);
    try {
      const result = await api.listOrders({ limit: 20 });
      const loaded = result.orders;
      setOrders(loaded);
      setNextCursor(result.nextCursor);
      const reviews = await Promise.allSettled(
        loaded.map(async (order) => [order.orderId, (await api.getOrderReview(order.orderId)).review] as const),
      );
      const reviewFailures = reviews.filter((review) => review.status === "rejected");
      setReviewViews(Object.fromEntries(reviews.flatMap((review) => review.status === "fulfilled" ? [review.value] : [])));
      if (reviewFailures.length > 0) setPartialNotice(`有 ${reviewFailures.length} 个订单的评价状态暂时无法读取。`);
      setSelectedOrderId((current) => loaded.some((order) => order.orderId === current) ? current : loaded[0]?.orderId ?? "");
    } catch (error) {
      const mapped = toCustomerError(error, "订单加载失败");
      setLoadError({ title: mapped.title, description: mapped.description });
      setOrders([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [api, cityCode]);

  const loadMoreOrders = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await api.listOrders({ cursor: nextCursor, limit: 20 });
      const known = new Set(orders.map((order) => order.orderId));
      const added = result.orders.filter((order) => !known.has(order.orderId));
      setOrders((current) => [...current, ...added]);
      setNextCursor(result.nextCursor);
      const reviews = await Promise.allSettled(
        added.map(async (order) => [order.orderId, (await api.getOrderReview(order.orderId)).review] as const),
    );
      setReviewViews((current) => ({
        ...current,
        ...Object.fromEntries(reviews.flatMap((review) => review.status === "fulfilled" ? [review.value] : [])),
      }));
    } catch (error) {
      setLoadMoreError(toCustomerError(error, "更多订单加载失败").description);
    } finally {
      setLoadingMore(false);
    }
  }, [api, loadingMore, nextCursor, orders]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [orders],
  );
  const selectedOrder = sortedOrders.find((order) => order.orderId === selectedOrderId) ?? sortedOrders[0];

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    const params = new URLSearchParams(window.location.search);
    params.set("orderId", orderId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  async function confirmService(orderId: string) {
    setConfirmStates((state) => ({ ...state, [orderId]: { status: "submitting" } }));
    try {
      const result = await api.confirmService(orderId);
      setOrders((items) => items.map((item) => item.orderId === orderId ? result.order : item));
      setConfirmStates((state) => ({ ...state, [orderId]: { status: "success", value: result.order } }));
    } catch (error) {
      const mapped = toCustomerError(error, "服务确认失败");
      setConfirmStates((state) => ({ ...state, [orderId]: { status: "error", title: mapped.title, error: mapped.description } }));
    }
  }

  async function createPayment(orderId: string) {
    setPaymentStates((state) => ({ ...state, [orderId]: { status: "submitting" } }));
    try {
      const result = await api.createPaymentOrder({ orderId });
      let resultUnknown = false;
      try {
        const refreshed = await api.getOrder(orderId);
        setOrders((items) => items.map((item) => item.orderId === orderId ? refreshed.order : item));
      } catch {
        resultUnknown = true;
      }
      setPaymentStates((state) => ({
        ...state,
        [orderId]: { status: "success", value: result.paymentOrder, resultUnknown },
      }));
    } catch (error) {
      const mapped = toCustomerError(error, "支付单创建失败");
      const resultUnknown = mapped.kind === "offline" || mapped.kind === "timeout" || mapped.kind === "unknown";
      setPaymentStates((state) => ({
        ...state,
        [orderId]: {
          status: "error",
          title: resultUnknown ? "支付结果待确认" : mapped.title,
          error: resultUnknown ? "请求过程中连接中断，支付单可能已创建。请先刷新订单状态，避免重复操作。" : mapped.description,
        },
      }));
    }
  }

  async function submitRefund(orderId: string) {
    setRefundStates((state) => ({ ...state, [orderId]: { status: "submitting" } }));
    try {
      const reason = refundReasons[orderId]?.trim();
      const result = await api.createRefundRequest({ orderId, ...(reason ? { reason } : {}) });
      setRefundStates((state) => ({
        ...state,
        [orderId]: { status: "success", value: result.refund, idempotent: result.idempotent },
      }));
    } catch (error) {
      const mapped = toCustomerError(error, "退款申请提交失败");
      setRefundStates((state) => ({ ...state, [orderId]: { status: "error", title: mapped.title, error: mapped.description } }));
    }
  }

  async function submitReview(orderId: string) {
    const comment = reviewComments[orderId]?.trim() ?? "";
    if (!comment) {
      setReviewStates((state) => ({ ...state, [orderId]: { status: "error", title: "请填写评价", error: "评价内容不能为空。" } }));
      return;
    }
    setReviewStates((state) => ({ ...state, [orderId]: { status: "submitting" } }));
    try {
      const result = await api.createOrderReview({ orderId, rating: reviewRatings[orderId] ?? 5, comment });
      setReviewStates((state) => ({
        ...state,
        [orderId]: { status: "success", value: result.review, idempotent: result.idempotent },
      }));
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((views) => ({ ...views, [orderId]: persisted.review }));
    } catch (error) {
      const mapped = toCustomerError(error, "评价提交失败");
      setReviewStates((state) => ({ ...state, [orderId]: { status: "error", title: mapped.title, error: mapped.description } }));
    }
  }

  async function submitAppeal(orderId: string, view: CustomerOrderReviewView) {
    const reason = appealReasons[orderId]?.trim() ?? "";
    if (!reason) return;
    const keyName = `appeal:${orderId}:${view.visibility.moderationVersion}`;
    const idempotencyKey = idempotencyKeys[keyName] ?? `customer-review-appeal-${crypto.randomUUID()}`;
    setIdempotencyKeys((keys) => ({ ...keys, [keyName]: idempotencyKey }));
    setAppealStates((state) => ({ ...state, [orderId]: { status: "submitting" } }));
    try {
      const result = await api.createReviewAppeal(view.review.reviewId, {
        moderationVersion: view.visibility.moderationVersion,
        reason,
        idempotencyKey,
      });
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((views) => ({ ...views, [orderId]: persisted.review }));
      setAppealStates((state) => ({ ...state, [orderId]: { status: "success", value: result.appeal, idempotent: result.idempotent } }));
    } catch (error) {
      const mapped = toCustomerError(error, "评价申诉提交失败");
      setAppealStates((state) => ({ ...state, [orderId]: { status: "error", title: mapped.title, error: mapped.description } }));
    }
  }

  async function withdrawAppeal(orderId: string, view: CustomerOrderReviewView) {
    const keyName = `withdraw:${orderId}:${view.visibility.moderationVersion}`;
    const idempotencyKey = idempotencyKeys[keyName] ?? `customer-review-withdraw-${crypto.randomUUID()}`;
    setIdempotencyKeys((keys) => ({ ...keys, [keyName]: idempotencyKey }));
    setAppealStates((state) => ({ ...state, [orderId]: { status: "submitting" } }));
    try {
      const result = await api.withdrawReviewAppeal(view.review.reviewId, {
        moderationVersion: view.visibility.moderationVersion,
        idempotencyKey,
      });
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((views) => ({ ...views, [orderId]: persisted.review }));
      setAppealStates((state) => ({ ...state, [orderId]: { status: "success", value: result.appeal, idempotent: result.idempotent } }));
    } catch (error) {
      const mapped = toCustomerError(error, "申诉撤回失败");
      setAppealStates((state) => ({ ...state, [orderId]: { status: "error", title: mapped.title, error: mapped.description } }));
    }
  }

  const renderMutationError = (state: MutationState<unknown>) => state.status === "error"
    ? <div className="customer-review-error" role="alert"><strong>{state.title}</strong><span>{state.error}</span></div>
    : null;

  return (
    <div className="customer-transaction-page">
    <CustomerOrdersTemplate route="/customer/orders" cityCode={cityCode} binding={binding}>
      {loading && <LoadingState title="正在加载订单" description="读取订单详情与评价状态" />}
      {loadError && <ErrorState title={loadError.title} description={loadError.description} action={<Button onClick={() => void loadOrders()}>重新加载</Button>} />}
      {!loading && !loadError && orders.length === 0 && (
        <EmptyState title="还没有可显示的订单" description="订单会从服务端同步展示，不依赖当前设备的本地记录。" />
      )}
      {partialNotice && <div className="customer-order-notice" role="status">{partialNotice}</div>}

      {!loading && sortedOrders.length > 0 && (
        <section className="customer-order-index" aria-label="订单列表">
          <div className="customer-order-index-heading">
            <strong>我的订单</strong>
            <Button onClick={() => void loadOrders()}>刷新状态</Button>
          </div>
          {sortedOrders.map((order) => (
            <button
              className="customer-order-index-item"
              data-active={order.orderId === selectedOrder?.orderId}
              key={order.orderId}
              onClick={() => selectOrder(order.orderId)}
              type="button"
            >
              <span><strong>{order.skuName}</strong><small>{new Date(order.createdAt).toLocaleString("zh-CN")}</small></span>
              <StatusTag tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</StatusTag>
            </button>
          ))}
        </section>
      )}

      {selectedOrder ? (() => {
        const order = selectedOrder;
        const confirmState = confirmStates[order.orderId] ?? { status: "idle" as const };
        const paymentState = paymentStates[order.orderId] ?? { status: "idle" as const };
        const refundState = refundStates[order.orderId] ?? { status: "idle" as const };
        const reviewState = reviewStates[order.orderId] ?? { status: "idle" as const };
        const appealState = appealStates[order.orderId] ?? { status: "idle" as const };
        const persistedReview = reviewViews[order.orderId];
        const mayConfirm = order.status === "pending_dispatch";
        const mayPay = order.status === "service_completed" || order.status === "pending_payment";
        const mayReviewOrRefund = order.status === "paid";
        const confirmSubmitting = isSubmitting(confirmState);
        const paymentSubmitting = isSubmitting(paymentState);
        const refundSubmitting = isSubmitting(refundState);
        const reviewSubmitting = isSubmitting(reviewState);
        const appealSubmitting = isSubmitting(appealState);
        const confirmSucceeded = isSucceeded(confirmState);
        const paymentResult = succeededState(paymentState);
        const refundResult = succeededState(refundState);
        const reviewResult = succeededState(reviewState);
        const canAppealReview = persistedReview
          ? isHiddenReview(persistedReview.visibility.visibility) && !persistedReview.appeals.some((appeal) => isOpenAppeal(appeal.status))
          : false;
        const showUnavailableStatus = !mayConfirm && !mayPay && !mayReviewOrRefund;
        return (
          <OrderCard
            key={order.orderId}
            title={order.skuName}
            description={`${order.quantity}${order.unit} · ${order.addressProvince}${order.addressCity}${order.addressDistrict}${order.detailAddress}`}
            meta={`${formatScheduledLabel(order.scheduledAt, order.scheduledTimeSlot)} · ${order.contactName} ${order.contactPhone}`}
            status={<StatusTag tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</StatusTag>}
            priceText={`${order.currency} ${order.totalAmount.toFixed(2)}`}
            actions={<a className="customer-order-link" href={`/customer/aftersale?orderId=${encodeURIComponent(order.orderId)}`}>进入售后</a>}
          >
            <div className="customer-order-detail-stack">
              <section className="customer-order-section">
                <strong>订单详情</strong>
                <span>订单号：{order.orderId}</span>
                <span>创建时间：{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
                <span>计价说明：{order.priceText}</span>
              </section>

              <section className="customer-order-section">
                <strong>服务确认与支付</strong>
                <span>仅在服务实际完成后确认；支付结果只展示服务端返回状态。</span>
                <div className="customer-order-actions">
                  <Button disabled={!mayConfirm || confirmSubmitting} onClick={() => void confirmService(order.orderId)}>
                    {confirmSubmitting ? "正在确认" : "确认服务已完成"}
                  </Button>
                  <Button variant="primary" disabled={!mayPay || paymentSubmitting} onClick={() => void createPayment(order.orderId)}>
                    {paymentSubmitting ? "正在创建支付单" : "进入支付"}
                  </Button>
                </div>
                {showUnavailableStatus ? <StatusTag tone="muted">当前订单状态暂不可确认或支付</StatusTag> : null}
                {confirmSucceeded && <StatusTag tone="success">服务已确认，订单状态已刷新</StatusTag>}
                {renderMutationError(confirmState)}
                {paymentResult && (
                  <div className="customer-review-inline">
                    <StatusTag tone={paymentStatusTone(paymentResult.value.status)}>
                      {paymentStatusLabel(paymentResult.value.status)}
                    </StatusTag>
                    <StatusTag tone="muted">支付单：{paymentResult.value.paymentOrderId}</StatusTag>
                    {paymentResult.resultUnknown && <StatusTag tone="warning">订单刷新失败，支付结果待确认</StatusTag>}
                  </div>
                )}
                {renderMutationError(paymentState)}
              </section>

              <section className="customer-order-section">
                <strong>服务评价</strong>
                <span>支付完成后可评价一次；评价提交后不可修改，并会进入平台审核。</span>
                {persistedReview ? (
                  <div className="customer-review-stack">
                    <div className="customer-review-inline">
                      <StatusTag tone="success">{persistedReview.review.rating} 星</StatusTag>
                      <StatusTag tone={isVisibleReview(persistedReview.visibility.visibility) ? "success" : "warning"}>
                        {reviewVisibilityLabel(persistedReview.visibility.visibility)}
                      </StatusTag>
                    </div>
                    <span className="customer-review-comment">{persistedReview.review.comment}</span>
                  </div>
                ) : (
                  <>
                    <Input
                      aria-label="评价星级"
                      disabled={!mayReviewOrRefund || reviewSubmitting}
                      max={5}
                      min={1}
                      type="number"
                      value={reviewRatings[order.orderId] ?? 5}
                      onChange={(event) => setReviewRatings((ratings) => ({ ...ratings, [order.orderId]: Number(event.target.value) }))}
                    />
                    <Textarea
                      aria-label="评价内容"
                      disabled={!mayReviewOrRefund || reviewSubmitting}
                      maxLength={500}
                      placeholder="请填写真实服务体验"
                      value={reviewComments[order.orderId] ?? ""}
                      onChange={(event) => setReviewComments((comments) => ({ ...comments, [order.orderId]: event.target.value }))}
                    />
                    <Button disabled={!mayReviewOrRefund || reviewSubmitting || !reviewComments[order.orderId]?.trim()} onClick={() => void submitReview(order.orderId)}>
                      {reviewSubmitting ? "正在提交评价" : "提交评价"}
                    </Button>
                  </>
                )}
                {!mayReviewOrRefund && <StatusTag tone="muted">支付完成后开放评价</StatusTag>}
                {reviewResult && <StatusTag tone="success">评价已提交{reviewResult.idempotent ? "（服务端返回已有记录）" : ""}</StatusTag>}
                {renderMutationError(reviewState)}

                {persistedReview && canAppealReview && (
                  <div className="customer-review-stack">
                    <Textarea
                      aria-label="评价申诉原因"
                      maxLength={1_000}
                      placeholder="请说明需要复核的原因"
                      value={appealReasons[order.orderId] ?? ""}
                      onChange={(event) => setAppealReasons((reasons) => ({ ...reasons, [order.orderId]: event.target.value }))}
                    />
                    <Button disabled={appealSubmitting || !appealReasons[order.orderId]?.trim()} onClick={() => void submitAppeal(order.orderId, persistedReview)}>
                      {appealSubmitting ? "正在提交申诉" : "申请复核评价"}
                    </Button>
                  </div>
                )}
                {persistedReview?.appeals.map((appeal) => (
                  <div className="customer-review-inline" key={appeal.appealId}>
                    <StatusTag tone={appealStatusTone(appeal.status)}>{appealStatusLabel(appeal.status)}</StatusTag>
                    {isOpenAppeal(appeal.status) && <Button disabled={appealSubmitting} onClick={() => void withdrawAppeal(order.orderId, persistedReview)}>撤回申诉</Button>}
                  </div>
                ))}
                {renderMutationError(appealState)}
              </section>

              <section className="customer-order-section">
                <strong>退款入口</strong>
                <span>这里只提交退款申请，不代表已退款或已批准；后续状态以服务端处理结果为准。</span>
                <Textarea
                  aria-label="退款原因"
                  disabled={!mayReviewOrRefund || refundSubmitting}
                  maxLength={255}
                  placeholder="请填写退款原因（选填）"
                  value={refundReasons[order.orderId] ?? ""}
                  onChange={(event) => setRefundReasons((reasons) => ({ ...reasons, [order.orderId]: event.target.value }))}
                />
                <Button variant="primary" disabled={!mayReviewOrRefund || refundSubmitting} onClick={() => void submitRefund(order.orderId)}>
                  {refundSubmitting ? "正在提交申请" : "提交退款申请"}
                </Button>
                {!mayReviewOrRefund && <StatusTag tone="muted">支付完成后开放退款申请</StatusTag>}
                {refundResult && (
                  <div className="customer-review-inline">
                    <StatusTag tone="warning">退款申请已提交</StatusTag>
                    <StatusTag tone="muted">申请号：{refundResult.value.refundId}</StatusTag>
                    {refundResult.idempotent && <StatusTag tone="warning">服务端返回已有申请</StatusTag>}
                  </div>
                )}
                {renderMutationError(refundState)}
              </section>
            </div>
          </OrderCard>
        );
      })() : null}

      {!loading && !loadError && nextCursor ? (
        <div className="customer-order-actions">
          <Button disabled={loadingMore} onClick={() => void loadMoreOrders()}>
            {loadingMore ? "正在加载更多" : "加载更多订单"}
          </Button>
        </div>
      ) : null}
      {loadMoreError ? <ErrorState title="更多订单加载失败" description={loadMoreError} action={<Button onClick={() => void loadMoreOrders()}>重新加载</Button>} /> : null}

      <CustomerAnswerCard state={binding.state} />
    </CustomerOrdersTemplate>
    </div>
  );
}
