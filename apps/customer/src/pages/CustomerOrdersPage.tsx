import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  CalendarBlank,
  CaretRight,
  Clock,
  CurrencyCircleDollar,
  MapPin,
  Package,
  ShieldCheck,
  Star,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  CityCode,
  CustomerOrderReviewView,
  Order,
  OrderReview,
  PaymentOrder,
  RefundRequest,
  ReviewAppeal,
} from "@xlb/types";
import { Button, EmptyState, ErrorState, RuntimeThemeSurface, Textarea } from "@xlb/ui";
import { formatScheduledLabel } from "../adapters/orderAddressOptions";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { buildCustomerDeepLink } from "../routes/customerDeepLinks";
import "./customer-orders.css";

interface CustomerOrderApi {
  listOrders(query?: { cursor?: string; limit?: number }): Promise<{ orders: Order[]; nextCursor: string | null }>;
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

type OrderFilter = "all" | "active" | "action" | "complete";
type OrderPanel = "details" | "confirm" | "payment" | "review" | "refund" | "appeal";
type AsyncState = "idle" | "submitting" | "success" | "error";
type PaymentState = AsyncState | "unknown";

const ORDER_STATUS: Record<Order["status"], { label: string; step: string; tone: string }> = {
  draft: { label: "待提交", step: "订单尚未进入派单", tone: "muted" },
  pending_dispatch: { label: "服务进行中", step: "等待师傅完成服务，完成后请确认", tone: "active" },
  service_completed: { label: "待支付", step: "服务已确认，请完成支付", tone: "attention" },
  pending_payment: { label: "支付处理中", step: "支付结果待确认，请勿重复支付", tone: "attention" },
  paid: { label: "已完成", step: "服务已支付，可评价或申请售后", tone: "success" },
  cancelled: { label: "已取消", step: "订单已经结束", tone: "muted" },
};

const FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "action", label: "待操作" },
  { key: "complete", label: "已完成" },
];

function isFilterMatch(order: Order, filter: OrderFilter) {
  if (filter === "active") return ["pending_dispatch", "pending_payment"].includes(order.status);
  if (filter === "action") return ["draft", "service_completed"].includes(order.status);
  if (filter === "complete") return ["paid", "cancelled"].includes(order.status);
  return true;
}

function isUncertainCommandError(cause: unknown) {
  if (!cause || typeof cause !== "object" || !("kind" in cause)) return false;
  return ["network", "timeout", "cancelled", "response_format"].includes(String(cause.kind));
}

function isConflict(cause: unknown) {
  return Boolean(cause && typeof cause === "object" && "status" in cause && cause.status === 409);
}

function friendlyError(cause: unknown, fallback: string) {
  if (isConflict(cause)) return "订单状态刚刚发生变化，请刷新后再试。";
  if (cause && typeof cause === "object" && "kind" in cause && cause.kind === "timeout") {
    return "请求超时，请检查网络后重试。";
  }
  return fallback;
}

function OrderSkeleton() {
  return (
    <div aria-busy="true" aria-label="订单正在加载" className="customer-orders__skeletons">
      {[0, 1].map((item) => (
        <div className="customer-orders__skeleton-card" key={item}>
          <span className="customer-orders__skeleton customer-orders__skeleton--title" />
          <span className="customer-orders__skeleton customer-orders__skeleton--line" />
          <span className="customer-orders__skeleton customer-orders__skeleton--action" />
        </div>
      ))}
    </div>
  );
}

