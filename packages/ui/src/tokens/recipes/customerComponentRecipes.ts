const customerComponentVarPrefix = "--xlb-role-customer-component";

function cssVar(path: string): string {
  return `var(${customerComponentVarPrefix}-${path})`;
}

/**
 * L5/L6 Customer component recipe.
 *
 * Values are emitted from the canonical token tree by ThemeProvider. This file
 * contains references only, so it cannot become a second color or dimension
 * source.
 */
export const customerComponentRecipe = Object.freeze({
  id: "customer-component-system",
  role: "customer",
  sourceAuthority: "docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md",
  button: Object.freeze({
    primaryBackground: cssVar("button-primary-background"),
    primaryText: cssVar("button-primary-text"),
    secondaryBackground: cssVar("button-secondary-background"),
    secondaryBorder: cssVar("button-secondary-border"),
    secondaryText: cssVar("button-secondary-text"),
    ghostText: cssVar("button-ghost-text"),
    dangerBackground: cssVar("button-danger-background"),
    dangerText: cssVar("button-danger-text"),
    radius: cssVar("button-radius"),
    minHeight: cssVar("button-min-height"),
    primaryMinHeight: cssVar("button-primary-min-height"),
    paddingInline: cssVar("button-padding-inline"),
  }),
  input: Object.freeze({
    background: cssVar("input-background"),
    border: cssVar("input-border"),
    text: cssVar("input-text"),
    placeholder: cssVar("input-placeholder"),
    radius: cssVar("input-radius"),
    minHeight: cssVar("input-min-height"),
    paddingInline: cssVar("input-padding-inline"),
  }),
  card: Object.freeze({
    background: cssVar("card-background"),
    border: cssVar("card-border"),
    text: cssVar("card-text"),
    heading: cssVar("card-heading"),
    radius: cssVar("card-radius"),
    shadow: cssVar("card-shadow"),
    padding: cssVar("card-padding"),
  }),
  tabs: Object.freeze({
    background: cssVar("tabs-background"),
    border: cssVar("tabs-border"),
    activeBackground: cssVar("tabs-active-background"),
    activeText: cssVar("tabs-active-text"),
    inactiveText: cssVar("tabs-inactive-text"),
    radius: cssVar("tabs-radius"),
    minHeight: cssVar("tabs-min-height"),
    gap: cssVar("tabs-gap"),
  }),
  state: Object.freeze({
    background: cssVar("state-background"),
    border: cssVar("state-border"),
    text: cssVar("state-text"),
    mutedText: cssVar("state-muted-text"),
    infoBackground: cssVar("state-info-background"),
    infoText: cssVar("state-info-text"),
    successBackground: cssVar("state-success-background"),
    successText: cssVar("state-success-text"),
    warningBackground: cssVar("state-warning-background"),
    warningText: cssVar("state-warning-text"),
    dangerBackground: cssVar("state-danger-background"),
    dangerText: cssVar("state-danger-text"),
    radius: cssVar("state-radius"),
    padding: cssVar("state-padding"),
  }),
  overlay: Object.freeze({
    background: cssVar("overlay-background"),
    fallbackBackground: cssVar("overlay-fallback-background"),
    border: cssVar("overlay-border"),
    text: cssVar("overlay-text"),
    scrim: cssVar("overlay-scrim"),
    radius: cssVar("overlay-radius"),
    shadow: cssVar("overlay-shadow"),
    blur: cssVar("overlay-blur"),
  }),
  protected: Object.freeze({
    focus: "var(--xlb-border-focus)",
    focusWidth: "var(--xlb-stroke-regular)",
    focusOffset: "var(--xlb-spacing-xs)",
    disabledOpacity: "var(--xlb-opacity-disabled)",
    motionFast: "var(--xlb-motion-duration-fast)",
  }),
} as const);

export type CustomerComponentRecipe = typeof customerComponentRecipe;
