import type { ThemeTokenOverrides } from "@xlb/ui";

/**
 * Customer-only visual layer derived from the approved homepage PNG.
 * It is intentionally scoped away from Worker/Admin/OA/Dashboard themes.
 */
export const customerThemeTokens = {
  color: {
    brand: "#0F9F9C",
    brandContrast: "#FFFFFF",
    accent: "#FF6A00",
    neutral: "#587171",
    info: "#0F8F91",
    success: "#148A67",
    warning: "#C75B00",
    danger: "#B83A3A",
  },
  surface: {
    page: "#CFEFEF",
    panel: "#FFFFFF",
    glass: "rgba(255, 255, 255, 0.78)",
    muted: "rgba(255, 255, 255, 0.54)",
    elevated: "#FFFFFF",
    overlay: "rgba(255, 255, 255, 0.94)",
    scrim: "rgba(31, 45, 45, 0.38)",
  },
  text: {
    primary: "#1F2D2D",
    secondary: "#496161",
    muted: "#718282",
    inverse: "#FFFFFF",
    link: "#087F80",
  },
  border: {
    subtle: "rgba(31, 45, 45, 0.08)",
    strong: "rgba(31, 45, 45, 0.18)",
    focus: "#FF6A00",
    glassHighlight: "rgba(255, 255, 255, 0.94)",
    glassInner: "rgba(255, 255, 255, 0.48)",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
    pill: "999px",
  },
  shadow: {
    sm: "0 2px 10px rgba(31, 45, 45, 0.06)",
    md: "0 12px 32px rgba(31, 45, 45, 0.10)",
    lg: "0 24px 64px rgba(31, 45, 45, 0.14)",
    focus: "0 0 0 3px rgba(255, 106, 0, 0.28)",
    ambient: "0 18px 52px rgba(31, 45, 45, 0.12)",
  },
  spacing: {
    none: "0",
    xxs: "2px",
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
  },
  size: {
    controlSm: "36px",
    controlMd: "44px",
    controlLg: "52px",
    touchTarget: "44px",
    bottomNavigation: "88px",
  },
  font: {
    family: "PingFang SC, Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    familySans: "PingFang SC, Noto Sans SC, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    size: {
      xs: "11px",
      sm: "12px",
      md: "14px",
      lg: "16px",
      xl: "20px",
      display: "32px",
    },
    weight: {
      regular: 400,
      medium: 500,
      bold: 700,
    },
    lineHeight: {
      tight: "20px",
      normal: "24px",
      loose: "28px",
      display: "40px",
    },
  },
  customer: {
    color: {
      background: "#CFEFEF",
      action: "#FF6A00",
      ink: "#1F2D2D",
      serviceIconSurface: "#FFFFFF",
      pageGlow: "rgba(255, 255, 255, 0.42)",
      actionSoft: "rgba(255, 106, 0, 0.10)",
      brandSoft: "rgba(15, 159, 156, 0.12)",
      navigationInactive: "#617171",
      assetFallback: "#E7F5F4",
    },
    glass: {
      surface: "rgba(255, 255, 255, 0.78)",
      border: "rgba(255, 255, 255, 0.88)",
    },
    shadow: {
      card: "0 8px 24px rgba(31, 45, 45, 0.08)",
      navigation: "0 -10px 30px rgba(31, 45, 45, 0.10)",
    },
  },
} as const satisfies ThemeTokenOverrides;
