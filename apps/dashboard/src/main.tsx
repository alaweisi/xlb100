import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import { App } from "./App";
import "./wallboard.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider themeId="default" className="xlb-dashboard-theme">
      <AppErrorBoundary><App /></AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
