import { baseTokens } from "./base/defaultTokens.js";

/** Phase 1+ design tokens */
export const tokens = {
  brand: "XLB",
  colors: {
    primary: baseTokens.color.brand,
    background: baseTokens.surface.panel,
    text: baseTokens.text.primary,
  },
  spacing: {
    sm: baseTokens.spacing.sm,
    md: baseTokens.spacing.md,
    lg: baseTokens.spacing.lg,
  },
} as const;

export { baseTokens, CANONICAL_TOKEN_SOURCE, TOKEN_SCHEMA_VERSION } from "./base/defaultTokens.js";
export { createThemeStyle, ThemeProvider } from "./ThemeProvider.js";
export { resolveRuntimeTheme, RuntimeThemeBridge } from "./runtimeThemeResolver.js";
export {
  ALLOWED_CAMPAIGN_TOKEN_PATHS,
  defaultThemeId,
  isProtectedThemeTokenPath,
  mergeCampaignThemeTokens,
  mergeThemeTokens,
  PROTECTED_THEME_TOKEN_PATHS,
  resolveRegisteredThemeId,
  resolveTheme,
  resolveThemeTokens,
  themeRegistry,
} from "./themeRegistry.js";
export {
  defaultThemeTokens,
  double11ThemeTokens,
  modeThemeDefinitions,
  roleThemeDefinitions,
  springFestivalThemeTokens,
  TOKEN_LAYER_TAXONOMY,
} from "./themes/themeDefinitions.js";
export { customerLiquidGlassMaterialRecipe } from "./recipes/customerMaterialRecipe.js";
export {
  adminDenseOperationsRecipe,
  dashboardReadinessRecipe,
  oaReadinessRecipe,
  roleMaterialRecipes,
  workerOperationalDarkRecipe,
} from "./recipes/roleMaterialRecipes.js";
export {
  forcedColorsCapabilityRecipe,
  lowPowerCapabilityRecipe,
  noBackdropFilterCapabilityRecipe,
  reducedMotionCapabilityRecipe,
  runtimeCapabilityRecipes,
} from "./recipes/runtimeCapabilityRecipes.js";
export type {
  AllowedCampaignTokenOverrides,
  AllowedCampaignTokenPath,
  ProtectedThemeTokenPath,
} from "./themeRegistry.js";
export type {
  CampaignThemeMergeResult,
  RegisteredThemeId,
  ResolvedTheme,
  ThemeDefinition,
  ThemeMode,
  ThemeModeDefinition,
  MaterialCapability,
  MaterialDensity,
  MaterialRecipe,
  MaterialRecipeId,
  RuntimeCapabilityRecipe,
  RuntimeCapabilityRecipeId,
  RuntimeThemeCapabilities,
  RuntimeThemeScope,
  ThemeProviderProps,
  ThemeRole,
  ThemeRoleDefinition,
  ThemeTokenLayerDefinition,
  ThemeTokenLayerId,
  ThemeTokenOverrides,
  ThemeTokenPrimitive,
  ThemeTokens,
  ThemeTokenTree,
} from "./tokenTypes.js";
export type {
  ResolvedRuntimeTheme,
  RuntimeThemeFallbackReason,
  RuntimeThemeLoader,
  RuntimeThemeLoadResult,
  RuntimeThemeEnvelopeValidator,
} from "./runtimeThemeResolver.js";
