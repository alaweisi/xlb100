import type { ThemeTokens } from "../tokenTypes.js";

export const baseTokens = {
  color: {
    brand: "#2563eb",
    brandContrast: "#ffffff",
    accent: "#b85f2a",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#dc2626",
  },
  surface: {
    page: "#f8fafc",
    panel: "#ffffff",
    muted: "#f3f4f6",
    elevated: "#ffffff",
  },
  text: {
    primary: "#111827",
    secondary: "#4b5563",
    muted: "#6b7280",
    inverse: "#ffffff",
  },
  border: {
    subtle: "#e5e7eb",
    strong: "#d1d5db",
    focus: "#2563eb",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "16px",
    pill: "999px",
  },
  shadow: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
    md: "0 12px 28px rgba(15, 23, 42, 0.10)",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
  },
  font: {
    family: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    size: {
      sm: "12px",
      md: "14px",
      lg: "16px",
      xl: "20px",
    },
    weight: {
      regular: 400,
      medium: 600,
      bold: 700,
    },
    lineHeight: {
      tight: "20px",
      normal: "24px",
      loose: "30px",
    },
  },
} as const satisfies ThemeTokens;
