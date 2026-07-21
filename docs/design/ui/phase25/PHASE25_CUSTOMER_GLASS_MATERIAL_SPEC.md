# Phase 25 Customer Visual Material Specification

## Authority and boundary

The only checked-in Customer Home visual authority is
`docs/design/ui/references/customer-home-visual-truth.png`, governed by
`docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`. It supersedes every historical
Customer Home Figma export and the former Phase 25 visual PNG. Workflow
structure and state coverage come from current code, API contracts, shared
types, validators and page cards—not from historical visual files.

Gate 1B defines material references only. It does not authorize pages, CSS,
components, app-root integration, campaign assets, navigation, remote theme
resolution, or changes to workflow semantics.

## Source-grounded observations

- Target composition: the 853 × 1844 source maps to the 390 × 844 compact
  acceptance viewport. Bottom navigation reserves 92 px plus the device safe
  area; the page body remains vertically scrollable.
- Environment: warm off-white `#FEFAF5`, ink green `#18342D`, slate body text
  and bright clay-orange `#E97116`. Decorative warmth never replaces protected
  status colors.
- Homepage hierarchy: brand/notification header, combined location-search bar,
  a contract-backed 4 × 4 service-category grid, horizontally scrolling
  recommended services, horizontally scrolling nearby-worker cards, trust
  strip, then the five-item navigation.
- Glass hierarchy: translucent material is limited to functional controls,
  elevated navigation and light containment. Service, recommendation and worker
  cards prioritize stable warm-white readability.
- Glass edge: a bright outer highlight plus a softer inner stroke. Both must be
  token-driven; page-level one-off borders are prohibited.
- Shape: large rounded cards use the canonical 24/28 px family; pills use the
  canonical pill radius.
- Typography: the source uses a clear sans-serif hierarchy. Noto Sans SC handles
  brand, headings, controls and dense reading; no serif heading is required by
  the Customer Home truth. Tabular numeric settings remain available for
  changing values.
- Service imagery: each formal category receives a distinct semantic 3D image
  in the selected ivory/green/clay-orange language. Emoji, repeated wrench
  glyphs and unrelated line icons are not acceptable substitutes.
- Interaction: every actionable target remains at least the canonical 44 px
  touch target. Visual glow must never reduce focus-ring contrast.

## Canonical recipe

`packages/ui/src/tokens/recipes/customerMaterialRecipe.ts` is the typed Gate 1B
recipe. Every entry is a path into
`packages/ui/src/tokens/base/defaultTokens.ts`; it owns no token value and
contains no route, API, workflow, amount, permission, campaign, or status
decision.

The recipe provides four material layers:

1. page ambience through `role.customer.cream` and `role.customer.ambient`;
2. translucent surfaces through `role.customer.glassTint`, `glass.tint`,
   saturation, and backdrop blur;
3. double-edge definition through `glass.edgeHighlight`, `glass.innerStroke`,
   and the canonical stroke widths;
4. elevation through the canonical glass ambient shadow.

Protected focus and operational status tokens remain explicit invariants. Warm
Customer accents and future campaign overlays must not replace them.

## Runtime capability fallbacks

The material recipe references, but does not implement, the shared Gate 1B
runtime fallback recipes:

| Capability | Required degradation |
| --- | --- |
| no backdrop filter | Replace translucency with an approved opaque surface; preserve edge, hierarchy, text contrast, and layout. |
| forced colors / high contrast | Yield decorative tint, blur, and shadow to system colors, visible borders, protected focus, and status semantics. |
| reduced motion | Use instant/near-instant motion tokens; keep state changes perceivable without travel or ambient animation. |
| low power | Remove costly blur and ambient effects while preserving the same dimensions, hierarchy, and interaction targets. |

Fallback selection must not remount the page, shift the 92 px navigation
reservation, change safe-area handling, or alter any business fact.

## Acceptance checks

- every recipe reference resolves to a canonical primitive token;
- source path, Customer role, compact viewport, comfortable density, and all
  four fallbacks are frozen by a focused unit test;
- the warm off-white/ink-green/bright-orange palette, functional glass,
  sans-serif hierarchy, 4 × 4 service grid, safe-area reservation, 92 px bottom
  navigation and 44 px touch contract are represented;
- the serialized recipe contains no business-domain or route vocabulary;
- browser fidelity and screenshot comparison are deferred until a later gate
  authorizes component/page implementation.
