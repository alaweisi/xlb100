import type { ThemeTokenOverrides } from "../tokenTypes.js";

export const defaultThemeTokens = {
  surface: {
    page: "#f8fafc",
    panel: "#ffffff",
    muted: "#f3f4f6",
    elevated: "#ffffff",
  },
  color: {
    brand: "#2563eb",
    brandContrast: "#ffffff",
    accent: "#b85f2a",
  },
  border: {
    subtle: "#e5e7eb",
    strong: "#d1d5db",
    focus: "#2563eb",
  },
} as const satisfies ThemeTokenOverrides;

export const springFestivalThemeTokens = {
  surface: {
    page: "#fff7ed",
    panel: "#ffffff",
    muted: "#ffedd5",
    elevated: "#fffaf4",
  },
  color: {
    brand: "#b91c1c",
    brandContrast: "#ffffff",
    accent: "#c2410c",
  },
  border: {
    subtle: "#fed7aa",
    strong: "#fdba74",
    focus: "#b91c1c",
  },
  shadow: {
    md: "0 12px 28px rgba(185, 28, 28, 0.10)",
  },
} as const satisfies ThemeTokenOverrides;

export const double11ThemeTokens = {
  surface: {
    page: "#faf5ff",
    panel: "#ffffff",
    muted: "#f3e8ff",
    elevated: "#fdfcff",
  },
  color: {
    brand: "#7c3aed",
    brandContrast: "#ffffff",
    accent: "#db2777",
  },
  border: {
    subtle: "#ddd6fe",
    strong: "#c4b5fd",
    focus: "#7c3aed",
  },
  shadow: {
    md: "0 12px 28px rgba(124, 58, 237, 0.10)",
  },
} as const satisfies ThemeTokenOverrides;
