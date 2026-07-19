import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App as AdminOperationsApp } from "@xlb/admin/App";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import "@xlb/admin/styles";
import "./oa-shell.css";

document.documentElement.dataset.xlbSurface = "oa";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider themeId="default" className="xlb-oa-theme">
      <AppErrorBoundary>
        <div className="oa-app-root">
          <div className="oa-authority-banner" role="status">
            <strong>总部 OA 总后台</strong>
            <span>独立 OA 身份 · 总部全局授权 · 操作始终绑定明确城市并记录审计</span>
          </div>
          <Suspense fallback={<main className="oa-loading" aria-busy="true">正在加载 OA 总后台…</main>}>
            <AdminOperationsApp surface="oa" />
          </Suspense>
        </div>
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
