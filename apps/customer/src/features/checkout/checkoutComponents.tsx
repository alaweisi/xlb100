import { CustomerButton } from "@xlb/customer-components";
import type { ScheduledTimeSlot } from "@xlb/types";
import type {
  CustomerCheckoutActions,
  CustomerCheckoutViewModel,
} from "./checkoutTypes.js";
import { maskCustomerEnteredPhone } from "./checkoutTypes.js";

export interface CustomerCheckoutComponentProps {
  readonly viewModel: CustomerCheckoutViewModel;
  readonly actions: CustomerCheckoutActions;
}

const STEP_LABELS = {
  service: "服务",
  address: "地址",
  schedule: "时间",
  coupon: "优惠",
  review: "确认",
} as const;

const PRICE_TYPE_LABELS = {
  fixed: "固定价",
  range: "区间价",
  from: "起步价",
  estimate_from: "预估起",
  onsite_quote: "上门报价",
} as const;

const SLOT_LABELS: ReadonlyArray<{
  readonly value: ScheduledTimeSlot;
  readonly label: string;
  readonly hint: string;
}> = [
  { value: "morning", label: "上午", hint: "09:00 起" },
  { value: "afternoon", label: "下午", hint: "14:00 起" },
  { value: "evening", label: "晚间", hint: "19:00 起" },
];

function money(currency: string, value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function StepActions({
  viewModel,
  actions,
  nextLabel = "继续",
}: CustomerCheckoutComponentProps & { readonly nextLabel?: string }) {
  return (
    <div className="xlb-checkout-step-actions">
      {viewModel.currentStep !== "service" ? (
        <CustomerButton
          type="button"
          variant="secondary"
          onClick={actions.onPreviousStep}
          disabled={viewModel.submitting || viewModel.quoteRefreshing}
        >
          上一步
        </CustomerButton>
      ) : null}
      <CustomerButton
        type="button"
        onClick={actions.onNextStep}
        disabled={viewModel.submitting || viewModel.quoteRefreshing}
        busy={viewModel.quoteRefreshing}
      >
        {viewModel.quoteRefreshing ? "正在重读报价" : nextLabel}
      </CustomerButton>
    </div>
  );
}

export function CheckoutHeader({ actions }: CustomerCheckoutComponentProps) {
  return (
    <header className="xlb-checkout-header">
      <CustomerButton
        type="button"
        variant="quiet"
        onClick={actions.onBack}
        aria-label="返回服务详情"
      >
        返回
      </CustomerButton>
      <div>
        <span>预约服务</span>
        <strong>确认下单信息</strong>
      </div>
      <span className="xlb-checkout-header__step" aria-hidden="true">5 步</span>
    </header>
  );
}

export function CheckoutStepProgress({ viewModel }: CustomerCheckoutComponentProps) {
  const currentIndex = Object.keys(STEP_LABELS).indexOf(viewModel.currentStep);
  return (
    <nav className="xlb-checkout-progress" aria-label="下单进度">
      {Object.entries(STEP_LABELS).map(([step, label], index) => (
        <div
          key={step}
          className="xlb-checkout-progress__item"
          data-active={index === currentIndex || undefined}
          data-complete={index < currentIndex || undefined}
          aria-current={index === currentIndex ? "step" : undefined}
        >
          <span>{index + 1}</span>
          <small>{label}</small>
        </div>
      ))}
    </nav>
  );
}

export function CheckoutNotice({
  viewModel,
  actions,
}: CustomerCheckoutComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-checkout-notice"
      data-kind={viewModel.notice.kind}
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
    >
      <span>{viewModel.notice.message}</span>
      <button type="button" onClick={actions.onDismissNotice}>知道了</button>
    </div>
  );
}

export function CheckoutServiceQuantity(props: CustomerCheckoutComponentProps) {
  const { viewModel, actions } = props;
  const { identity } = viewModel.service;
  return (
    <section className="xlb-checkout-step" aria-labelledby="checkout-service-title">
      <div className="xlb-checkout-step__intro">
        <span>步骤 1</span>
        <h1 id="checkout-service-title">核对服务与数量</h1>
        <p>服务与报价均来自当前城市的正式 Catalog 和 Quote。</p>
      </div>

      <article className="xlb-checkout-service-summary">
        <div>
          <small>{identity.pathLabel}</small>
          <h2>{identity.name}</h2>
          <p>{viewModel.quote.priceText}</p>
        </div>
        <span>{identity.unit}</span>
      </article>

      <label className="xlb-checkout-field">
        <span>服务数量</span>
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          inputMode="numeric"
          value={viewModel.draft.quantity}
          onChange={(event) => actions.onQuantityChange(Number(event.target.value))}
          aria-describedby={viewModel.errors.quantity
            ? "checkout-quantity-error"
            : "checkout-quantity-help"}
        />
      </label>
      {viewModel.errors.quantity ? (
        <p id="checkout-quantity-error" className="xlb-checkout-field-error">
          {viewModel.errors.quantity}
        </p>
      ) : (
        <p id="checkout-quantity-help" className="xlb-checkout-field-help">
          页面不按数量重算业务金额；订单金额由创建订单时的服务端快照确认。
        </p>
      )}
      <StepActions {...props} />
    </section>
  );
}

