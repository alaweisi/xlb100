import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import "./app/mobile-shell.css";
import "./app/customer-ui-system.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider className="customer-theme-root">
      <AppErrorBoundary>
        <Suspense fallback={<main aria-busy="true">正在加载页面…</main>}>
          <App />
        </Suspense>
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
