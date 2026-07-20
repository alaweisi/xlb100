# Phase 25 Gate 1A — UI Hardcode Inventory

## Purpose

Gate 1A freezes a reproducible baseline for existing presentation hardcodes. It does **not** claim that the existing pages are standardized, and it does not require a risky one-shot rewrite. From this point forward, every counted category is monotonic: a later change may reduce a count, but may not increase it.

The inventory covers the current executable Customer, Worker, and Admin sources under `apps/<app>/src`. OA and Dashboard do not yet have an approved runtime and are therefore not assigned fabricated zero-quality targets. Their future source trees must start token-first when their readiness gates authorize construction.

## Reproduction

Run from `G:\xlb100`:

```powershell
node scripts/check-phase25-gate1a.mjs --print-hardcodes
```

The gate walks `.css`, `.ts`, and `.tsx` files in stable sorted order and counts raw source matches. It intentionally does not reinterpret the AST, remove comments, or guess whether a literal is visually acceptable. This keeps the baseline deterministic across machines. Any later refinement of the scanner is a governed baseline migration, not a silent counter reset.

## Categories

| Category | What is counted | Migration direction |
| --- | --- | --- |
| `colorLiteral` | Hex, `rgb/rgba`, and `hsl/hsla` literals | Semantic color/surface/text/border/status tokens |
| `dimensionLiteral` | `px`, `rem`, `em`, `vh`, and `vw` literals | Space, size, grid, breakpoint, radius, stroke, blur, and typography tokens |
| `inlineStyle` | JSX `style={{ ... }}` declarations | Token-aware components, recipes, or typed CSS-variable bindings |
| `fontDeclaration` | CSS font family/size/weight/height declarations whose value is not a canonical `var(...)` token | Typography semantic tokens |
| `numericZIndex` | Numeric CSS `z-index` declarations | Named elevation/overlay layer tokens |

Counts are an engineering-debt indicator, not a visual-quality score. A reduction is valid only when workflow behavior, accessibility, responsive layout, and visual evidence continue to pass their owning Gate.

## Frozen baseline

<!-- PHASE25_HARDCODE_BASELINE_START -->
```json
{
  "customer": {
    "colorLiteral": 39,
    "dimensionLiteral": 43,
    "inlineStyle": 66,
      "fontDeclaration": 1,
    "numericZIndex": 0
  },
  "worker": {
    "colorLiteral": 33,
    "dimensionLiteral": 20,
    "inlineStyle": 46,
    "fontDeclaration": 0,
    "numericZIndex": 0
  },
  "admin": {
    "colorLiteral": 74,
    "dimensionLiteral": 90,
    "inlineStyle": 146,
    "fontDeclaration": 0,
    "numericZIndex": 0
  }
}
```
<!-- PHASE25_HARDCODE_BASELINE_END -->

## Enforcement policy

- Gate 1A and later UI gates must run `scripts/check-phase25-gate1a.mjs`.
- Canonical token values live only in the TypeScript source system: foundation/semantic values in `packages/ui/src/tokens/base/defaultTokens.ts` and registered L4 overlays in `packages/ui/src/tokens/themes/themeDefinitions.ts`. Runtime CSS variables are derived from that source; Gate 1A intentionally retains no hand-maintained `.theme.json` or other generated value artifact.
- A count increase fails the gate even if another application or category decreased; debt cannot be moved between systems or categories.
- A baseline may be lowered after verified token migration. It must never be raised merely to make CI pass.
- Page-specific festival colors, spacing, lantern positioning, blessing-copy styling, pricing emphasis, and Dashboard alert colors may not be added as literals. They must resolve through the approved semantic/component/campaign token layers.
- Theme work cannot change API payloads, actions, route authorization, business state, prices, audit fields, city scope, or idempotency semantics.

## Gate 1A boundary

This baseline authorizes token contracts, validators, safe resolution primitives, and focused tests only. App-root theme integration, page reconstruction, backend Campaign APIs, database migrations, OA runtime, Dashboard runtime, material recipes, and campaign presentation assets remain outside Gate 1A.
