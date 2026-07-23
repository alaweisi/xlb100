import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerAddressBoundaryRegistry,
  createCustomerAddressComponentRegistry,
  type CustomerAddressComponentType,
} from "./AddressComponentRegistry.js";
import type {
  CustomerAddressBookTemplateReadyData,
} from "./addressBookTypes.js";

type AddressTemplateState = CustomerSliceState<CustomerAddressBookTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function renderBoundaryHeader() {
  const Component = createCustomerAddressBoundaryRegistry().resolve("state-header");
  if (Component === null) throw new Error("Address boundary header is not registered");
  return <Component />;
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<AddressTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取地址簿"
          description="正在获取当前登录顾客、当前服务城市下的地址。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="还没有服务地址"
          description="新增地址后，可在下单时选择。"
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
          title="地址簿加载失败"
          description={state.retryable
            ? "网络或服务暂时异常，可以重试。"
            : "当前响应无法安全展示，请返回后重试。"}
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
          title="地址信息已变化"
          description="页面不会覆盖较新的服务端结果，请刷新地址簿后再操作。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="地址能力暂不可用"
          description="正式地址 API 当前不可用；页面不会用本地或演示数据替代。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
  }
}

function renderRegistered(
  type: CustomerAddressComponentType,
  props: CustomerAddressBookTemplateReadyData,
) {
  const Component = createCustomerAddressComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Address component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerAddressBookTemplate({
  state,
}: CustomerL1TemplateProps) {
  const addressState = state as AddressTemplateState;

  if (addressState.status !== "ready") {
    return (
      <main className="xlb-address-shell">
        {renderBoundaryHeader()}
        <div className="xlb-address-state">
          <StateBoundary state={addressState} />
        </div>
      </main>
    );
  }

  const props = addressState.data;
  return (
    <main className="xlb-address-shell">
      {renderRegistered("header", props)}
      {renderRegistered("feedback", props)}
      {renderRegistered("city-scope", props)}
      {props.viewModel.view === "list"
        ? renderRegistered("address-list", props)
        : renderRegistered("address-form", props)}
      {renderRegistered("delete-confirmation", props)}
    </main>
  );
}
