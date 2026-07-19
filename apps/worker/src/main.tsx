import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import "./app/worker-shell.css";

const App = lazy(() => import("./app/App").then((module) => ({ default: module.App })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider themeId="default" className="xlb-worker-theme">
    <AppErrorBoundary>
      <Suspense fallback={<main aria-busy="true">正在加载师傅端…</main>}>
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
