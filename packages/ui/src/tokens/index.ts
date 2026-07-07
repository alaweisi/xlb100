import { baseTokens } from "./base/defaultTokens.js";

/** Phase 1+ design tokens */
export const tokens = {
  brand: "XLB",
  colors: {
    primary: "#2563eb",
    background: "#ffffff",
    text: "#111827",
  },
  spacing: {
    sm: "8px",
    md: "16px",
    lg: "24px",
  },
} as const;

export { baseTokens };
export { createThemeStyle, ThemeProvider } from "./ThemeProvider.js";
export {
  defaultThemeId,
  mergeThemeTokens,
  resolveThemeTokens,
  themeRegistry,
} from "./themeRegistry.js";
export type {
  RegisteredThemeId,
  ThemeDefinition,
  ThemeProviderProps,
  ThemeTokenOverrides,
  ThemeTokenPrimitive,
  ThemeTokens,
  ThemeTokenTree,
} from "./tokenTypes.js";
