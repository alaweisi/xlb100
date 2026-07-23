import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  ReviewAppeal,
  ReviewAppealStatus,
  ReviewVisibility,
} from "@xlb/types";
import {
  currentCustomerOpenAppeal,
  type CustomerReviewTemplateReadyData,
} from "./reviewTypes.js";

export type CustomerReviewComponentProps = CustomerReviewTemplateReadyData;

function displayTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function visibilityCopy(visibility: ReviewVisibility): {
  readonly label: string;
  readonly description: string;
} {
  switch (visibility) {
    case "pending_moderation":
      return {
        label: "待审核",
        description: "服务端尚未作出公开或隐藏决定，当前不能推断为公开可见。",
      };
    case "visible":
      return {
        label: "公开可见",
        description: "服务端当前明确返回此评价为公开可见。",
      };
    case "hidden":
      return {
        label: "已隐藏",
        description: "服务端当前明确返回此评价为隐藏状态。",
      };
  }
}

function appealStatusLabel(status: ReviewAppealStatus): string {
  switch (status) {
    case "open":
      return "处理中";
    case "upheld":
      return "申诉成立";
    case "rejected":
      return "申诉未成立";
    case "withdrawn":
      return "已撤回";
  }
}

export function ReviewBoundaryHeader() {
  return (
    <header
      className="xlb-review-header xlb-review-header--boundary"
      data-review-component="header"
    >
      <BrandLogo variant="compact" />
      <div>
        <p>服务体验与审核进展</p>
        <h1>订单评价</h1>
      </div>
    </header>
  );
}

export function ReviewHeader({
  viewModel,
  actions,
}: CustomerReviewComponentProps) {
  const appealRoute = viewModel.routeInput.kind === "appeal";
  return (
    <header
      className="xlb-review-header"
      data-review-component="header"
    >
      <button
        type="button"
        className="xlb-review-header__back"
        onClick={actions.onBack}
        aria-label="返回上一页"
      >
        返回
      </button>
      <div className="xlb-review-header__copy">
        <BrandLogo variant="compact" />
        <div>
          <p>{appealRoute ? "审核决定与申诉" : "分享本次服务体验"}</p>
          <h1>{appealRoute ? "评价申诉" : "订单评价"}</h1>
        </div>
      </div>
      <CustomerButton
        variant="quiet"
        className="xlb-review-header__refresh"
        busy={viewModel.refreshing}
        disabled={viewModel.operation !== null}
        onClick={actions.onRefresh}
      >
        {viewModel.refreshing ? "刷新中" : "刷新"}
      </CustomerButton>
    </header>
  );
}

export function ReviewFeedback({
  viewModel,
  actions,
}: CustomerReviewComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-review-feedback"
      data-kind={viewModel.notice.kind}
      data-review-component="feedback"
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{viewModel.notice.message}</span>
      <button type="button" onClick={actions.onDismissNotice}>关闭</button>
    </div>
  );
}

export function ReviewSummary({
  viewModel,
  actions,
}: CustomerReviewComponentProps) {
  if (viewModel.review === null) {
    return (
      <section
        className="xlb-review-empty"
        data-review-component="review-summary"
        data-review-state="not-reviewed"
      >
        <CustomerStatePanel
          kind="empty"
          title="尚未提交评价"
          description="请选择星级并填写评价；资格、订单归属与唯一性由服务端最终裁决。"
        />
      </section>
    );
  }

  const { review, visibility, appeals } = viewModel.review;
  const visibilityText = visibilityCopy(visibility.visibility);
  const canOpenAppeal = viewModel.routeInput.kind === "order" &&
    (visibility.visibility === "hidden" || appeals.length > 0);
  return (
    <section
      className="xlb-review-summary"
      data-review-component="review-summary"
    >
      <div className="xlb-review-summary__heading">
        <div>
          <p>服务端已接收的评价</p>
          <h2>{review.rating} / 5 星</h2>
        </div>
        <span data-review-source-status={review.status}>已提交</span>
      </div>
      <blockquote>{review.comment}</blockquote>
      <div
        className="xlb-review-visibility"
        data-server-visibility={visibility.visibility}
      >
        <div>
          <span>当前可见性</span>
          <strong>{visibilityText.label}</strong>
        </div>
        <p>{visibilityText.description}</p>
        <small>
          审核版本 {visibility.moderationVersion} ·
          更新于 {displayTime(visibility.updatedAt)}
        </small>
      </div>
      <div className="xlb-review-summary__footer">
        <span>{appeals.length} 条申诉记录</span>
        {canOpenAppeal ? (
          <CustomerButton
            variant="secondary"
            disabled={viewModel.operation !== null || viewModel.refreshing}
            onClick={actions.onOpenAppeal}
          >
            查看或处理申诉
          </CustomerButton>
        ) : null}
      </div>
    </section>
  );
}

