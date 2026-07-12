import type {
  ThemeMode,
  ThemeModeDefinition,
  ThemeRole,
  ThemeRoleDefinition,
  ThemeTokenLayerDefinition,
  ThemeTokenOverrides,
} from "../tokenTypes.js";

export const TOKEN_LAYER_TAXONOMY = [
  { id: "L0", name: "foundation", owner: "ui", mayOverrideProtectedSemantics: true },
  { id: "L1", name: "semantic", owner: "ui", mayOverrideProtectedSemantics: true },
  { id: "L2", name: "role", owner: "resolver", mayOverrideProtectedSemantics: false },
  { id: "L3", name: "mode", owner: "resolver", mayOverrideProtectedSemantics: false },
  { id: "L4", name: "campaign", owner: "campaign-bridge", mayOverrideProtectedSemantics: false },
  { id: "L5", name: "component", owner: "component", mayOverrideProtectedSemantics: false },
  { id: "L6", name: "state", owner: "component", mayOverrideProtectedSemantics: false },
  { id: "L7", name: "accessibility-runtime", owner: "runtime", mayOverrideProtectedSemantics: true },
] as const satisfies readonly ThemeTokenLayerDefinition[];

export const roleThemeDefinitions: Readonly<Record<ThemeRole, ThemeRoleDefinition>> = {
  customer: { id: "customer", label: "Customer" },
  worker: { id: "worker", label: "Worker" },
  admin: { id: "admin", label: "Admin" },
  oa: { id: "oa", label: "OA" },
  dashboard: { id: "dashboard", label: "Dashboard" },
};

export const modeThemeDefinitions: Readonly<Record<ThemeMode, ThemeModeDefinition>> = {
  light: { id: "light", label: "Light" },
  dark: { id: "dark", label: "Dark" },
  "high-contrast": { id: "high-contrast", label: "High Contrast" },
  "large-display": { id: "large-display", label: "Large Display" },
};

/** The default theme is exactly the canonical base tree, not a second copy. */
export const defaultThemeTokens = {} as const satisfies ThemeTokenOverrides;

export const springFestivalThemeTokens = {
  campaign: {
    accent: "#c2410c",
    ambient: "#fff1e6",
    banner: { background: "#fff1e6", text: "#7f1d1d" },
    badge: { background: "#b91c1c", text: "#ffffff" },
    decoration: { opacity: 1, intensity: 1 },
    navigation: { accent: "#c2410c" },
  },
} as const satisfies ThemeTokenOverrides;

export const double11ThemeTokens = {
  campaign: {
    accent: "#db2777",
    ambient: "#f3e8ff",
    banner: { background: "#f3e8ff", text: "#581c87" },
    badge: { background: "#7c3aed", text: "#ffffff" },
    decoration: { opacity: 1, intensity: 1 },
    navigation: { accent: "#db2777" },
  },
} as const satisfies ThemeTokenOverrides;
