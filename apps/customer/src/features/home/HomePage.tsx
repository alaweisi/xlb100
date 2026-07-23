import { CustomerStatePanel } from "@xlb/customer-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HomeCompositionEngine,
  HomeRenderer,
  type HomeCompositionResult,
} from "../../platform/sdui/composition/index.js";
import type { HomeDataBatchResult } from "../../platform/sdui/data/index.js";
import type { ReadyHomeManifestLoadResult } from "../../platform/sdui/delivery/index.js";
import { createHomeComponentRegistry } from "./createHomeComponentRegistry.js";
import {
  createCustomerHomeRuntime,
  createHomeRuntimeBindingsResolver,
  manifestDataSources,
  resolveCustomerHomeRuntimeContext,
} from "./homeRuntime.js";

type HomeLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly delivery: ReadyHomeManifestLoadResult;
      readonly composition: HomeCompositionResult;
      readonly data: HomeDataBatchResult;
    };

export function HomePage() {
  const context = useMemo(resolveCustomerHomeRuntimeContext, []);
  const runtime = useMemo(() => createCustomerHomeRuntime(context), [context]);
  const engine = useMemo(
    () => new HomeCompositionEngine(createHomeComponentRegistry(), runtime.actionRegistry),
    [runtime.actionRegistry],
  );
  const [state, setState] = useState<HomeLoadState>({ status: "loading" });
  const sequence = useRef(0);

  const load = useCallback(async (forceRefresh = false) => {
    const current = ++sequence.current;
    setState({ status: "loading" });
    try {
      const delivered = await runtime.delivery.load({
        pageId: "customer.home",
        cityCode: context.cityCode,
        locale: context.locale,
        appVersion: context.appVersion,
        forceRefresh,
      });
      if (current !== sequence.current || delivered.status === "superseded") return;
      const composition = engine.compose(delivered.manifest);
      const data = await runtime.dataCoordinator.load({
        requestId: crypto.randomUUID(),
        cityCode: context.cityCode,
        locale: context.locale,
        cacheScopeKey: context.cacheScopeKey,
        dataSources: manifestDataSources(composition.nodes),
      });
      if (current !== sequence.current) return;
      setState({ status: "ready", delivery: delivered, composition, data });
    } catch (error) {
      if (current !== sequence.current) return;
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "主页加载失败",
      });
    }
  }, [context, engine, runtime]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
      runtime.delivery.dispose();
    };
  }, [load, runtime]);

  if (state.status === "loading") {
    return (
      <main className="xlb-home-shell" aria-busy="true" aria-label="主页正在加载">
        <div className="xlb-home-loading" role="status">
          <span />
          <span />
          <span />
          <p>正在为你准备服务</p>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="xlb-home-shell">
        <CustomerStatePanel
          kind="error"
          title="主页暂时无法加载"
          description={state.message}
          actionLabel="重试"
          onAction={() => void load(true)}
        />
      </main>
    );
  }

  const isOffline = state.delivery.reason.startsWith("offline");
  const hasStaleData = Object.values(state.data.results).some((result) => result.state === "stale");
  const bindings = createHomeRuntimeBindingsResolver(state.data, runtime.actionRegistry);

  return (
    <main
      className="xlb-home-shell"
      data-home-delivery-source={state.delivery.source}
      data-home-delivery-reason={state.delivery.reason}
      data-home-data-state={state.data.state}
    >
      {(isOffline || hasStaleData || state.delivery.reason === "kill-switch") ? (
        <div className="xlb-home-runtime-notice" role="status">
          {state.delivery.reason === "kill-switch"
            ? "主页动态配置已安全关闭，当前展示内置服务入口"
            : isOffline
              ? "当前网络不可用，正在展示最近可用内容"
              : "部分服务数据正在更新，已展示最近可用内容"}
          <button type="button" onClick={() => void load(true)}>重试</button>
        </div>
      ) : null}
      <HomeRenderer
        composition={state.composition}
        resolveBindings={bindings}
        renderPageFallback={() => (
          <CustomerStatePanel
            kind="error"
            title="主页配置暂时不可用"
            description="安全入口仍在，稍后可重试加载。"
            actionLabel="重新加载"
            onAction={() => void load(true)}
          />
        )}
      />
    </main>
  );
}
