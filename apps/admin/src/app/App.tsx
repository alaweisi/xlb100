import type { AppType } from "@xlb/types";
import { tokens } from "@xlb/ui";

const appType: AppType = "admin";

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
      <h1 style={{ color: tokens.colors.primary }}>喜乐帮 · A端 Admin · Phase 0 Ready</h1>
      <p>appType: {appType}</p>
    </main>
  );
}
