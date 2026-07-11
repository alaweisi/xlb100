import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "@xlb/ui";

const App = lazy(() => import("./app/App").then((module) => ({ default: module.App })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<main aria-busy="true">正在加载师傅端…</main>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
);
