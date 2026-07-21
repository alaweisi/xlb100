import type { ThemeTokens } from "../tokenTypes.js";

/** Marker consumed by the Phase 25 boundary gate. */
export const CANONICAL_TOKEN_SOURCE = "packages/ui/src/tokens/base/defaultTokens.ts" as const;
export const TOKEN_SCHEMA_VERSION = "25.4.0" as const;

/**
 * The single compiled L0/L1 source. JSON, CSS variables and Figma mappings must
 * be derived from this tree; they must never become independently edited input.
 */
export const baseTokens = {
  color: {
    brand: "#2563eb",
    brandContrast: "#ffffff",
    accent: "#e97116",
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
  spacing: { none: "0", xxs: "2px", xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", xxl: "48px" },
  size: { controlSm: "32px", controlMd: "44px", controlLg: "52px", touchTarget: "44px", bottomNavigation: "60px" },
  grid: { columnsCompact: 4, columnsWide: 12, gutterCompact: "16px", gutterWide: "24px", maxContent: "1200px" },
  breakpoint: { compact: "390px", medium: "768px", wide: "1280px", wallboard: "1920px" },
  safeArea: { top: "0px", right: "0px", bottom: "0px", left: "0px", bottomNavigation: "60px" },
  font: {
    family: "Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    familySans: "Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    familySerif: "Noto Serif SC, Songti SC, serif",
    familyMono: "JetBrains Mono, ui-monospace, SFMono-Regular, Consolas, monospace",
    numeric: "tabular-nums",
    size: { xs: "11px", sm: "12px", md: "14px", lg: "16px", xl: "20px", pageTitle: "28px", display: "32px" },
    weight: { regular: 400, medium: 600, bold: 700 },
    lineHeight: { tight: "20px", normal: "24px", loose: "30px", pageTitle: "38px", display: "40px" },
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
    accent: "#e97116",
    ambient: "#fff7ed",
    banner: { background: "#fff7ed", text: "#7c2d12" },
    badge: { background: "#c2410c", text: "#ffffff" },
    decoration: { opacity: 0, intensity: 0 },
    navigation: { accent: "#e97116" },
  },
  role: {
    customer: {
      accent: "#e97116", ink: "#18342d", cream: "#fefaf5", coffee: "#334155",
      ambient: "#f4e8db", glassTint: "rgba(254, 250, 245, 0.82)",
      component: {
        button: {
          primaryBackground: "#e97116", primaryText: "#ffffff",
          secondaryBackground: "#fffdfb", secondaryBorder: "#cdbb9f", secondaryText: "#334155",
          ghostText: "#18342d", dangerBackground: "#b91c1c", dangerText: "#ffffff",
          radius: "999px", minHeight: "44px", primaryMinHeight: "52px", paddingInline: "20px",
        },
        input: {
          background: "#fffdfb", border: "#cdbb9f", text: "#334155", placeholder: "#81766b",
          radius: "16px", minHeight: "48px", paddingInline: "16px",
        },
        card: {
          background: "#fffdfb", border: "#e8d9c3", text: "#334155", heading: "#18342d",
          radius: "24px", shadow: "0 12px 28px rgba(43, 33, 24, 0.10)", padding: "16px",
        },
        tabs: {
          background: "rgba(254, 250, 245, 0.82)", border: "#e8d9c3",
          activeBackground: "#fffdfb", activeText: "#18342d", inactiveText: "#665b50",
          radius: "999px", minHeight: "44px", gap: "4px",
        },
        state: {
          background: "#fffdfb", border: "#e8d9c3", text: "#334155", mutedText: "#665b50",
          infoBackground: "#eff6ff", infoText: "#1d4ed8",
          successBackground: "#ecfdf5", successText: "#047857",
          warningBackground: "#fff7ed", warningText: "#b45309",
          dangerBackground: "#fef2f2", dangerText: "#b91c1c",
          radius: "24px", padding: "24px",
        },
        overlay: {
          background: "rgba(255, 252, 247, 0.96)", fallbackBackground: "#fffdfb",
          border: "#e8d9c3", text: "#334155", scrim: "rgba(43, 33, 24, 0.42)",
          radius: "24px", shadow: "0 24px 54px rgba(43, 33, 24, 0.16)", blur: "18px",
        },
      },
    },
    worker: {
      accent: "#2f9bff", page: "#08172b", panel: "#203a5b", text: "#f8fbff", muted: "#b8c8dc",
    },
    admin: {
      accent: "#8554c7", page: "#191225", panel: "#382d46", text: "#fffaff", muted: "#cfc4db",
    },
  },
} as const satisfies ThemeTokens;
