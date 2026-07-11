import { Component, type ErrorInfo, type ReactNode } from "react";

export interface AppErrorBoundaryFallbackProps {
  error: Error;
  reset: () => void;
}

export interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: AppErrorBoundaryFallbackProps) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return this.props.fallback({ error, reset: this.reset });
    }
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <main
        role="alert"
        style={{
          alignContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          display: "grid",
          gap: 12,
          justifyItems: "center",
          minHeight: "100vh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>页面暂时无法显示</h1>
        <p style={{ color: "#475569", margin: 0 }}>请重试；如果问题持续，请稍后重新打开应用。</p>
        <button
          onClick={this.reset}
          style={{
            background: "#0f172a",
            border: 0,
            borderRadius: 8,
            color: "#ffffff",
            cursor: "pointer",
            font: "inherit",
            padding: "10px 16px",
          }}
          type="button"
        >
          重试
        </button>
      </main>
    );
  }
}
