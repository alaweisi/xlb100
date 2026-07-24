import { BrandLogo, CustomerStatePanel } from "@xlb/customer-components";
import { useEffect, useMemo, useState } from "react";
import { CustomerAppShellTemplate } from "../features/shell/CustomerAppShellTemplate.js";
import { customerAppShellSlice } from "../features/shell/customerEntryFeatureRouteModule.js";
import type { CustomerSliceState, CustomerTemplateRouteContext } from "../platform/slices/index.js";
import { CustomerAppRouterRuntime, type CustomerAppRouterState } from "./CustomerAppRouterRuntime.js";
import "./customer-app-router.css";

const SHELL_STATE: CustomerSliceState<null> = Object.freeze({
  status: "ready",
  data: null,
});

function routeContext(state: CustomerAppRouterState): CustomerTemplateRouteContext {
  if ("match" in state && state.match !== null) return state.match.route;
  return Object.freeze({
    pathname: typeof window === "undefined" ? "/" : window.location.pathname,
    pattern: "/",
    params: Object.freeze({}),
    query: Object.freeze({}),
  });
}

function RouterOutlet({
  state,
  retry,
}: {
  readonly state: CustomerAppRouterState;
  readonly retry: () => void;
}) {
  if (state.status === "ready") {
    const RouteComponent = state.RouteComponent;
    return (
      <RouteComponent
        slice={state.match.published.registration.slice}
        route={state.match.route}
      />
    );
  }
  if (state.status === "loading") {
    return (
      <section className="xlb-customer-router-state">
        <BrandLogo variant="compact" />
        <CustomerStatePanel
          kind="loading"
          title="正在打开页面"
          description="正在加载已发布的安全页面。"
        />
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="xlb-customer-router-state">
        <BrandLogo variant="compact" />
        <CustomerStatePanel
          kind="error"
          title="页面暂时无法加载"
          description="没有业务数据被替代，你可以安全重试。"
          actionLabel="重试"
          onAction={retry}
        />
      </section>
    );
  }
  if (state.status === "denied") {
    return (
      <section className="xlb-customer-router-state">
        <BrandLogo variant="compact" />
        <CustomerStatePanel
          kind="error"
          title="无法打开此页面"
          description="请返回安全入口后重试。"
        />
      </section>
    );
  }
  return (
    <section className="xlb-customer-router-state" data-route-not-found="true">
      <BrandLogo variant="compact" />
      <CustomerStatePanel
        kind="empty"
        title="页面不存在"
        description="该地址没有对应的已发布页面。"
      />
    </section>
  );
}

export function CustomerAppRouter() {
  const runtime = useMemo(() => new CustomerAppRouterRuntime(), []);
  const [routerState, setRouterState] = useState(runtime.snapshot());
  const [shellView, setShellView] = useState(runtime.entry.shell.snapshot());

  useEffect(() => {
    const unsubscribeRouter = runtime.subscribe(setRouterState);
    const unsubscribeShell = runtime.entry.shell.subscribe(setShellView);
    runtime.start();
    return () => {
      runtime.stop();
      unsubscribeRouter();
      unsubscribeShell();
    };
  }, [runtime]);

  return (
    <CustomerAppShellTemplate
      slice={customerAppShellSlice}
      route={routeContext(routerState)}
      state={SHELL_STATE}
      runtime={{
        view: shellView,
        actions: runtime.entry.actions,
        children: <RouterOutlet state={routerState} retry={() => runtime.retry()} />,
      }}
    />
  );
}
