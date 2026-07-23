# P10 Customer Hybrid SDUI — Design QA

final result: passed

## Evidence

- Human-approved reference crop: `p8-home-reference-390x844.png`
- Authenticated live Customer App: `p10-home-390x844.png`
- Remote Manifest reorder/down-list state: `p10-home-remote-reordered-390x844.png`
- Viewport: 390 × 844 CSS pixels, DPR 1, light mode, `zh-CN`
- Browser: clean Playwright Chromium profile with extensions disabled
- Runtime: built Customer App served by Vite preview against the built backend

## Verified runtime state

- The live page renders the formal Catalog-derived 16-category grid, recommendation
  section, honest provider empty state, trust strip, and stable bottom navigation.
- The remote evidence moves recommendations before the service grid and disables the
  nearby-provider slot without changing page JSX. The remaining layout and bottom
  navigation stay stable.
- Search Enter navigation, service-category navigation, recommendation navigation,
  and bottom-navigation actions are exercised by Customer E2E.
- Kill Switch and offline cases render the builtin safe page.
- Console warnings/errors, uncaught page errors, failed requests, and HTTP responses
  at or above 400 were all zero in the final four-browser-case run.
- Brand rendering uses the required hot-swappable `xlb100` fallback. Verified remote
  logo replacement and asset-failure behavior are covered by the presentation runtime
  tests because this deployment has no configured runtime-theme/asset envelope source.

## Comparison and accessibility

- The approved Tiffany background, orange action emphasis, white cards, four-column
  service density, section rhythm, and fixed navigation hierarchy are preserved.
- Formal Catalog names are never rewritten to fit the reference. Long names use
  visual ellipsis while their complete values remain in `aria-label` and `title`.
- The evidence is not claimed to be pixel-identical. The following differences are
  intentional or data-driven:

  - `xlb100` is shown instead of an unregistered brand wordmark.
  - Browser evidence does not reproduce native phone status-bar chrome.
  - Location shows only the backend/runtime value `杭州`; `西湖区` is not fabricated.
  - Formal Catalog long names can be visually truncated.
  - Missing SKU marketing images use a neutral token-based placeholder.
  - Nearby-provider cards are not fabricated when no authoritative adapter exists.

## Result

The real Customer App at 390 × 844, the dynamic reorder/down-list case, responsive
layering, fallback states, actions, and accessibility labels pass P10 visual QA.