export function CheckoutAddressPicker(props: CustomerCheckoutComponentProps) {
  const { viewModel, actions } = props;
  return (
    <section className="xlb-checkout-step" aria-labelledby="checkout-address-title">
      <div className="xlb-checkout-step__intro">
        <span>步骤 2</span>
        <h1 id="checkout-address-title">选择服务地址</h1>
        <p>只可选择当前服务城市内、由地址 API 返回的地址。</p>
      </div>

      {viewModel.addresses.length === 0 ? (
        <div className="xlb-checkout-inline-state">
          <strong>当前城市还没有地址</strong>
          <p>请前往地址簿新增地址，再返回继续预约。</p>
        </div>
      ) : (
        <fieldset className="xlb-checkout-address-list">
          <legend>当前城市地址</legend>
          {viewModel.addresses.map((address) => (
            <label
              key={address.addressId}
              className="xlb-checkout-address"
              data-selected={address.addressId === viewModel.draft.addressId || undefined}
            >
              <input
                type="radio"
                name="checkout-address"
                value={address.addressId}
                checked={address.addressId === viewModel.draft.addressId}
                onChange={() => actions.onAddressSelect(address.addressId)}
              />
              <span>
                <strong>
                  {address.contactName}
                  {address.isDefault ? <em>默认</em> : null}
                </strong>
                <small>{address.contactPhoneMasked}</small>
                <span>
                  {address.province}{address.city}{address.district}{address.detailAddress}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {viewModel.errors.address ? (
        <p className="xlb-checkout-field-error">{viewModel.errors.address}</p>
      ) : null}

      <CustomerButton
        type="button"
        variant="quiet"
        onClick={actions.onOpenAddressPicker}
      >
        在地址簿中新增或管理
      </CustomerButton>

      {viewModel.selectedAddress !== null ? (
        <div className="xlb-checkout-phone-reentry">
          <div>
            <strong>重新输入完整联系电话</strong>
            <p>
              地址接口仅返回 {viewModel.selectedAddress.contactPhoneMasked}。
              为保护隐私，系统不会从掩码推断号码。
            </p>
          </div>
          <label className="xlb-checkout-field">
            <span>完整手机号码</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              value={viewModel.draft.contactPhone}
              onChange={(event) => actions.onContactPhoneChange(event.target.value)}
              aria-invalid={viewModel.errors.contactPhone ? "true" : undefined}
            />
          </label>
          {viewModel.errors.contactPhone ? (
            <p className="xlb-checkout-field-error">
              {viewModel.errors.contactPhone}
            </p>
          ) : (
            <p className="xlb-checkout-field-help">
              完整号码只保留在本次页面内存中，不写入本地存储。
            </p>
          )}
        </div>
      ) : null}
      <StepActions {...props} />
    </section>
  );
}

export function CheckoutSchedulePicker(props: CustomerCheckoutComponentProps) {
  const { viewModel, actions } = props;
  return (
    <section className="xlb-checkout-step" aria-labelledby="checkout-schedule-title">
      <div className="xlb-checkout-step__intro">
        <span>步骤 3</span>
        <h1 id="checkout-schedule-title">填写请求时间</h1>
        <p>日期和时段是顾客请求，不代表平台已确认容量或预约成功。</p>
      </div>

      <label className="xlb-checkout-field">
        <span>请求日期</span>
        <input
          type="date"
          min={viewModel.minimumRequestedDate}
          value={viewModel.draft.requestedDate}
          onChange={(event) => actions.onRequestedDateChange(event.target.value)}
          aria-invalid={viewModel.errors.requestedDate ? "true" : undefined}
        />
      </label>
      {viewModel.errors.requestedDate ? (
        <p className="xlb-checkout-field-error">{viewModel.errors.requestedDate}</p>
      ) : null}

      <fieldset className="xlb-checkout-slot-list">
        <legend>请求时段</legend>
        {SLOT_LABELS.map((slot) => (
          <label key={slot.value}>
            <input
              type="radio"
              name="checkout-slot"
              value={slot.value}
              checked={viewModel.draft.requestedTimeSlot === slot.value}
              onChange={() => actions.onRequestedTimeSlotChange(slot.value)}
            />
            <span>
              <strong>{slot.label}</strong>
              <small>{slot.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {viewModel.errors.requestedTimeSlot ? (
        <p className="xlb-checkout-field-error">{viewModel.errors.requestedTimeSlot}</p>
      ) : null}

      <div className="xlb-checkout-capacity-note" role="note">
        平台当前没有服务容量或可预约性 API。订单创建成功仅表示已收到请求，
        后续状态以订单返回的真实状态为准。
      </div>
      <StepActions {...props} />
    </section>
  );
}

export function CheckoutCouponBoundary(props: CustomerCheckoutComponentProps) {
  return (
    <section className="xlb-checkout-step" aria-labelledby="checkout-coupon-title">
      <div className="xlb-checkout-step__intro">
        <span>步骤 4</span>
        <h1 id="checkout-coupon-title">优惠能力</h1>
        <p>本次订单将继续不使用优惠。</p>
      </div>

      <div className="xlb-checkout-coupon-boundary" role="note">
        <strong>优惠展示能力暂不可用</strong>
        <p>
          当前顾客券接口没有名称、面额和门槛等正式展示投影。
          页面不会从 grantId、管理端定义或本地常量拼装“可省”金额。
        </p>
        <span>不使用优惠，不会请求或携带 discount decision。</span>
      </div>
      <StepActions {...props} nextLabel="重读报价并确认" />
    </section>
  );
}

export function CheckoutOrderReview({ viewModel, actions }: CustomerCheckoutComponentProps) {
  const address = viewModel.selectedAddress;
  const phoneMasked = maskCustomerEnteredPhone(viewModel.draft.contactPhone);
  return (
    <section className="xlb-checkout-step" aria-labelledby="checkout-review-title">
      <div className="xlb-checkout-step__intro">
        <span>步骤 5</span>
        <h1 id="checkout-review-title">确认并创建订单</h1>
        <p>进入本页时已重新读取 Quote；请核对服务端事实后提交。</p>
      </div>

      <dl className="xlb-checkout-review">
        <div>
          <dt>服务</dt>
          <dd>{viewModel.service.identity.name}</dd>
        </div>
        <div>
          <dt>数量</dt>
          <dd>{viewModel.draft.quantity} {viewModel.service.identity.unit}</dd>
        </div>
        <div>
          <dt>请求时间</dt>
          <dd>
            {viewModel.draft.requestedDate} · {
              SLOT_LABELS.find((slot) =>
                slot.value === viewModel.draft.requestedTimeSlot)?.label
            }
          </dd>
        </div>
        <div>
          <dt>服务地址</dt>
          <dd>
            {address
              ? `${address.province}${address.city}${address.district}${address.detailAddress}`
              : "未选择"}
          </dd>
        </div>
        <div>
          <dt>联系人</dt>
          <dd>{address?.contactName ?? "未选择"} · {phoneMasked || "未填写"}</dd>
        </div>
        <div>
          <dt>优惠</dt>
          <dd>不使用优惠</dd>
        </div>
      </dl>

      <article className="xlb-checkout-quote">
        <div>
          <span>服务端 Quote</span>
          <strong>{viewModel.quote.priceText}</strong>
        </div>
        <dl>
          <div>
            <dt>报价类型</dt>
            <dd>{PRICE_TYPE_LABELS[viewModel.quote.priceType]}</dd>
          </div>
          <div>
            <dt>规则版本</dt>
            <dd>v{viewModel.quote.version}</dd>
          </div>
          <div>
            <dt>报价明细合计</dt>
            <dd>{money(
              viewModel.quote.currency,
              viewModel.quote.breakdown.totalAmount,
            )}</dd>
          </div>
        </dl>
        <p>
          页面不按数量重算金额。最终金额、价格类型与明细以服务端创建订单后
          返回的订单快照为准。
        </p>
      </article>

      {viewModel.errors.form ? (
        <p className="xlb-checkout-field-error" role="alert">
          {viewModel.errors.form}
        </p>
      ) : null}
      <div className="xlb-checkout-step-actions">
        <CustomerButton
          type="button"
          variant="secondary"
          onClick={actions.onPreviousStep}
          disabled={viewModel.submitting}
        >
          上一步
        </CustomerButton>
        <CustomerButton
          type="button"
          onClick={actions.onSubmit}
          busy={viewModel.submitting}
        >
          {viewModel.submitting ? "正在创建订单" : "确认创建订单"}
        </CustomerButton>
      </div>
      <p className="xlb-checkout-submit-note">
        提交期间会锁定按钮以防重复点击。当前普通订单契约尚无服务端通用幂等能力。
      </p>
    </section>
  );
}
