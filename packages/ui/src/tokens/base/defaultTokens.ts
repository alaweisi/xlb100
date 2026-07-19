import type { ThemeTokens } from "../tokenTypes.js";

/** Marker consumed by the Phase 25 boundary gate. */
export const CANONICAL_TOKEN_SOURCE = "packages/ui/src/tokens/base/defaultTokens.ts" as const;
export const TOKEN_SCHEMA_VERSION = "25.3.0" as const;

/**
 * The single compiled L0/L1 source. JSON, CSS variables and Figma mappings must
 * be derived from this tree; they must never become independently edited input.
 */
export const baseTokens = {
  color: {
    brand: "#2563eb",
    brandContrast: "#ffffff",
    accent: "#b85f2a",
    neutral: "#64748b",
    info: "#2563eb",
    success: "#047857",
    warning: "#b45309",
    danger: "#b91c1c",
  },
  surface: {
    page: "#f8fafc",
    panel: "#ffffff",
    glass: "rgba(255, 255, 255, 0.72)",
    muted: "#f3f4f6",
    elevated: "#ffffff",
    overlay: "rgba(255, 255, 255, 0.92)",
    scrim: "rgba(15, 23, 42, 0.42)",
  },
  text: {
    primary: "#111827",
    secondary: "#4b5563",
    muted: "#6b7280",
    inverse: "#ffffff",
    link: "#1d4ed8",
    onDanger: "#ffffff",
    onWarning: "#111827",
    onSuccess: "#ffffff",
  },
  border: {
    subtle: "#e5e7eb",
    strong: "#d1d5db",
    focus: "#2563eb",
    glassHighlight: "rgba(255, 255, 255, 0.88)",
    glassInner: "rgba(255, 255, 255, 0.42)",
  },
  radius: { none: "0", sm: "6px", md: "8px", lg: "16px", xl: "24px", xxl: "28px", pill: "999px" },
  stroke: { hairline: "1px", regular: "2px", emphasis: "3px" },
  shadow: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
    md: "0 12px 28px rgba(15, 23, 42, 0.10)",
    lg: "0 24px 54px rgba(15, 23, 42, 0.16)",
    focus: "0 0 0 3px rgba(37, 99, 235, 0.32)",
    ambient: "0 20px 60px rgba(15, 23, 42, 0.12)",
  },
  /**
   * Canonical one-dimensional scale for component geometry that does not map
   * to spacing, control size, radius, stroke, or typography semantics.
   */
  dimension: {
    d1: "1px", d2: "2px", d3: "3px", d4: "4px", d5: "5px", d6: "6px",
    d8: "8px", d10: "10px", d11: "11px", d12: "12px", d13: "13px",
    d14: "14px", d15: "15px", d16: "16px", d17: "17px", d18: "18px",
    d19: "19px", d20: "20px", d21: "21px", d22: "22px", d24: "24px",
    d26: "26px", d28: "28px", d32: "32px", d36: "36px", d38: "38px",
    d42: "42px", d44: "44px", d48: "48px", d52: "52px", d58: "58px",
    d62: "62px", d66: "66px", d74: "74px", d76: "76px", d82: "82px",
    d92: "92px",
  },
  spacing: { none: "0", xxs: "2px", xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", xxl: "48px" },
  size: { controlSm: "32px", controlMd: "44px", controlLg: "52px", touchTarget: "44px", bottomNavigation: "92px" },
  grid: { columnsCompact: 4, columnsWide: 12, gutterCompact: "16px", gutterWide: "24px", maxContent: "1200px" },
  breakpoint: { compact: "390px", medium: "768px", wide: "1280px", wallboard: "1920px" },
  safeArea: { top: "0px", right: "0px", bottom: "0px", left: "0px", bottomNavigation: "92px" },
  font: {
    family: "Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    familySans: "Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    familySerif: "Noto Serif SC, Songti SC, serif",
    familyMono: "JetBrains Mono, ui-monospace, SFMono-Regular, Consolas, monospace",
    numeric: "tabular-nums",
    size: {
      xxs: "10px", xs: "11px", sm: "12px", compact: "13px", md: "14px",
      strong: "15px", lg: "16px", emphasis: "17px", xl: "20px",
      title: "26px", pageTitle: "28px", display: "32px",
    },
    weight: { regular: 400, medium: 600, bold: 700 },
    lineHeight: {
      micro: "16px", compact: "17px", caption: "18px", bodyCompact: "19px",
      tight: "20px", bodyDense: "21px", bodySmall: "22px", normal: "24px",
      loose: "30px", pageTitle: "38px", display: "40px",
    },
    letterSpacing: { tight: "-0.01em", normal: "0", wide: "0.04em" },
  },
  blur: { none: "0", sm: "8px", md: "18px", lg: "32px" },
  opacity: { disabled: 0.48, muted: 0.7, solid: 1 },
  zIndex: { base: 0, sticky: 100, overlay: 400, modal: 600, toast: 800 },
  motion: {
    duration: { instant: "0ms", fast: "120ms", normal: "220ms", slow: "360ms" },
    easing: { standard: "cubic-bezier(0.2, 0, 0, 1)", emphasized: "cubic-bezier(0.2, 0, 0, 1.2)" },
    distance: { none: "0", sm: "4px", md: "12px" },
  },
  icon: { sm: "16px", md: "20px", lg: "24px", stroke: "1.75px", opticalOffset: "0px" },
  state: {
    hoverOpacity: 0.92,
    pressedOpacity: 0.84,
    selectedRing: "#2563eb",
    disabledOpacity: 0.48,
    loading: "#64748b",
    success: "#047857",
    warning: "#b45309",
    error: "#b91c1c",
    stale: "#b45309",
  },
  chart: {
    series1: "#2563eb", series2: "#0891b2", series3: "#7c3aed", series4: "#c2410c",
    axis: "#475569", grid: "#cbd5e1", threshold: "#b91c1c", positive: "#047857", negative: "#b91c1c",
  },
  glass: {
    tint: "rgba(255, 255, 255, 0.72)", saturation: "140%", backdropBlur: "18px",
    edgeHighlight: "rgba(255, 255, 255, 0.88)", innerStroke: "rgba(255, 255, 255, 0.42)",
    ambientShadow: "0 20px 60px rgba(15, 23, 42, 0.12)",
  },
  campaign: {
    accent: "#b85f2a",
    ambient: "#fff7ed",
    banner: { background: "#fff7ed", text: "#7c2d12" },
    badge: { background: "#c2410c", text: "#ffffff" },
    decoration: { opacity: 0, intensity: 0 },
    navigation: { accent: "#b85f2a" },
  },
  role: {
    customer: {
      accent: "#b85f2a", ink: "#173f35", cream: "#fffaf0", coffee: "#2b2118",
      ambient: "#f6d9aa", glassTint: "rgba(255, 250, 240, 0.74)",
    },
    worker: {
      accent: "#2f9bff", page: "#08172b", panel: "#203a5b", text: "#f8fbff", muted: "#b8c8dc",
    },
    admin: {
      accent: "#8554c7", page: "#191225", panel: "#382d46", text: "#fffaff", muted: "#cfc4db",
    },
  },
} as const satisfies ThemeTokens;
