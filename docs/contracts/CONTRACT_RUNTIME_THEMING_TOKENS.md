# CONTRACT_RUNTIME_THEMING_TOKENS

## Purpose

This contract defines Design Token-driven Runtime Theming for Phase 15 UI construction.

Runtime theming exists to change visual expression safely. It must never change backend workflow behavior.

## Architecture Rule

```text
default theme tokens
  -> role theme tokens
  -> city/campaign/festival overrides
  -> component tokens
  -> app runtime activeTheme
  -> visual-only rendering
```

The default theme is the safe fallback. Every override must inherit from it.

## Non-Negotiable Rules

1. All visual theming must flow through design tokens.
2. App pages must not hardcode festival colors, campaign shadows, seasonal radii, or promotional component styles.
3. Theme changes must not affect API endpoints, workflow state, action availability, permissions, idempotency, audit, payment, dispatch, settlement, refund, or city scope.
4. `packages/ui` owns token consumption and component token mapping.
5. Apps may select or receive `activeTheme`, but must not embed business logic in theme selection.
6. Unknown or invalid theme values must fall back to default tokens.
7. Theme assets must have fallback assets.
8. Remote theme config must be treated as untrusted visual config and validated before use.

## Theme Model

```ts
type ThemeSource = "default" | "cityConfig" | "adminConfig" | "remoteConfig" | "localFallback";

type RuntimeTheme = {
  themeId: string;
  source: ThemeSource;
  extends?: string;
  version: string;
  semanticTokens: SemanticTokens;
  componentTokens: ComponentTokens;
  assetTokens: AssetTokens;
  motionTokens: MotionTokens;
  densityTokens: DensityTokens;
  fallbackThemeId: "default";
  affects: "visual-only";
};
```

## Default Theme

The default theme must always exist and must be safe for all three apps.

Default theme responsibilities:

- provide accessible foreground/background contrast;
- provide customer, worker, and admin role tokens;
- provide all component token fallbacks;
- provide no festival/campaign assumptions;
- render all pages without remote config;
- avoid visual states that imply unavailable business actions.

Default theme should inherit Figma-derived Phase 15 baseline tokens:

| Token area | Baseline |
| --- | --- |
| customer accent | Figma customer orange/brown-gold direction |
| customer surface | cream/warm surface direction |
| worker accent | Figma worker dark blue direction |
| admin accent | Figma admin purple direction where source exists |
| typography | Figma Noto Sans SC / Noto Serif SC direction |
| radius | Figma 16/24/28 direction |
| spacing | 8pt-derived spacing direction |

If a value is not confirmed by Figma, it must be marked as fallback or derived, not fact.

## Theme Inheritance

```text
default
  -> role.customer
  -> role.worker
  -> role.admin
  -> city.<cityCode>
  -> campaign.<campaignId>
  -> festival.<festivalId>
```

Inheritance rules:

1. Role themes inherit from default.
2. City themes inherit from role/default.
3. Campaign and festival themes inherit from city/role/default.
4. Overrides may only set visual token keys.
5. Missing keys fall back to parent theme.
6. Invalid keys are ignored.
7. Invalid token values fall back to parent value.
8. No override may define workflow state, action availability, endpoint, role permission, audit, idempotency, or settlement/payment/dispatch behavior.

## Semantic Tokens

```ts
type SemanticTokens = {
  color: {
    bgApp: string;
    bgSurface: string;
    bgElevated: string;
    fgPrimary: string;
    fgSecondary: string;
    fgInverse: string;
    accent: string;
    accentSoft: string;
    borderSubtle: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
  typography: {
    displayFamily: string;
    bodyFamily: string;
    monoFamily: string;
    titleSize: string;
    bodySize: string;
    captionSize: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    pill: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  shadow: {
    card: string;
    floating: string;
    none: string;
  };
};
```

Semantic tokens are business-neutral. Names must describe role and visual meaning, not workflow decisions.

## Component Tokens

```ts
type ComponentTokens = {
  shell: {
    bg: string;
    frameBorder: string;
    maxMobileWidth: string;
    safeAreaBottom: string;
  };
  button: {
    primaryBg: string;
    primaryFg: string;
    disabledBg: string;
    disabledFg: string;
    dangerBg: string;
    radius: string;
  };
  card: {
    bg: string;
    fg: string;
    border: string;
    radius: string;
    shadow: string;
  };
  bottomNav: {
    bg: string;
    fg: string;
    activeFg: string;
    elevatedActionBg: string;
  };
  status: {
    successBg: string;
    warningBg: string;
    dangerBg: string;
    neutralBg: string;
  };
  adminToolbar: {
    bg: string;
    border: string;
    actionGap: string;
  };
};
```

Component tokens may change visual affordance but must not enable or disable actions. Disabled states still come from workflow/action contract.

## Asset Tokens

```ts
type AssetTokens = {
  logo?: string;
  appIcon?: string;
  heroImage?: string;
  emptyStateIllustration?: string;
  campaignBadge?: string;
  fallbackAsset: string;
};
```

Asset rules:

- Assets are optional visual enhancements.
- Missing assets fall back to `fallbackAsset`.
- Assets must not encode hidden workflow state.
- Figma PNGs must not be used as page backgrounds to fake implementation.
- Campaign/festival assets must not imply payment, dispatch, settlement, refund, or audit completion.

## City / Campaign / Festival Overrides

Allowed override examples:

- seasonal accent color;
- city-specific hero image;
- festival badge asset;
- campaign soft background;
- card highlight border;
- promotional copy decoration if not business-state-related.

Forbidden override examples:

- hiding disabled action reasons;
- enabling order submit;
- marking payment as paid;
- showing fake worker acceptance;
- changing settlement action availability;
- changing refund/dispatch/payment endpoint;
- changing city scope;
- bypassing audit or confirmation;
- overriding backend error visibility.

## activeTheme Control

Future `activeTheme` may be controlled by:

- `cityConfig`
- admin config
- remote config
- local fallback
- default theme

Control rules:

1. `activeTheme` selection must be visual-only.
2. Remote config must be validated before use.
3. If remote config fails, use default.
4. Apps may cache theme config, but must not cache business permissions inside it.
5. Theme config must not be required for checkout/order/payment/dispatch/settlement correctness.

## Fallback Strategy

Fallback order:

```text
token value
  -> parent theme token
  -> role token
  -> default theme token
  -> hardcoded package fallback inside packages/ui
```

Only `packages/ui` may own last-resort hardcoded visual fallback values. App pages must not hardcode visual fallback values except layout-critical safe defaults already exposed by `packages/ui`.

## Runtime Safety Checks

Before a theme is accepted:

- required token keys exist or resolve from fallback;
- colors parse as valid CSS colors;
- font families resolve to approved stack or fallback;
- radius/spacing/shadow values are valid CSS values;
- asset URLs are optional and fail closed;
- no keys exist for workflow state, endpoint, action enablement, permission, audit, idempotency, payment, dispatch, settlement, or refund.

## Phase 15 Implementation Boundary

Phase 15 pixel repair may add theme consumption to `packages/ui` only after this contract is mapped route-by-route.

Phase 15 app code must not:

- hardcode festival palettes;
- create campaign-specific components inside app pages;
- change business state from theme;
- hide backend errors because a theme is active;
- change available actions because a theme is active.

Production remains NO-GO until separately authorized.