export function CustomerOrdersPage({ api, cityCode }: CustomerOrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedOrderIds, setFailedOrderIds] = useState<string[]>([]);
  const [loadRevision, setLoadRevision] = useState(0);
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("all");
  const [panels, setPanels] = useState<Record<string, OrderPanel | null>>({});
  const [reviewViews, setReviewViews] = useState<Record<string, CustomerOrderReviewView | null>>({});
  const [reviewLoadErrors, setReviewLoadErrors] = useState<Record<string, boolean>>({});
  const [confirmStates, setConfirmStates] = useState<Record<string, AsyncState>>({});
  const [confirmMessages, setConfirmMessages] = useState<Record<string, string>>({});
  const [paymentStates, setPaymentStates] = useState<Record<string, PaymentState>>({});
  const [paymentMessages, setPaymentMessages] = useState<Record<string, string>>({});
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewStates, setReviewStates] = useState<Record<string, AsyncState>>({});
  const [reviewMessages, setReviewMessages] = useState<Record<string, string>>({});
  const [refundReasons, setRefundReasons] = useState<Record<string, string>>({});
  const [refundStates, setRefundStates] = useState<Record<string, AsyncState>>({});
  const [refundMessages, setRefundMessages] = useState<Record<string, string>>({});
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});
  const [appealStates, setAppealStates] = useState<Record<string, AsyncState>>({});
  const [appealMessages, setAppealMessages] = useState<Record<string, string>>({});
  const [appealKeys, setAppealKeys] = useState<Record<string, string>>({});
  const binding = createCustomerUiBinding({ route: "orders", cityCode, hasOrderIds: orders.length > 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFailedOrderIds([]);
      try {
        const result = await api.listOrders({ limit: 20 });
        if (cancelled) return;
        const loadedOrders = result.orders;
        setOrders(loadedOrders);
        const reviewResults = await Promise.allSettled(
          loadedOrders.map((order) => api.getOrderReview(order.orderId)),
        );
        if (cancelled) return;
        setReviewViews(Object.fromEntries(reviewResults.flatMap((result, index) =>
          result.status === "fulfilled" && loadedOrders[index]
            ? [[loadedOrders[index].orderId, result.value.review] as const]
            : [],
        )));
        setReviewLoadErrors(Object.fromEntries(reviewResults.flatMap((result, index) =>
          result.status === "rejected" && loadedOrders[index]
            ? [[loadedOrders[index].orderId, true] as const]
            : [],
        )));
      } catch {
        if (!cancelled) {
          setOrders([]);
          setFailedOrderIds(["server"]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [api, loadRevision]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [orders],
  );
  const visibleOrders = sortedOrders.filter((order) => isFilterMatch(order, activeFilter));

  function togglePanel(orderId: string, panel: OrderPanel) {
    setPanels((previous) => ({ ...previous, [orderId]: previous[orderId] === panel ? null : panel }));
  }

  async function refreshOrder(orderId: string) {
    try {
      const result = await api.getOrder(orderId);
      setOrders((previous) => previous.map((order) => order.orderId === orderId ? result.order : order));
      setPaymentMessages((previous) => ({ ...previous, [orderId]: "订单状态已更新。" }));
    } catch {
      setPaymentMessages((previous) => ({ ...previous, [orderId]: "暂时无法刷新，请稍后再试。" }));
    }
  }

  async function confirmService(orderId: string) {
    setConfirmStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setConfirmMessages((previous) => ({ ...previous, [orderId]: "" }));
    try {
      const result = await api.confirmService(orderId);
      setOrders((previous) => previous.map((order) => order.orderId === orderId ? result.order : order));
      setConfirmStates((previous) => ({ ...previous, [orderId]: "success" }));
      setConfirmMessages((previous) => ({ ...previous, [orderId]: "服务已确认，订单已进入待支付状态。" }));
    } catch (cause) {
      setConfirmStates((previous) => ({ ...previous, [orderId]: "error" }));
      setConfirmMessages((previous) => ({
        ...previous,
        [orderId]: friendlyError(cause, "暂时无法确认服务，请核对服务进度后重试。"),
      }));
    }
  }

  async function payAfterService(orderId: string) {
    setPaymentStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setPaymentMessages((previous) => ({ ...previous, [orderId]: "" }));
    try {
      await api.createPaymentOrder({ orderId });
      try {
        const refreshed = await api.getOrder(orderId);
        setOrders((previous) => previous.map((order) => order.orderId === orderId ? refreshed.order : order));
      } catch {
        // 支付单已由服务端创建，订单状态可在稍后刷新确认。
      }
      setPaymentStates((previous) => ({ ...previous, [orderId]: "unknown" }));
      setPaymentMessages((previous) => ({ ...previous, [orderId]: "支付单已创建，请按支付渠道完成支付，并刷新确认结果。" }));
    } catch (cause) {
      const unknown = isUncertainCommandError(cause);
      setPaymentStates((previous) => ({ ...previous, [orderId]: unknown ? "unknown" : "error" }));
      setPaymentMessages((previous) => ({
        ...previous,
        [orderId]: unknown
          ? "支付结果待确认，请刷新订单后查看，不要重复操作。"
          : friendlyError(cause, "支付未完成，请核对订单状态后重试。"),
      }));
    }
  }

  async function submitReview(orderId: string) {
    const rating = reviewRatings[orderId] ?? 5;
    const comment = reviewComments[orderId]?.trim() ?? "";
    if (!comment) {
      setReviewStates((previous) => ({ ...previous, [orderId]: "error" }));
      setReviewMessages((previous) => ({ ...previous, [orderId]: "请填写本次服务的真实感受。" }));
      return;
    }
    setReviewStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setReviewMessages((previous) => ({ ...previous, [orderId]: "" }));
    try {
      await api.createOrderReview({ orderId, rating, comment });
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((previous) => ({ ...previous, [orderId]: persisted.review }));
      setReviewStates((previous) => ({ ...previous, [orderId]: "success" }));
      setReviewMessages((previous) => ({ ...previous, [orderId]: "评价已提交，正在等待平台审核。" }));
    } catch (cause) {
      setReviewStates((previous) => ({ ...previous, [orderId]: "error" }));
      setReviewMessages((previous) => ({
        ...previous,
        [orderId]: friendlyError(cause, "评价提交失败，请稍后重试。"),
      }));
    }
  }

  async function submitRefundRequest(orderId: string) {
    const reason = refundReasons[orderId]?.trim();
    setRefundStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setRefundMessages((previous) => ({ ...previous, [orderId]: "" }));
    try {
      const result = await api.createRefundRequest({ orderId, ...(reason ? { reason } : {}) });
      setRefundStates((previous) => ({ ...previous, [orderId]: "success" }));
      setRefundMessages((previous) => ({
        ...previous,
        [orderId]: result.refund.status === "approved"
          ? "售后记录已更新，请留意后续处理进度。"
          : "退款申请已提交，平台审核后会更新处理结果。",
      }));
    } catch (cause) {
      setRefundStates((previous) => ({ ...previous, [orderId]: "error" }));
      setRefundMessages((previous) => ({
        ...previous,
        [orderId]: friendlyError(cause, "退款申请提交失败，请稍后重试。"),
      }));
    }
  }

  async function reloadReview(orderId: string) {
    try {
      const persisted = await api.getOrderReview(orderId);
      setReviewViews((previous) => ({ ...previous, [orderId]: persisted.review }));
      setReviewLoadErrors((previous) => ({ ...previous, [orderId]: false }));
    } catch {
      setReviewLoadErrors((previous) => ({ ...previous, [orderId]: true }));
    }
  }

  async function submitReviewAppeal(orderId: string, view: CustomerOrderReviewView) {
    const reason = appealReasons[orderId]?.trim() ?? "";
    if (!reason) {
      setAppealStates((previous) => ({ ...previous, [orderId]: "error" }));
      setAppealMessages((previous) => ({ ...previous, [orderId]: "请说明申请复核的原因。" }));
      return;
    }
    const idempotencyKey = appealKeys[orderId] ?? `customer-review-appeal-${crypto.randomUUID()}`;
    setAppealKeys((previous) => ({ ...previous, [orderId]: idempotencyKey }));
    setAppealStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    setAppealMessages((previous) => ({ ...previous, [orderId]: "" }));
    try {
      await api.createReviewAppeal(view.review.reviewId, {
        moderationVersion: view.visibility.moderationVersion,
        reason,
        idempotencyKey,
      });
      await reloadReview(orderId);
      setAppealStates((previous) => ({ ...previous, [orderId]: "success" }));
      setAppealMessages((previous) => ({ ...previous, [orderId]: "复核申请已提交。" }));
      setAppealKeys((previous) => ({ ...previous, [orderId]: "" }));
    } catch (cause) {
      setAppealStates((previous) => ({ ...previous, [orderId]: "error" }));
      setAppealMessages((previous) => ({
        ...previous,
        [orderId]: isConflict(cause)
          ? "审核结果已经变化或已有复核申请，请刷新评价状态。"
          : "复核申请提交失败，请稍后重试。",
      }));
    }
  }

  async function withdrawReviewAppeal(orderId: string, view: CustomerOrderReviewView) {
    const commandKey = `withdraw:${orderId}:${view.visibility.moderationVersion}`;
    const idempotencyKey = appealKeys[commandKey] ?? `customer-review-withdraw-${crypto.randomUUID()}`;
    setAppealKeys((previous) => ({ ...previous, [commandKey]: idempotencyKey }));
    setAppealStates((previous) => ({ ...previous, [orderId]: "submitting" }));
    try {
      await api.withdrawReviewAppeal(view.review.reviewId, {
        moderationVersion: view.visibility.moderationVersion,
        idempotencyKey,
      });
      await reloadReview(orderId);
      setAppealStates((previous) => ({ ...previous, [orderId]: "success" }));
      setAppealMessages((previous) => ({ ...previous, [orderId]: "复核申请已撤回。" }));
    } catch {
      setAppealStates((previous) => ({ ...previous, [orderId]: "error" }));
      setAppealMessages((previous) => ({ ...previous, [orderId]: "暂时无法撤回复核申请，请刷新后重试。" }));
    }
  }

  function primaryAction(order: Order, hasReview: boolean) {
    if (order.status === "pending_dispatch") return { label: "确认服务完成", panel: "confirm" as const };
    if (order.status === "service_completed") return { label: "立即支付", panel: "payment" as const };
    if (order.status === "pending_payment") return { label: "刷新支付状态", refresh: true };
    if (order.status === "paid") return { label: hasReview ? "查看我的评价" : "评价本次服务", panel: "review" as const };
    return { label: "查看订单详情", panel: "details" as const };
  }

  const blockingFailure = !loading && !orders.length && failedOrderIds.length > 0;

  return (
    <RuntimeThemeSurface className="customer-orders" binding={binding}>
      <header className="customer-orders__header">
        <p>我的服务</p>
        <h1>我的订单</h1>
        <span>服务进度、支付与售后，都在这里清楚掌握。</span>
      </header>

      {orders.length > 0 ? (
        <nav aria-label="订单筛选" className="customer-orders__filters">
          {FILTERS.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.key}
              className={activeFilter === filter.key ? "is-active" : ""}
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </nav>
      ) : null}

      {loading ? <OrderSkeleton /> : null}

      {!loading && failedOrderIds.length > 0 && orders.length > 0 ? (
        <div className="customer-orders__notice customer-orders__notice--warning" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          <div><strong>部分订单暂未加载</strong><p>已为你保留成功加载的订单，可以稍后重试。</p></div>
          <button onClick={() => setLoadRevision((value) => value + 1)} type="button">重试</button>
        </div>
      ) : null}

      {blockingFailure ? (
        <ErrorState
          action={<Button onClick={() => setLoadRevision((value) => value + 1)} productRole="customer">重新加载</Button>}
          description="订单暂时没有加载成功，请检查网络后重试。"
          productRole="customer"
          title="暂时无法读取订单"
        />
      ) : null}

      {!loading && !failedOrderIds.length && !orders.length ? (
        <EmptyState
          action={<a className="customer-orders__empty-action" href={buildCustomerDeepLink("createOrder", { cityCode })}>预约上门服务</a>}
          description="完成首次预约后，服务进度会出现在这里。"
          productRole="customer"
          title="还没有订单"
        />
      ) : null}

      {!loading && orders.length > 0 ? (
        <section aria-labelledby="customer-orders-list-title" className="customer-orders__list-section">
          <div className="customer-orders__list-heading">
            <h2 id="customer-orders-list-title">{FILTERS.find((item) => item.key === activeFilter)?.label}订单</h2>
            <span>{visibleOrders.length} 个</span>
          </div>

          {visibleOrders.length ? (
            <ul className="customer-orders__list">
              {visibleOrders.map((order) => {
                const status = ORDER_STATUS[order.status];
                const persistedReview = reviewViews[order.orderId];
                const action = primaryAction(order, Boolean(persistedReview));
                const activePanel = panels[order.orderId];
                const openAppeal = persistedReview?.appeals.find((appeal) => appeal.status === "open");
                return (
                  <li className="customer-orders__card" key={order.orderId}>
                    <div className="customer-orders__card-topline">
                      <span className={`customer-orders__status customer-orders__status--${status.tone}`}>{status.label}</span>
                      <span>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(order.createdAt))} 下单</span>
                    </div>
                    <div className="customer-orders__card-title">
                      <span aria-hidden="true"><Package weight="duotone" /></span>
                      <div><h3>{order.skuName}</h3><p>{order.quantity}{order.unit} · {order.addressDistrict}</p></div>
                      <strong>¥{order.totalAmount.toFixed(2)}</strong>
                    </div>
                    <div className="customer-orders__next-step">
                      <Clock aria-hidden="true" weight="fill" />
                      <span>{status.step}</span>
                    </div>
                    <div className="customer-orders__card-actions">
                      {order.status === "paid" ? (
                        <button className="customer-orders__secondary-action" onClick={() => togglePanel(order.orderId, "refund")} type="button">申请售后</button>
                      ) : <span />}
                      <button
                        className="customer-orders__primary-action"
                        onClick={() => "refresh" in action ? void refreshOrder(order.orderId) : togglePanel(order.orderId, action.panel)}
                        type="button"
                      >
                        {action.label}<CaretRight aria-hidden="true" weight="bold" />
                      </button>
                    </div>

                    {activePanel ? (
                      <div className="customer-orders__panel">
                        {activePanel === "details" ? (
                          <div className="customer-orders__details">
                            <h4>订单详情</h4>
                            <p><CalendarBlank aria-hidden="true" />预约时间<span>{formatScheduledLabel(order.scheduledAt, order.scheduledTimeSlot)}</span></p>
                            <p><MapPin aria-hidden="true" />服务地址<span>{order.addressCity}{order.addressDistrict} {order.detailAddress}</span></p>
                            <p><ShieldCheck aria-hidden="true" />联系信息<span>{order.contactName} {order.contactPhone}</span></p>
                            <p><CurrencyCircleDollar aria-hidden="true" />订单金额<span>{order.priceText || `¥${order.totalAmount.toFixed(2)}`}</span></p>
                            <small>订单号：{order.orderId}</small>
                          </div>
                        ) : null}

                        {activePanel === "confirm" ? (
                          <div className="customer-orders__action-sheet">
                            <h4>确认服务已经完成？</h4>
                            <p>请在师傅完成约定服务后确认。确认结果以服务端返回为准。</p>
                            <Button disabled={confirmStates[order.orderId] === "submitting"} onClick={() => void confirmService(order.orderId)} productRole="customer">
                              {confirmStates[order.orderId] === "submitting" ? "正在确认…" : "确认服务完成"}
                            </Button>
                            {confirmMessages[order.orderId] ? <p className={`customer-orders__feedback is-${confirmStates[order.orderId]}`}>{confirmMessages[order.orderId]}</p> : null}
                          </div>
                        ) : null}

                        {activePanel === "payment" ? (
                          <div className="customer-orders__action-sheet">
                            <h4>支付订单</h4>
                            <div className="customer-orders__amount"><span>应付金额</span><strong>¥{order.totalAmount.toFixed(2)}</strong></div>
                            <p>请勿重复支付。支付是否成功，以订单最新状态为准。</p>
                            <Button disabled={paymentStates[order.orderId] === "submitting"} onClick={() => void payAfterService(order.orderId)} productRole="customer">
                              {paymentStates[order.orderId] === "submitting" ? "正在支付…" : "确认支付"}
                            </Button>
                            {paymentMessages[order.orderId] ? (
                              <p className={`customer-orders__feedback is-${paymentStates[order.orderId]}`} role="status">{paymentMessages[order.orderId]}</p>
                            ) : null}
                            {paymentStates[order.orderId] === "unknown" ? (
                              <button className="customer-orders__text-action" onClick={() => void refreshOrder(order.orderId)} type="button"><ArrowClockwise aria-hidden="true" />刷新订单状态</button>
                            ) : null}
                          </div>
                        ) : null}

                        {activePanel === "review" ? (
                          <div className="customer-orders__action-sheet">
                            <h4>{persistedReview ? "我的评价" : "评价本次服务"}</h4>
                            {reviewLoadErrors[order.orderId] ? (
                              <div className="customer-orders__review-retry"><span>评价状态暂未加载，确认状态前不能重复提交。</span><button onClick={() => void reloadReview(order.orderId)} type="button">重试</button></div>
                            ) : persistedReview ? (
                              <div className="customer-orders__persisted-review">
                                <div className="customer-orders__stars" aria-label={`${persistedReview.review.rating} 星评价`}>
                                  {[1, 2, 3, 4, 5].map((star) => <Star aria-hidden="true" key={star} weight={star <= persistedReview.review.rating ? "fill" : "regular"} />)}
                                </div>
                                <p>{persistedReview.review.comment}</p>
                                <span>{persistedReview.visibility.visibility === "visible" ? "已公开" : persistedReview.visibility.visibility === "hidden" ? "未公开" : "审核中"}</span>
                                {persistedReview.visibility.visibility === "hidden" && !openAppeal ? (
                                  <button className="customer-orders__text-action" onClick={() => togglePanel(order.orderId, "appeal")} type="button">申请复核</button>
                                ) : null}
                                {openAppeal ? (
                                  <div className="customer-orders__appeal-state"><span>复核中</span><button disabled={appealStates[order.orderId] === "submitting"} onClick={() => void withdrawReviewAppeal(order.orderId, persistedReview)} type="button">撤回复核</button></div>
                                ) : null}
                              </div>
                            ) : (
                              <>
                                <fieldset className="customer-orders__rating">
                                  <legend>服务评分</legend>
                                  <div>
                                    {[1, 2, 3, 4, 5].map((rating) => (
                                      <button aria-label={`${rating} 星`} aria-pressed={(reviewRatings[order.orderId] ?? 5) === rating} key={rating} onClick={() => setReviewRatings((previous) => ({ ...previous, [order.orderId]: rating }))} type="button">
                                        <Star aria-hidden="true" weight={rating <= (reviewRatings[order.orderId] ?? 5) ? "fill" : "regular"} />
                                      </button>
                                    ))}
                                  </div>
                                </fieldset>
                                <label className="customer-orders__field"><span>评价内容</span><Textarea maxLength={500} onChange={(event) => setReviewComments((previous) => ({ ...previous, [order.orderId]: event.target.value }))} placeholder="说说本次服务体验" value={reviewComments[order.orderId] ?? ""} /></label>
                                <Button disabled={reviewStates[order.orderId] === "submitting"} onClick={() => void submitReview(order.orderId)} productRole="customer">{reviewStates[order.orderId] === "submitting" ? "正在提交…" : "提交评价"}</Button>
                              </>
                            )}
                            {reviewMessages[order.orderId] ? <p className={`customer-orders__feedback is-${reviewStates[order.orderId]}`}>{reviewMessages[order.orderId]}</p> : null}
                          </div>
                        ) : null}

                        {activePanel === "refund" ? (
                          <div className="customer-orders__action-sheet">
                            <h4>提交售后退款申请</h4>
                            <p>提交后平台会审核申请；此操作不会直接完成退款。</p>
                            <label className="customer-orders__field"><span>申请原因（选填）</span><Textarea maxLength={255} onChange={(event) => setRefundReasons((previous) => ({ ...previous, [order.orderId]: event.target.value }))} placeholder="请简要描述需要处理的问题" value={refundReasons[order.orderId] ?? ""} /></label>
                            <Button disabled={refundStates[order.orderId] === "submitting" || refundStates[order.orderId] === "success"} onClick={() => void submitRefundRequest(order.orderId)} productRole="customer">{refundStates[order.orderId] === "submitting" ? "正在提交…" : refundStates[order.orderId] === "success" ? "申请已提交" : "提交申请"}</Button>
                            {refundMessages[order.orderId] ? <p className={`customer-orders__feedback is-${refundStates[order.orderId]}`}>{refundMessages[order.orderId]}</p> : null}
                          </div>
                        ) : null}

                        {activePanel === "appeal" && persistedReview ? (
                          <div className="customer-orders__action-sheet">
                            <h4>申请评价复核</h4>
                            <p>请说明你认为评价应重新审核的原因。</p>
                            <label className="customer-orders__field"><span>复核原因</span><Textarea maxLength={1_000} onChange={(event) => setAppealReasons((previous) => ({ ...previous, [order.orderId]: event.target.value }))} placeholder="填写复核原因" value={appealReasons[order.orderId] ?? ""} /></label>
                            <Button disabled={appealStates[order.orderId] === "submitting"} onClick={() => void submitReviewAppeal(order.orderId, persistedReview)} productRole="customer">{appealStates[order.orderId] === "submitting" ? "正在提交…" : "提交复核申请"}</Button>
                            {appealMessages[order.orderId] ? <p className={`customer-orders__feedback is-${appealStates[order.orderId]}`}>{appealMessages[order.orderId]}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="customer-orders__filtered-empty"><Package aria-hidden="true" weight="duotone" /><strong>这里暂时没有订单</strong><span>切换其他分类看看</span></div>
          )}
        </section>
      ) : null}
    </RuntimeThemeSurface>
  );
}