export function ReviewComposer({
  viewModel,
  actions,
}: CustomerReviewComponentProps) {
  if (
    viewModel.routeInput.kind !== "order" ||
    viewModel.review !== null
  ) return null;
  const creating = viewModel.operation === "creating-review";
  const disabled = viewModel.operation !== null || viewModel.refreshing;
  const trimmedLength = viewModel.draft.comment.trim().length;
  const submitDisabled = disabled ||
    viewModel.draft.rating === null ||
    trimmedLength === 0 ||
    trimmedLength > 500;

  return (
    <form
      className="xlb-review-composer"
      data-review-component="review-composer"
      onSubmit={(event) => {
        event.preventDefault();
        actions.onCreateReview();
      }}
    >
      <div className="xlb-review-section-heading">
        <div>
          <p>本次服务体验</p>
          <h2>提交评价</h2>
        </div>
        <span>必填</span>
      </div>
      <fieldset disabled={disabled}>
        <legend>服务星级</legend>
        <div className="xlb-review-rating" role="radiogroup" aria-label="服务星级">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-label={`${rating} 星`}
              aria-checked={viewModel.draft.rating === rating}
              onClick={() => actions.onRatingChange(rating)}
            >
              <strong>{rating}</strong>
              <span>星</span>
            </button>
          ))}
        </div>
        {viewModel.errors.rating ? (
          <p className="xlb-review-field-error" role="alert">
            {viewModel.errors.rating}
          </p>
        ) : null}
      </fieldset>
      <label className="xlb-review-field">
        <span>评价内容</span>
        <textarea
          value={viewModel.draft.comment}
          maxLength={500}
          rows={5}
          disabled={disabled}
          aria-invalid={viewModel.errors.comment ? "true" : undefined}
          aria-describedby="customer-review-comment-help"
          onChange={(event) => actions.onCommentChange(event.target.value)}
          placeholder="请描述本次服务体验"
        />
      </label>
      <div className="xlb-review-field-help" id="customer-review-comment-help">
        <span>{viewModel.errors.comment ?? "内容仅用于本次正式评价。"}</span>
        <span>{viewModel.draft.comment.length} / 500</span>
      </div>
      <CustomerButton
        type="submit"
        className="xlb-review-submit"
        busy={creating}
        disabled={submitDisabled}
      >
        {creating ? "正在提交评价" : "提交评价"}
      </CustomerButton>
    </form>
  );
}

function AppealCard({ appeal }: { readonly appeal: ReviewAppeal }) {
  return (
    <article
      className="xlb-review-appeal-card"
      data-server-appeal-status={appeal.status}
    >
      <div>
        <strong>{appealStatusLabel(appeal.status)}</strong>
        <span>版本 {appeal.version}</span>
      </div>
      <p>{appeal.reason}</p>
      {appeal.resolutionReason !== null ? (
        <p className="xlb-review-appeal-card__resolution">
          服务端结论：{appeal.resolutionReason}
        </p>
      ) : null}
      <small>
        审核版本 {appeal.moderationVersion} ·
        {displayTime(appeal.openedAt)}
      </small>
    </article>
  );
}

