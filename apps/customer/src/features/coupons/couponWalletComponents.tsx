import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  CouponGrant,
  CouponGrantStatus,
  MarketingDiscountDecisionStatus,
} from "@xlb/types";
import {
  CUSTOMER_COUPON_GRANT_STATUSES,
  maskCouponGrantId,
  type CustomerCouponStatusFilter,
  type CustomerCouponWalletTemplateReadyData,
} from "./couponWalletTypes.js";

export type CustomerCouponComponentProps =
  CustomerCouponWalletTemplateReadyData;

function statusLabel(status: CustomerCouponStatusFilter): string {
  return status === "all" ? "全部" : status;
}

function displayDate(value: string | null): string {
  if (value === null) return "服务端未提供";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "日期不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function decisionMessage(status: MarketingDiscountDecisionStatus): string {
  switch (status) {
    case "issued":
      return "服务端已出具 decision，可安全返回 Checkout 继续核对。";
    case "accepted":
      return "服务端返回 accepted，decision 已关联既有订单，不能重新用于 Checkout。";
    case "rejected":
      return "服务端返回 rejected，本页面未把 grant 状态当作可用资格。";
    case "expired":
      return "服务端 decision 已 expired，请刷新后重新请求判定。";
  }
}

export function CouponWalletHeader({
  viewModel,
  actions,
}: CustomerCouponComponentProps) {
  return (
    <header
      className="xlb-coupon-wallet__header"
      data-coupon-component="header"
    >
      <button
        type="button"
        className="xlb-coupon-wallet__back"
        onClick={actions.onBack}
        aria-label="返回上一页"
      >
        返回
      </button>
      <div className="xlb-coupon-wallet__title">
        <BrandLogo variant="compact" />
        <div>
          <p>服务端 grant 生命周期</p>
          <h1>我的券包</h1>
        </div>
      </div>
      <CustomerButton
        variant="quiet"
        busy={viewModel.refreshing}
        disabled={viewModel.refreshing || viewModel.decidingGrantId !== null}
        onClick={actions.onRefresh}
      >
        {viewModel.refreshing ? "刷新中" : "刷新"}
      </CustomerButton>
    </header>
  );
}

export function CouponCapabilityNotice({
  viewModel,
}: CustomerCouponComponentProps) {
  return (
    <section
      className="xlb-coupon-wallet__capability"
      data-coupon-component="capability-notice"
      aria-label="券包有限能力说明"
    >
      <strong>有限能力</strong>
      <p>
        当前 Customer API 未提供券名称、面额、门槛或活动展示投影，本页不会从其他端或本地常量补齐。
      </p>
      <p>
        grant cursor 契约尚未提供；当前列表是一次服务端响应，不会伪造分页游标。
      </p>
      {viewModel.checkoutContextInvalid ? (
        <p role="alert">
          Checkout Context 未通过正式请求校验，选择能力保持 unavailable。
        </p>
      ) : null}
    </section>
  );
}

export function CouponStatusFilters({
  viewModel,
  actions,
}: CustomerCouponComponentProps) {
  const statuses: readonly CustomerCouponStatusFilter[] = [
    "all",
    ...CUSTOMER_COUPON_GRANT_STATUSES,
  ];
  return (
    <div
      className="xlb-coupon-wallet__filters"
      role="group"
      aria-label="按正式 grant 状态筛选"
      data-coupon-component="status-filters"
    >
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={viewModel.status === status}
          disabled={viewModel.refreshing || viewModel.decidingGrantId !== null}
          onClick={() => actions.onSelectStatus(status)}
        >
          {statusLabel(status)}
        </button>
      ))}
    </div>
  );
}

