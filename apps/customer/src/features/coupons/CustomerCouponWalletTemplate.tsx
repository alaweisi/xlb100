import { CustomerStatePanel } from "@xlb/customer-components";
import type { CustomerL1TemplateProps } from "../../platform/slices/index.js";
import {
  createCustomerCouponWalletComponentRegistry,
  type CustomerCouponWalletComponentType,
} from "./CouponWalletComponentRegistry.js";
import type {
  CustomerCouponWalletTemplateReadyData,
} from "./couponWalletTypes.js";

type CouponWalletTemplateState =
  CustomerL1TemplateProps["state"] &
  { readonly data?: CustomerCouponWalletTemplateReadyData };

function dispatchRecovery(actionKey: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(actionKey));
  }
}

function Boundary({
  state,
}: {
  readonly state: CouponWalletTemplateState;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取券包"
          description="正在读取正式 Customer coupon-grants 服务端事实。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="暂时没有 grant"
          description="当前服务端没有返回 coupon grant。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "error":
      return (
        <CustomerStatePanel
          kind="error"
          title="券包加载失败"
          description={state.retryable
            ? "尚未读取到权威结果，请重试。"
            : "服务端响应无法通过正式契约校验。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "conflict":
      return (
        <CustomerStatePanel
          kind="error"
          title="券包事实已变化"
          description="页面不会保留冲突前的选择，需重新读取服务端权威事实。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="券包能力暂不可用"
          description="页面不会用 Admin 定义、本地常量或缓存业务事实补齐。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "ready":
      return null;
  }
}

function renderRegistered(
  type: CustomerCouponWalletComponentType,
  props: CustomerCouponWalletTemplateReadyData,
) {
  const Component = createCustomerCouponWalletComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Coupon Wallet component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerCouponWalletTemplate({
  state,
}: CustomerL1TemplateProps) {
  const couponState = state as CouponWalletTemplateState;
  if (couponState.status !== "ready") {
    return (
      <main className="xlb-coupon-wallet">
        <div className="xlb-coupon-wallet__boundary">
          <Boundary state={couponState} />
        </div>
      </main>
    );
  }
  const props = couponState.data!;
  return (
    <main className="xlb-coupon-wallet">
      {renderRegistered("header", props)}
      {renderRegistered("capability-notice", props)}
      {renderRegistered("status-filters", props)}
      {renderRegistered("decision-feedback", props)}
      {renderRegistered("grant-list", props)}
    </main>
  );
}
