import type { AppType } from "@xlb/types";
import { tokens } from "@xlb/ui";

const appType: AppType = "customer";

export function App() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: tokens.spacing.lg,
        color: tokens.colors.text,
        background: tokens.colors.background,
      }}
    >
      <h1 style={{ color: tokens.colors.primary }}>喜乐帮 · C端 Customer · Phase 0 Ready</h1>
      <p>appType: {appType}</p>
    </main>
  );
}
