import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import "./app/admin-shell.css";
import "./app/mobile-tables.css";
import { observeAdminMobileTables } from "./app/mobile-table-labels";

observeAdminMobileTables(document);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider themeId="default" className="xlb-admin-theme">
    <AppErrorBoundary>
      <Suspense fallback={<main aria-busy="true">正在加载管理页面…</main>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
