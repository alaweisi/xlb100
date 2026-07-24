import {
  BrandLogo,
  CustomerButton,
} from "@xlb/customer-components";
import type {
  PriceFeeItem,
  ServiceSkuProfile,
} from "@xlb/types";
import type { CustomerServiceDetailViewModel } from "./serviceDetail.js";

export interface CustomerServiceDetailComponentActions {
  readonly onBack: () => void;
  readonly onStartCheckout: () => void;
}

export interface CustomerServiceDetailComponentProps {
  readonly viewModel: CustomerServiceDetailViewModel;
  readonly actions: CustomerServiceDetailComponentActions;
}

function money(currency: string, amount: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function feeAmount(currency: string, fee: PriceFeeItem): string {
  if (fee.chargeMethod === "onsite_quote") return "上门报价";
  if (fee.chargeMethod === "included") return "已包含";
  if (fee.minAmount !== null && fee.maxAmount !== null) {
    if (fee.minAmount === fee.maxAmount) return money(currency, fee.minAmount);
    return `${money(currency, fee.minAmount)} – ${money(currency, fee.maxAmount)}`;
  }
  if (fee.minAmount !== null) return `${money(currency, fee.minAmount)} 起`;
  if (fee.maxAmount !== null) return `不超过 ${money(currency, fee.maxAmount)}`;
  return money(currency, fee.amount);
}

function booleanFact(value: boolean): string {
  return value ? "是" : "否";
}

const serviceModeLabels: Record<ServiceSkuProfile["serviceMode"], string> = {
  installation: "安装",
  repair: "维修",
  cleaning: "清洁",
  delivery: "配送",
  measurement: "测量",
  dismantle: "拆除",
  maintenance: "保养",
  inspection: "检测",
};

const skillLevelLabels: Record<ServiceSkuProfile["skillLevel"], string> = {
  basic: "基础",
  advanced: "进阶",
  specialist: "专业",
};

const priceTypeLabels: Record<CustomerServiceDetailViewModel["quote"]["priceType"], string> = {
  fixed: "固定价",
  range: "区间价",
  from: "起步价",
  estimate_from: "估价起",
  onsite_quote: "上门报价",
};

function ProfileFacts({ profile }: { readonly profile: ServiceSkuProfile }) {
  return (
    <dl className="xlb-service-detail-profile__facts">
      <div><dt>服务模式</dt><dd>{serviceModeLabels[profile.serviceMode]}</dd></div>
      <div><dt>技能等级</dt><dd>{skillLevelLabels[profile.skillLevel]}</dd></div>
      <div><dt>质保天数</dt><dd>{profile.warrantyDays}</dd></div>
      <div><dt>需要型号信息</dt><dd>{booleanFact(profile.requiresModel)}</dd></div>
      <div><dt>需要上门测量</dt><dd>{booleanFact(profile.requiresMeasurement)}</dd></div>
      <div><dt>支持企业服务</dt><dd>{booleanFact(profile.supportsEnterprise)}</dd></div>
      {profile.brandScope !== null ? (
        <div><dt>品牌范围</dt><dd>{profile.brandScope}</dd></div>
      ) : null}
      {profile.modelScope !== null ? (
        <div><dt>型号范围</dt><dd>{profile.modelScope}</dd></div>
      ) : null}
    </dl>
  );
}

export function DetailBoundaryHeader() {
  return (
    <header className="xlb-service-detail-boundary-header">
      <BrandLogo variant="compact" />
      <div>
        <p>当前城市正式服务</p>
        <h1>服务详情</h1>
      </div>
    </header>
  );
}

export function DetailHeader({
  actions,
}: CustomerServiceDetailComponentProps) {
  return (
    <header
      className="xlb-service-detail-header"
      data-service-detail-component="header"
    >
      <button type="button" onClick={actions.onBack} aria-label="返回服务发现">
        返回
      </button>
      <BrandLogo variant="compact" />
    </header>
  );
}

export function DetailServiceIdentity({
  viewModel,
}: CustomerServiceDetailComponentProps) {
  const { identity } = viewModel;
  return (
    <section
      className="xlb-service-detail-identity"
      data-service-detail-component="service-identity"
      aria-labelledby="customer-service-detail-title"
    >
      <p>{identity.pathLabel}</p>
      <h1 id="customer-service-detail-title">{identity.name}</h1>
      <span>服务单位：{identity.unit}</span>
    </section>
  );
}

export function DetailPriceQuotePanel({
  viewModel,
}: CustomerServiceDetailComponentProps) {
  const { quote, identity } = viewModel;
  return (
    <section
      className="xlb-service-detail-price"
      data-service-detail-component="price-quote-panel"
      aria-labelledby="customer-service-price-title"
    >
      <div>
        <p id="customer-service-price-title">当前城市报价</p>
        <strong>{quote.priceText}</strong>
        <span>服务单位：{identity.unit}</span>
      </div>
      <dl>
        <div><dt>报价类型</dt><dd>{priceTypeLabels[quote.priceType]}</dd></div>
        <div><dt>币种</dt><dd>{quote.currency}</dd></div>
        <div><dt>规则版本</dt><dd>{quote.version}</dd></div>
      </dl>
      {quote.pricingNote !== null ? <p className="xlb-service-detail-price__note">{quote.pricingNote}</p> : null}
    </section>
  );
}

export function DetailFeeBreakdown({
  viewModel,
}: CustomerServiceDetailComponentProps) {
  const { quote } = viewModel;
  const enabledFeeItems = quote.breakdown.feeItems
    .filter((item) => item.isEnabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <section
      className="xlb-service-detail-breakdown"
      data-service-detail-component="fee-breakdown"
      aria-labelledby="customer-service-fee-title"
    >
      <div className="xlb-service-detail-section-heading">
        <h2 id="customer-service-fee-title">费用明细</h2>
        <span>以报价接口返回为准</span>
      </div>
      <dl className="xlb-service-detail-totals">
        <div><dt>基础金额</dt><dd>{money(quote.currency, quote.breakdown.baseAmount)}</dd></div>
        <div><dt>必选费用</dt><dd>{money(quote.currency, quote.breakdown.requiredFeeAmount)}</dd></div>
        <div><dt>可选费用</dt><dd>{money(quote.currency, quote.breakdown.optionalFeeAmount)}</dd></div>
        <div className="xlb-service-detail-totals__total">
          <dt>当前合计</dt>
          <dd>{money(quote.currency, quote.breakdown.totalAmount)}</dd>
        </div>
      </dl>
      {enabledFeeItems.length > 0 ? (
        <ul className="xlb-service-detail-fees">
          {enabledFeeItems.map((fee) => (
            <li key={fee.feeItemId}>
              <div>
                <strong>{fee.feeName}</strong>
                <span>{fee.chargeMethod}{fee.unit !== null ? ` · ${fee.unit}` : ""}</span>
              </div>
              <span>{feeAmount(quote.currency, fee)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function DetailServiceStandards({
  viewModel,
}: CustomerServiceDetailComponentProps) {
  const { identity } = viewModel;
  return (
    <section
      className="xlb-service-detail-standards"
      data-service-detail-component="service-standards"
      aria-labelledby="customer-service-standards-title"
    >
      <div className="xlb-service-detail-section-heading">
        <h2 id="customer-service-standards-title">服务说明与标准</h2>
        <span>{identity.standards.length} 项</span>
      </div>
      {identity.profile !== null ? (
        <div className="xlb-service-detail-profile">
          <h3>服务保障</h3>
          <p>{identity.profile.serviceGuaranteeText}</p>
          <ProfileFacts profile={identity.profile} />
        </div>
      ) : null}
      {identity.standards.length > 0 ? (
        <ol>
          {identity.standards.map((standard) => (
            <li key={standard.standardId}>
              <div>
                <strong>{standard.title}</strong>
                {standard.isRequired ? <span>必须</span> : null}
              </div>
              <p>{standard.content}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="xlb-service-detail-standards__empty">
          当前正式目录未返回额外服务标准。
        </p>
      )}
    </section>
  );
}

export function DetailStickyTaskAction({
  viewModel,
  actions,
}: CustomerServiceDetailComponentProps) {
  return (
    <div
      className="xlb-service-detail-action"
      data-service-detail-component="sticky-task-action"
    >
      <div>
        <span>当前报价</span>
        <strong>{viewModel.quote.priceText}</strong>
      </div>
      <CustomerButton variant="primary" onClick={actions.onStartCheckout}>
        进入服务预约
      </CustomerButton>
    </div>
  );
}

export function DetailCatalogVerificationNote(
  _props: CustomerServiceDetailComponentProps,
) {
  return (
    <aside className="xlb-service-detail-note" data-service-detail-component="catalog-verification-note">
      本页服务身份来自当前城市正式启用的服务目录。
    </aside>
  );
}

export function DetailQuoteRefreshNote(
  _props: CustomerServiceDetailComponentProps,
) {
  return (
    <aside className="xlb-service-detail-note" data-service-detail-component="quote-refresh-note">
      进入预约流程后会重新读取正式报价；本页不锁定交易金额。
    </aside>
  );
}
