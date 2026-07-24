import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  CustomerPaymentComponentProps,
  CustomerPaymentTemplateState,
} from "./CustomerPaymentTypes.js";

export function CustomerPaymentHeader() {
  return (
    <header className="xlb-payment-header">
      <BrandLogo variant="compact" />
      <div>
        <p>安全支付边界</p>
        <h1>支付</h1>
      </div>
    </header>
  );
}

function boundaryCopy(state: CustomerPaymentTemplateState) {
  switch (state.status) {
    case "loading":
      return {
        kind: "loading" as const,
        title: "正在检查支付能力",
        description: "页面只检查正式能力边界，不读取或展示任何支付事实。",
      };
    case "empty":
      return {
        kind: "offline" as const,
        title: "支付能力暂不可用",
        description:
          "当前没有可由服务端安全证明的支付单读取结果；页面不会根据链接猜测对象是否存在。",
      };
    case "error":
      return {
        kind: "error" as const,
        title: "支付能力无法安全确认",
        description:
          "页面不会把未知结果解释为支付完成，也不会提供本地再次发起入口。",
      };
    case "conflict":
      return {
        kind: "error" as const,
        title: "支付事实需要重新确认",
        description:
          "在服务端读取与结果确认能力接通前，页面保持关闭，不覆盖任何服务端事实。",
      };
    case "ready":
    case "unavailable":
      return {
        kind: "offline" as const,
        title: "支付能力暂不可用",
        description:
          "真实支付 Provider、支付单读取与支付结果确认尚未接通。为保护订单与资金安全，本页已关闭支付操作。",
      };
  }
}

export function CustomerPaymentGapBoundary({
  state,
}: CustomerPaymentComponentProps) {
  const copy = boundaryCopy(state);
  return (
    <section
      className="xlb-payment-boundary"
      data-capability="unavailable"
      aria-labelledby="customer-payment-gap-title"
    >
      <div className="xlb-payment-boundary__flag">
        <span>能力未开放</span>
        <code id="customer-payment-gap-title">blocked_by_gap_02</code>
      </div>
      <CustomerStatePanel
        kind={copy.kind}
        title={copy.title}
        description={copy.description}
      />
      <div className="xlb-payment-boundary__facts" role="note">
        <h2>当前安全边界</h2>
        <ul>
          <li>不会创建支付单或发起 Provider 跳转。</li>
          <li>不会轮询、订阅或在设备保存支付结果。</li>
          <li>不会根据链接展示金额、支付结论或交易编号。</li>
        </ul>
      </div>
    </section>
  );
}

export function CustomerPaymentSafeActions({
  actions,
}: CustomerPaymentComponentProps) {
  return (
    <section className="xlb-payment-actions" aria-label="安全返回">
      <CustomerButton
        variant="primary"
        onClick={actions.returnToOrders}
      >
        返回订单中心
      </CustomerButton>
      <p>
        当前链接不能证明对应订单；在服务端提供可信订单引用前，不会跳转到猜测的订单详情。
      </p>
    </section>
  );
}
