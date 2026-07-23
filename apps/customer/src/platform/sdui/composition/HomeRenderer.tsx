import {
  Component,
  useEffect,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  HomeComponentRenderError,
  HomeCompositionNode,
  HomeCompositionResult,
  HomeRuntimeBindingsResolver,
} from "./homeCompositionTypes.js";

const EMPTY_BINDINGS = Object.freeze({
  data: Object.freeze({}),
  actions: Object.freeze({}),
});

export interface HomeRendererProps {
  readonly composition: HomeCompositionResult;
  readonly resolveBindings?: HomeRuntimeBindingsResolver;
  readonly renderPageFallback?: (composition: HomeCompositionResult) => ReactNode;
  readonly renderComponentFallback?: (failure: HomeComponentRenderError) => ReactNode;
  readonly onComponentError?: (failure: HomeComponentRenderError) => void;
  readonly observeComponent?: (
    node: HomeCompositionNode,
    element: Element,
  ) => void | (() => void);
}

interface ErrorBoundaryProps {
  readonly node: HomeCompositionNode;
  readonly children: ReactNode;
  readonly renderFallback?: HomeRendererProps["renderComponentFallback"];
  readonly onError?: HomeRendererProps["onComponentError"];
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

class HomeComponentErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    try {
      this.props.onError?.({ node: this.props.node, error });
    } catch {
      // Telemetry/diagnostic callbacks are deliberately non-blocking.
    }
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    const failure = { node: this.props.node, error: this.state.error };
    return this.props.renderFallback?.(failure) ?? (
      <CustomerStatePanel
        kind="error"
        title="此内容暂时不可用"
        description="其他内容仍可继续浏览。"
      />
    );
  }
}

function HomeComponentHost({
  node,
  resolveBindings,
}: {
  readonly node: HomeCompositionNode;
  readonly resolveBindings?: HomeRuntimeBindingsResolver;
}) {
  const bindings = resolveBindings?.(node) ?? EMPTY_BINDINGS;
  const RegisteredComponent = node.definition.component;
  return (
    <RegisteredComponent
      instance={node.instance}
      data={bindings.data}
      actions={bindings.actions}
    />
  );
}

/** Renders only a capability-checked composition result with instance isolation. */
export function HomeRenderer({
  composition,
  resolveBindings,
  renderPageFallback,
  renderComponentFallback,
  onComponentError,
  observeComponent,
}: HomeRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (composition.status === "rejected" || observeComponent === undefined) return;
    const root = rootRef.current;
    if (root === null) return;
    const cleanups = composition.nodes.flatMap((node, index) => {
      const element = root.children.item(index);
      if (element === null) return [];
      const cleanup = observeComponent(node, element);
      return typeof cleanup === "function" ? [cleanup] : [];
    });
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [composition, observeComponent]);

  if (composition.status === "rejected") {
    return renderPageFallback?.(composition) ?? (
      <CustomerStatePanel
        kind="error"
        title="主页暂时无法加载"
        description="请稍后重试。"
      />
    );
  }

  return (
    <div
      ref={rootRef}
      data-customer-sdui-page={composition.pageId}
      data-manifest-id={composition.manifestId}
      data-manifest-revision={composition.revision}
      data-composition-status={composition.status}
    >
      {composition.nodes.map((node) => (
        <HomeComponentErrorBoundary
          key={`${composition.revision}:${node.instance.id}:${node.instance.type}`}
          node={node}
          renderFallback={renderComponentFallback}
          onError={onComponentError}
        >
          <HomeComponentHost node={node} resolveBindings={resolveBindings} />
        </HomeComponentErrorBoundary>
      ))}
    </div>
  );
}
