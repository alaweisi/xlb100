# P8 Customer Dynamic Home — Design QA

final result: passed

## Evidence

- Approved source at the target viewport: `p8-home-reference-390x844.png`
- Actual Customer App viewport capture: `p8-home-390x844.png`
- Actual Customer App full-page capture: `p8-home-full-390.png`
- Viewport: 390 × 844 CSS pixels, DPR 1
- Browser: Microsoft Edge headless, clean temporary profile, extensions disabled
- Runtime: real Vite Customer App component tree; no injected visual CSS or static replacement HTML

## Runtime state captured

- Manifest delivery source: `builtin`
- Delivery reason: `server-fallback-builtin` because the local control plane has no published home manifest
- Composition status: `ready`
- Manifest id: `customer.home.builtin`
- Data state: `partial` because no authoritative nearby-provider adapter is available
- Rendered manifest slots: 7
- Catalog category cards: 16, all images decoded successfully
- Recommendation cards: 6; missing SKU marketing images use a neutral token-based missing-image state
- Nearby-provider state: explicit empty state, not fabricated provider data
- Category cards expose both a full accessible name and a full `title` value when visible labels truncate

## Layout and interaction checks

- All first-screen layers are visible without bottom-navigation overlap: header, category grid, recommendations, nearby-provider state, trust strip, and bottom navigation.
- Content height: 858 px; trust strip ends at 742 px and fixed navigation begins at 768 px in the 844 px viewport.
- Search input submission changed history to `/service?q=cleaning`.
- Console exceptions: none.
- Console warnings/errors: none.
- Failed or HTTP >= 400 resource requests: none.
- App favicon and all 16 versioned category assets loaded successfully.

## Comparison history

1. Replaced unresolved custom CSS variables with existing Customer core token variables.
2. Merged location and search into the approved pill layout and reduced the category grid to the reference density.
3. Re-encoded the generated category assets to versioned 256 × 256 PNG files to eliminate decoding/paint instability.
4. Tightened header, section, recommendation, trust, and bottom-navigation rhythm so all required first-screen layers remain visible.
5. Removed misleading category-image fallback from recommendation cards and introduced the explicit neutral missing-image state.
6. Re-captured both viewport and full-page evidence with a clean, extensions-disabled browser profile.

## Intentional or data-driven differences

- Header shows the required hot-swappable `xlb100` fallback rather than the unregistered brand wordmark in the source image.
- The web viewport does not reproduce native phone status-bar chrome.
- Local location context resolves to `杭州`; `西湖区` is not hardcoded when the location provider does not return a district.
- Formal Catalog names are preserved and may visually truncate; full text remains available to assistive technology and through `title`.
- Nearby-provider cards are not fabricated. The captured local runtime shows the honest empty state until an authoritative provider adapter supplies data.
- Catalog SKUs do not currently supply marketing images in this local data set. Neutral placeholders are used instead of reusing unrelated category art.
