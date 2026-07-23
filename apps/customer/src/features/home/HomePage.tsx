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
import type { CustomerHomeTelemetry } from "./homeTelemetry.js";

type HomeLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly delivery: ReadyHomeManifestLoadResult;
      readonly composition: HomeCompositionResult;
      readonly data: HomeDataBatchResult;
    };

export interface HomePageProps {
  readonly telemetry: CustomerHomeTelemetry;
}

export function HomePage({ telemetry }: HomePageProps) {
  const context = useMemo(resolveCustomerHomeRuntimeContext, []);
  const runtime = useMemo(
    () => createCustomerHomeRuntime(context, telemetry),
    [context, telemetry],
  );
  const engine = useMemo(
    () => new HomeCompositionEngine(createHomeComponentRegistry(), runtime.actionRegistry),
    [runtime.actionRegistry],
  );
  const [state, setState] = useState<HomeLoadState>({ status: "loading" });
  const sequence = useRef(0);

  const load = useCallback(async (forceRefresh = false) => {
    const current = ++sequence.current;
    setState({ status: "loading" });
    telemetry.recordManifestLoadStarted(forceRefresh);
    try {
      const deliverySpan = telemetry.beginSpan("manifest_fetch_ms");
      const delivered = await runtime.delivery.load({
          pageId: "customer.home",
          cityCode: context.cityCode,
          locale: context.locale,
          appVersion: context.appVersion,
          forceRefresh,
        }).catch((error: unknown) => {
          deliverySpan.finish("failed");
          throw error;
        });
      telemetry.recordDelivery(delivered);
      deliverySpan.finish(
        delivered.status === "superseded"
          ? "cancelled"
          : delivered.source === "last-known-good" || delivered.source === "builtin"
            ? "fallback"
            : "succeeded",
      );
      if (current !== sequence.current || delivered.status === "superseded") return;

      const compositionSpan = telemetry.beginSpan("composition_ms");
      const composition = engine.compose(delivered.manifest);
      telemetry.recordComposition(composition);
      compositionSpan.finish(
        composition.status === "ready"
          ? "succeeded"
          : composition.status === "degraded"
            ? "fallback"
            : "rejected",
      );

      const dataSpan = telemetry.beginSpan("data_load_ms");
      const data = await runtime.dataCoordinator.load({
          requestId: crypto.randomUUID(),
          cityCode: context.cityCode,
          locale: context.locale,
          cacheScopeKey: context.cacheScopeKey,
          dataSources: manifestDataSources(composition.nodes),
        }).catch((error: unknown) => {
          dataSpan.finish("failed");
          throw error;
        });
      telemetry.recordDataBatch(data);
      dataSpan.finish(
        data.state === "ready" || data.state === "empty"
          ? "succeeded"
          : data.state === "partial"
            ? "fallback"
            : data.state === "cancelled"
              ? "cancelled"
              : "failed",
      );
      if (current !== sequence.current) return;
      setState({ status: "ready", delivery: delivered, composition, data });
    } catch (error) {
      if (current !== sequence.current) return;
      telemetry.recordRuntimeError(error, "home_load", true);
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "主页加载失败",
      });
    }
  }, [context, engine, runtime, telemetry]);

  const observeComponent = useCallback(
    (node: Parameters<CustomerHomeTelemetry["observeComponent"]>[0], element: Element) =>
      telemetry.observeComponent(node, element),
    [telemetry],
  );
  const onComponentError = useCallback(
    (failure: Parameters<CustomerHomeTelemetry["recordSlotError"]>[0]) =>
      telemetry.recordSlotError(failure),
    [telemetry],
  );

  useEffect(() => {
    telemetry.startPageView();
    void load();
    return () => {
      sequence.current += 1;
      runtime.delivery.dispose();
    };
  }, [load, runtime, telemetry]);

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
        observeComponent={observeComponent}
        onComponentError={onComponentError}
      />
    </main>
  );
}