export function ReviewAppealManager({
  viewModel,
  actions,
}: CustomerReviewComponentProps) {
  if (
    viewModel.routeInput.kind !== "appeal" ||
    viewModel.review === null
  ) return null;

  const { visibility, appeals } = viewModel.review;
  const openAppeal = currentCustomerOpenAppeal(viewModel.review);
  const appealing = viewModel.operation === "appealing";
  const withdrawing = viewModel.operation === "withdrawing";
  const disabled = viewModel.operation !== null || viewModel.refreshing;
  const mayCreate = visibility.visibility === "hidden" && openAppeal === null;
  const reasonLength = viewModel.draft.appealReason.trim().length;

  return (
    <section
      className="xlb-review-appeals"
      data-review-component="appeal-manager"
    >
      <div className="xlb-review-section-heading">
        <div>
          <p>评价审核版本 {visibility.moderationVersion}</p>
          <h2>申诉记录</h2>
        </div>
        <span>{appeals.length} 条</span>
      </div>

      {appeals.length === 0 ? (
        <div data-review-state="no-appeal">
          <CustomerStatePanel
            kind="empty"
            title="暂无申诉"
            description={visibility.visibility === "pending_moderation"
              ? "评价仍待审核，服务端尚未产生可申诉的可见性决定。"
              : visibility.visibility === "visible"
                ? "顾客申诉仅针对服务端返回的隐藏决定。"
                : "如需申诉，请提交原因并等待服务端处理。"}
          />
        </div>
      ) : (
        <div className="xlb-review-appeal-list">
          {appeals.map((appeal) => (
            <AppealCard key={appeal.appealId} appeal={appeal} />
          ))}
        </div>
      )}

      {openAppeal !== null ? (
        <div className="xlb-review-appeal-action">
          <p>
            当前有一条服务端状态为“处理中”的申诉。撤回后页面会重新读取，
            不会在本地改写状态。
          </p>
          <CustomerButton
            variant="secondary"
            busy={withdrawing}
            disabled={disabled}
            onClick={actions.onWithdrawAppeal}
          >
            {withdrawing ? "正在撤回申诉" : "撤回申诉"}
          </CustomerButton>
        </div>
      ) : null}

      {mayCreate ? (
        <form
          className="xlb-review-appeal-form"
          onSubmit={(event) => {
            event.preventDefault();
            actions.onCreateAppeal();
          }}
        >
          <label className="xlb-review-field">
            <span>申诉原因</span>
            <textarea
              value={viewModel.draft.appealReason}
              maxLength={1_000}
              rows={5}
              disabled={disabled}
              aria-invalid={viewModel.errors.appealReason
                ? "true"
                : undefined}
              aria-describedby="customer-review-appeal-help"
              onChange={(event) =>
                actions.onAppealReasonChange(event.target.value)}
              placeholder="请说明希望复核的原因"
            />
          </label>
          <div
            className="xlb-review-field-help"
            id="customer-review-appeal-help"
          >
            <span>
              {viewModel.errors.appealReason ??
                `仅针对当前审核版本 ${visibility.moderationVersion}`}
            </span>
            <span>{viewModel.draft.appealReason.length} / 1000</span>
          </div>
          <CustomerButton
            type="submit"
            className="xlb-review-submit"
            busy={appealing}
            disabled={disabled || reasonLength === 0 || reasonLength > 1_000}
          >
            {appealing ? "正在提交申诉" : "提交申诉"}
          </CustomerButton>
        </form>
      ) : null}

      <p className="xlb-review-appeals__identity-note">
        当前页面仅展示本人订单评价的服务端状态，不显示顾客或服务人员标识。
        评价编号以当前路由和服务端响应交叉核对。
      </p>
    </section>
  );
}
