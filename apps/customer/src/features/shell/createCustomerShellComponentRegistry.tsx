import {
  BrandLogo,
  CustomerComponentRegistry,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type { ReactNode } from "react";
import type { CustomerAppShellActionController } from "./CustomerAppShellActionController.js";
import type { CustomerAppShellState } from "./CustomerAppShellCoordinator.js";

export type CustomerShellComponentType =
  | "shell-brand"
  | "shell-status"
  | "shell-outlet";

export interface CustomerShellComponentProps {
  readonly view: CustomerAppShellState;
  readonly actions: CustomerAppShellActionController;
  readonly children?: ReactNode;
}

function ShellBrand(_props: CustomerShellComponentProps) {
  return (
    <header className="xlb-entry-brand">
      <BrandLogo variant="compact" />
      <span>安心到家，服务有据</span>
    </header>
  );
}

function ShellStatus({ view, actions }: CustomerShellComponentProps) {
  if (view.status === "ready") {
    return (
      <div className="xlb-entry-announcer" aria-live="polite" aria-atomic="true">
        {view.sessionStatus === "expired" ? "登录已失效，请重新登录。" : ""}
      </div>
    );
  }
  if (view.status === "error") {
    return (
      <CustomerStatePanel
        kind="error"
        title="应用入口暂时无法恢复"
        description="你的输入没有丢失，请重试恢复安全会话。"
        actionLabel="重新加载"
        onAction={() => void actions.retry()}
      />
    );
  }
  return (
    <CustomerStatePanel
      kind="loading"
      title={view.status === "clearing-session" ? "正在安全退出" : "正在恢复应用"}
      description="正在检查会话与服务城市。"
    />
  );
}

function ShellOutlet({ view, children }: CustomerShellComponentProps) {
  return view.status === "ready" ? <>{children}</> : null;
}

export function createCustomerShellComponentRegistry() {
  return new CustomerComponentRegistry<CustomerShellComponentType, CustomerShellComponentProps>()
    .register("shell-brand", ShellBrand)
    .register("shell-status", ShellStatus)
    .register("shell-outlet", ShellOutlet);
}

export const CUSTOMER_SHELL_COMPONENT_PLAN: readonly CustomerShellComponentType[] =
  Object.freeze(["shell-brand", "shell-status", "shell-outlet"]);
