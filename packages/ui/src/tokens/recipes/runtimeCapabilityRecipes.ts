import type {
  RuntimeCapabilityRecipe,
  RuntimeCapabilityRecipeId,
} from "../tokenTypes.js";

const SHARED_RUNTIME_INVARIANTS = Object.freeze([
  "workflow-state-is-authoritative",
  "available-actions-and-disabled-reasons-are-unchanged",
  "permission-city-audit-and-idempotency-semantics-are-unchanged",
  "amount-currency-and-quote-semantics-are-unchanged",
  "focus-status-and-dashboard-alert-semantics-remain-protected",
] as const);

function defineCapabilityRecipe(
  recipe: RuntimeCapabilityRecipe,
): RuntimeCapabilityRecipe {
  return Object.freeze({
    ...recipe,
    overrideTokenRefs: Object.freeze({ ...recipe.overrideTokenRefs }),
    invariants: Object.freeze([...recipe.invariants]),
  });
}

/**
 * L7 recipes contain references to canonical tokens only. Resolution and
 * capability detection belong to Gate 1C; these declarations never inspect
 * browser, device, business, campaign, city, or user state.
 */
export const noBackdropFilterCapabilityRecipe = defineCapabilityRecipe({
  id: "no-backdrop-filter",
  trigger: "supports-not-backdrop-filter",
  overrideTokenRefs: {
    "surface.glass": "surface.panel",
    "glass.tint": "surface.panel",
    "glass.backdropBlur": "blur.none",
    "glass.edgeHighlight": "border.strong",
    "glass.innerStroke": "border.subtle",
    "glass.ambientShadow": "shadow.md",
  },
  invariants: [
    ...SHARED_RUNTIME_INVARIANTS,
    "glass-content-contrast-and-boundaries-remain-visible-without-blur",
  ],
});

export const forcedColorsCapabilityRecipe = defineCapabilityRecipe({
  id: "forced-colors",
  trigger: "media-forced-colors-active",
  overrideTokenRefs: {
    "surface.glass": "surface.panel",
    "glass.tint": "surface.panel",
    "glass.backdropBlur": "blur.none",
    "glass.edgeHighlight": "border.strong",
    "glass.innerStroke": "border.strong",
    "glass.ambientShadow": "shadow.sm",
    "campaign.accent": "text.link",
    "campaign.ambient": "surface.page",
    "campaign.banner.background": "surface.panel",
    "campaign.banner.text": "text.primary",
    "campaign.badge.background": "surface.panel",
    "campaign.badge.text": "text.primary",
    "campaign.navigation.accent": "text.link",
  },
  invariants: [
    ...SHARED_RUNTIME_INVARIANTS,
    "user-agent-forced-color-adjustment-remains-authoritative",
    "information-is-never-conveyed-by-color-alone",
  ],
});

export const reducedMotionCapabilityRecipe = defineCapabilityRecipe({
  id: "reduced-motion",
  trigger: "media-prefers-reduced-motion-reduce",
  overrideTokenRefs: {
    "motion.duration.fast": "motion.duration.instant",
    "motion.duration.normal": "motion.duration.instant",
    "motion.duration.slow": "motion.duration.instant",
    "motion.distance.sm": "motion.distance.none",
    "motion.distance.md": "motion.distance.none",
  },
  invariants: [
    ...SHARED_RUNTIME_INVARIANTS,
    "state-changes-remain-immediately-perceivable-without-motion",
    "focus-is-never-moved-or-reset-by-the-fallback",
  ],
});

export const lowPowerCapabilityRecipe = defineCapabilityRecipe({
  id: "low-power",
  trigger: "runtime-low-power",
  overrideTokenRefs: {
    "glass.backdropBlur": "blur.none",
    "glass.ambientShadow": "shadow.sm",
    "shadow.ambient": "shadow.sm",
    "shadow.lg": "shadow.md",
    "motion.duration.normal": "motion.duration.fast",
    "motion.duration.slow": "motion.duration.fast",
  },
  invariants: [
    ...SHARED_RUNTIME_INVARIANTS,
    "content-density-and-navigation-depth-remain-unchanged",
    "realtime-freshness-and-disconnection-indicators-remain-visible",
  ],
});

export const runtimeCapabilityRecipes = Object.freeze({
  "no-backdrop-filter": noBackdropFilterCapabilityRecipe,
  "forced-colors": forcedColorsCapabilityRecipe,
  "reduced-motion": reducedMotionCapabilityRecipe,
  "low-power": lowPowerCapabilityRecipe,
} satisfies Readonly<Record<RuntimeCapabilityRecipeId, RuntimeCapabilityRecipe>>);