export function CouponDecisionFeedback({
  viewModel,
  actions,
}: CustomerCouponComponentProps) {
  const decision = viewModel.decision;
  if (viewModel.notice === null && decision === null) return null;
  return (
    <section
      className="xlb-coupon-wallet__feedback"
      data-coupon-component="decision-feedback"
      aria-live="polite"
    >
      {viewModel.notice ? (
        <div
          role={viewModel.notice.kind === "error" ? "alert" : "status"}
          data-kind={viewModel.notice.kind}
        >
          <span>{viewModel.notice.message}</span>
          <button type="button" onClick={actions.onDismissNotice}>关闭</button>
        </div>
      ) : null}
      {decision ? (
        <div className="xlb-coupon-wallet__decision">
          <div>
            <strong>decision: {decision.decision.status}</strong>
            <p>{decisionMessage(decision.decision.status)}</p>
            <time dateTime={decision.decision.expiresAt}>
              有效期至 {displayDate(decision.decision.expiresAt)}
            </time>
          </div>
          {decision.decision.status === "issued" ? (
              <CustomerButton
                variant="primary"
                onClick={actions.onReturnToCheckout}
              >
                返回 Checkout
              </CustomerButton>
            ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CouponGrantCard({
  grant,
  data,
}: {
  readonly grant: CouponGrant;
  readonly data: CustomerCouponComponentProps;
}) {
  const { viewModel, actions } = data;
  const deciding = viewModel.decidingGrantId === grant.couponGrantId;
  const decisionEnabled = viewModel.checkoutContext !== null &&
    !viewModel.checkoutContextInvalid;
  return (
    <article
      className="xlb-coupon-grant"
      aria-label={`优惠券 grant ${maskCouponGrantId(grant.couponGrantId)}，状态 ${grant.status}`}
      data-status={grant.status satisfies CouponGrantStatus}
    >
      <div className="xlb-coupon-grant__heading">
        <span>grant</span>
        <strong>{grant.status}</strong>
      </div>
      <p className="xlb-coupon-grant__id">
        ID <code>{maskCouponGrantId(grant.couponGrantId)}</code>
      </p>
      <dl>
        <div>
          <dt>可用日期事实</dt>
          <dd>{displayDate(grant.availableAt)}</dd>
        </div>
        <div>
          <dt>失效日期事实</dt>
          <dd>{displayDate(grant.expiresAt)}</dd>
        </div>
      </dl>
      <p className="xlb-coupon-grant__eligibility">
        此状态不代表 Checkout eligibility，最终结果仅以后端 decision 为准。
      </p>
      {viewModel.checkoutContext !== null ||
        viewModel.checkoutContextInvalid ? (
          <CustomerButton
            variant="secondary"
            busy={deciding}
            disabled={!decisionEnabled ||
              viewModel.refreshing ||
              viewModel.decidingGrantId !== null}
            onClick={() => actions.onRequestDecision(grant)}
          >
            {deciding ? "服务端判定中" : "请求服务端判定"}
          </CustomerButton>
        ) : null}
    </article>
  );
}

export function CouponGrantList(data: CustomerCouponComponentProps) {
  const { viewModel, actions } = data;
  if (viewModel.grants.length === 0) {
    return (
      <div
        className="xlb-coupon-wallet__empty"
        data-coupon-component="grant-list"
      >
        <CustomerStatePanel
          kind="empty"
          title={viewModel.status === "all"
            ? "暂时没有 grant"
            : `没有 ${viewModel.status} 状态的 grant`}
          description="这里只显示正式 Customer coupon-grants API 返回的事实。"
          actionLabel="刷新"
          onAction={actions.onRefresh}
        />
      </div>
    );
  }
  return (
    <section
      className="xlb-coupon-wallet__list"
      data-coupon-component="grant-list"
      aria-busy={viewModel.refreshing || viewModel.decidingGrantId !== null}
    >
      <div className="xlb-coupon-wallet__list-heading">
        <div>
          <p>当前筛选</p>
          <h2>{statusLabel(viewModel.status)}</h2>
        </div>
        <span>{viewModel.grants.length} 条服务端 grant</span>
      </div>
      <div className="xlb-coupon-wallet__items">
        {viewModel.grants.map((grant) => (
          <CouponGrantCard
            key={grant.couponGrantId}
            grant={grant}
            data={data}
          />
        ))}
      </div>
    </section>
  );
}
