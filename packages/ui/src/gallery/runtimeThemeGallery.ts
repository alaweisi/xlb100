import type { RuntimeThemeCapabilities, ThemeMode, ThemeRole } from "../tokens/tokenTypes.js";

export type RuntimeThemeGalleryState = "default" | "campaign" | "invalid" | "expired" | "kill-switch" | "asset-fallback";

export interface RuntimeThemeGalleryScenario {
  readonly id: string;
  readonly role: ThemeRole;
  readonly mode: ThemeMode;
  readonly state: RuntimeThemeGalleryState;
  readonly viewport: "mobile" | "desktop" | "wallboard";
  readonly capabilities: RuntimeThemeCapabilities;
}

const normal: RuntimeThemeCapabilities = Object.freeze({ backdropFilter: true, forcedColors: false, reducedMotion: false, lowPower: false });
const accessible: RuntimeThemeCapabilities = Object.freeze({ backdropFilter: false, forcedColors: true, reducedMotion: true, lowPower: true });

/** Deterministic source for Gate 1F visual/a11y runners; it carries no business data. */
export const runtimeThemeGalleryScenarios: readonly RuntimeThemeGalleryScenario[] = Object.freeze([
  { id: "customer-default-mobile", role: "customer", mode: "light", state: "default", viewport: "mobile", capabilities: normal },
  { id: "customer-campaign-mobile", role: "customer", mode: "light", state: "campaign", viewport: "mobile", capabilities: normal },
  { id: "customer-a11y-mobile", role: "customer", mode: "high-contrast", state: "asset-fallback", viewport: "mobile", capabilities: accessible },
  { id: "worker-default-mobile", role: "worker", mode: "dark", state: "default", viewport: "mobile", capabilities: normal },
  { id: "admin-invalid-mobile", role: "admin", mode: "light", state: "invalid", viewport: "mobile", capabilities: normal },
  { id: "oa-kill-switch-desktop", role: "oa", mode: "light", state: "kill-switch", viewport: "desktop", capabilities: accessible },
  { id: "dashboard-expired-wallboard", role: "dashboard", mode: "large-display", state: "expired", viewport: "wallboard", capabilities: accessible },
]);
