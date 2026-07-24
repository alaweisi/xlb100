import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "@xlb/ui";
import "@xlb/customer-components/styles.css";
import "@xlb/customer-components/home.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if ("serviceWorker" in navigator && (window.location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(window.location.hostname))) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("../sw.js", import.meta.url);
    const serviceWorkerScope = new URL("../", import.meta.url).pathname;
    void navigator.serviceWorker.register(serviceWorkerUrl.href, { scope: serviceWorkerScope });
  });
}
