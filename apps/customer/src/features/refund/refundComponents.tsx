import {
  BrandLogo,
  CustomerButton,
} from "@xlb/customer-components";
import type {
  CustomerRefundDataStatus,
  CustomerRefundTemplateData,
} from "./refundTypes.js";

export type CustomerRefundComponentProps = CustomerRefundTemplateData & {
  readonly pageStatus: CustomerRefundDataStatus;
};

export function CustomerRefundStateHeader() {
  return (
    <header className="xlb-refund-header xlb-refund-header--boundary">
      <BrandLogo variant="compact" />
      <div>
        <p>全额退款申请</p>
        <h1>申请退款</h1>
      </div>
    </header>
  );
}

export function CustomerRefundHeader({
  viewModel,
  actions,
}: CustomerRefundComponentProps) {
  const locked = viewModel.result !== null;
  return (
    <header className="xlb-refund-header" data-refund-component="header">
      <button
        type="button"
        className="xlb-refund-header__back"
        aria-label="返回订单详情"
        onClick={actions.onBack}
      >
        返回
      </button>
      <div className="xlb-refund-header__brand">
        <BrandLogo variant="compact" />
        <div>
          <p>金额由服务端确定</p>
          <h1>申请退款</h1>
        </div>
      </div>
      <CustomerButton
        variant="quiet"
        disabled={locked}
        onClick={actions.onRetry}
      >
        重新读取
      </CustomerButton>
    </header>
  );
}

export function CustomerRefundFeedback({
  viewModel,
  pageStatus,
}: CustomerRefundComponentProps) {
  if (pageStatus === "validation_error") {
    return (
      <div className="xlb-refund-feedback" data-kind="error" role="alert">
        请修正退款原因后再提交。
      </div>
    );
  }
  if (pageStatus === "conflict") {
    return (
      <div className="xlb-refund-feedback" data-kind="conflict" role="status">
        {viewModel.notice ??
          "服务端事实已变化。页面只重新读取了订单，无法查询退款记录。"}
      </div>
    );
  }
  return null;
}

export function CustomerRefundOrderSummary({
  viewModel,
}: CustomerRefundComponentProps) {
  const { order } = viewModel;
  return (
    <section
      className="xlb-refund-summary"
      data-refund-component="order-summary"
    >
      <div className="xlb-refund-section-heading">
        <div>
          <p>服务端订单事实</p>
          <h2>{order.skuName}</h2>
        </div>
        <span data-order-status={order.status}>{order.status}</span>
      </div>
      <dl>
        <div>
          <dt>订单号</dt>
          <dd>{order.orderId}</dd>
        </div>
        <div>
          <dt>当前提示</dt>
          <dd>
            {viewModel.eligibility.enabled
              ? "paid 订单可尝试提交"
              : "当前订单不是 paid，提交入口保持关闭"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function CustomerRefundEligibilityNotice({
  viewModel,
}: CustomerRefundComponentProps) {
  return (
    <section
      className="xlb-refund-policy"
      data-refund-component="eligibility-notice"
      data-eligible={viewModel.eligibility.enabled ? "true" : "false"}
    >
      <div className="xlb-refund-section-heading">
        <div>
          <p>资格边界</p>
          <h2>前端提示不等于资格证明</h2>
        </div>
        <span>后端最终裁决</span>
      </div>
      <p>
        页面仅把 <code>order.status=paid</code> 作为可提交的 UX 提示。
        履约完成、账本已记账与正式全额资格仍由后端共同裁决。
      </p>
      <p>
        退款金额不可编辑，也不由页面计算或覆盖。提交时明确省略
        <code> amount</code>，由服务端从订单与账本确定正式全额。
      </p>
    </section>
  );
}

export function CustomerRefundRequestForm({
  viewModel,
  actions,
  pageStatus,
}: CustomerRefundComponentProps) {
  if (pageStatus === "limited-result") return null;
  const locked = pageStatus === "requesting";
  const disabled = locked ||
    !viewModel.eligibility.enabled ||
    viewModel.reason.length > 255;

  return (
    <form
      className="xlb-refund-form"
      data-refund-component="request-form"
      onSubmit={(event) => {
        event.preventDefault();
        actions.onSubmit();
      }}
    >
      <div className="xlb-refund-section-heading">
        <div>
          <p>可选说明</p>
          <h2>退款原因</h2>
        </div>
        <span>最多 255 字</span>
      </div>
      <label htmlFor="customer-refund-reason">
        请说明申请原因
      </label>
      <textarea
        id="customer-refund-reason"
        rows={5}
        maxLength={255}
        value={viewModel.reason}
        disabled={locked || !viewModel.eligibility.enabled}
        aria-invalid={viewModel.errors.reason ? "true" : undefined}
        aria-describedby="customer-refund-reason-help"
        placeholder="可选；请勿填写银行卡、手机号或详细地址"
        onChange={(event) => actions.onReasonChange(event.target.value)}
      />
      <div id="customer-refund-reason-help" className="xlb-refund-help">
        <span>
          {viewModel.errors.reason ??
            "页面只提交订单号与原因；全额金额由服务端决定。"}
        </span>
        <span>{viewModel.reason.length} / 255</span>
      </div>
      {!viewModel.eligibility.enabled ? (
        <p className="xlb-refund-disabled-reason" role="status">
          仅当服务端订单状态为 paid 时，页面才提供提交入口。
        </p>
      ) : null}
      <CustomerButton
        type="submit"
        className="xlb-refund-submit"
        busy={locked}
        disabled={disabled}
      >
        {locked ? "正在请求服务端" : "提交全额退款申请"}
      </CustomerButton>
    </form>
  );
}

export function CustomerRefundResultPanel({
  viewModel,
  actions,
  pageStatus,
}: CustomerRefundComponentProps) {
  if (pageStatus !== "limited-result" || viewModel.result === null) return null;
  const result = viewModel.result;
  return (
    <section
      className="xlb-refund-result"
      data-refund-component="result"
      data-refund-status={result.status}
      role="status"
      aria-live="polite"
    >
      <div className="xlb-refund-section-heading">
        <div>
          <p>仅本次内存响应</p>
          <h2>服务端已返回退款申请事实</h2>
        </div>
        <span>{viewModel.idempotent ? "幂等重放" : "本次创建"}</span>
      </div>
      <dl>
        <div>
          <dt>amount</dt>
          <dd data-refund-field="amount">{result.amount}</dd>
        </div>
        <div>
          <dt>currency</dt>
          <dd data-refund-field="currency">{result.currency}</dd>
        </div>
        <div>
          <dt>status</dt>
          <dd data-refund-field="status">{result.status}</dd>
        </div>
      </dl>
      <p className="xlb-refund-result__meaning">
        {result.status === "requested"
          ? "requested 表示服务端已记录申请，不代表款项到账或退款已经完成。"
          : "approved 是服务端返回的当前事实；页面不会据此推断款项已经到账。"}
      </p>
      <aside className="xlb-refund-limited">
        <strong>持续查询能力有限</strong>
        <p>
          Customer 当前没有退款 GET、列表或状态查询 API。本页只在内存保留
          本次响应；刷新或再次进入后无法恢复，也不会生成本地进度时间线。
        </p>
      </aside>
      <CustomerButton
        type="button"
        className="xlb-refund-return"
        onClick={actions.onBack}
      >
        返回订单
      </CustomerButton>
    </section>
  );
}
