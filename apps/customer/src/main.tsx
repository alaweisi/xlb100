import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import "./app/mobile-shell.css";

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

if ("serviceWorker" in navigator && (window.location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(window.location.hostname))) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js", { scope: "./" });
  });
}
