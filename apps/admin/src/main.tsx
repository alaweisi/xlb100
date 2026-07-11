import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "@xlb/ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<main aria-busy="true">正在加载管理页面…</main>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
);
