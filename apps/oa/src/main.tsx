import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary, ThemeProvider } from "@xlb/ui";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider themeId="default" className="oa-theme">
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
