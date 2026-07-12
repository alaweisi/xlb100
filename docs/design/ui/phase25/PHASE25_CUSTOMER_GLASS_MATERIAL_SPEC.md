# Phase 25 Customer Liquid Glass Material Specification

## Authority and boundary

The checked-in visual authority is
`docs/design/ui/phase25/references/customer-apple-liquid-glass-source.png`.
It overrides Figma for Customer visual language. Figma remains the authority for
workflow structure and state coverage. The source was visually inspected before
this specification and recipe were authored.

Gate 1B defines material references only. It does not authorize pages, CSS,
components, app-root integration, campaign assets, navigation, remote theme
resolution, or changes to workflow semantics.

## Source-grounded observations

- Target composition: a 390 px compact canvas, aligned with the Figma
  `390x844` content-canvas foundation. Bottom navigation reserves 92 px plus the
  device safe area.
- Environment: cream base with restrained warm amber ambient light. Warm light
  is background illumination, not a replacement for status colors.
- Glass hierarchy: page ambience, translucent content surfaces, elevated glass
  cards, and the floating navigation layer. The hierarchy is created by tint,
  blur, edge light, inner stroke, and ambient shadow rather than opacity alone.
- Glass edge: a bright outer highlight plus a softer inner stroke. Both must be
  token-driven; page-level one-off borders are prohibited.
- Shape: large rounded cards use the canonical 24/28 px family; pills use the
  canonical pill radius.
- Typography: Noto Serif SC is reserved for expressive display headings; Noto
  Sans SC handles controls and dense reading. Ink green and coffee provide the
  primary neutral hierarchy. Tabular numeric settings remain available for
  changing values.
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
- double-edge glass, warm ambience, 390 px composition, safe-area reservation,
  92 px bottom navigation, typography, and 44 px touch contract are represented;
- the serialized recipe contains no business-domain or route vocabulary;
- browser fidelity and screenshot comparison are deferred until a later gate
  authorizes component/page implementation.
