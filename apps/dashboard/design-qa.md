# Dashboard Design QA

## Evidence

- Source visual truth: `G:\Agents\codex\generated_images\019f98f7-b5f2-7bf0-8d5c-08e415bbedf8\call_v9KT9fgiJGxocVKIEYY0aVcf.png`
- Browser-rendered implementation: `G:\xlb100\apps\dashboard\artifacts\dashboard-wallboard-1920x1080.png`
- Combined comparison: `G:\xlb100\apps\dashboard\artifacts\dashboard-comparison-pass1.png`
- State: nationwide, authenticated, live, representative transactions/fulfillment/aftersale/support/city data
- CSS viewport: `1920 x 1080`
- Device scale factor: `1`
- Source pixels: `1672 x 941`
- Implementation pixels: `1920 x 1080`
- Density normalization: source was bicubic-scaled to `1920 x 1080`; implementation remained native; both were placed in one `3840 x 1080` comparison image.

## Full-view comparison

The combined evidence preserves the selected source’s major composition: dark navy command-center surface, single-line header, six KPI columns, a large left pulse chart, right-side severity rail, four compact operational summaries, and a full-width source-freshness footer. Region ordering, above-the-fold density, card boundaries, blue/cyan/green/amber/red semantic palette, numeric hierarchy, and 16:9 crop align without clipped or hidden regions.

The implementation intentionally replaces the source’s “设计预览数据” control with the authenticated read-only session control. It also replaces source-only prior-day deltas with fact-source labels because the current database contract has no authoritative prior-day comparison aggregate. These are product-integrity deviations, not unresolved visual shortcuts.

## Focused-region comparison

A separate crop was not required: the normalized combined image is `3840 x 1080`, so the header, KPI labels, alert ownership, bottom-card labels, icon treatment, city rows, and footer freshness text remain readable at original detail. Inspection confirmed:

- Typography: comparable condensed operational hierarchy; display numbers, section titles, secondary labels, and tabular numbers remain optically distinct.
- Spacing/layout: all six KPI columns and four lower cards align; no 1920×1080 overflow; the pulse/attention split and footer height track the source.
- Colors/tokens: navy surfaces and semantic status colors are consistent; contrast is sufficient for body text and status labels.
- Image quality/assets: neither source nor implementation depends on photographic assets. Visible icons use the Phosphor family; no emoji, placeholder raster, handcrafted SVG, or CSS-drawn substitute is present.
- Copy/content: operational Chinese labels are coherent and explicitly distinguish live, stale, disconnected, aggregate-only, and privacy-safe states.

## Interaction and runtime evidence

- Primary interactions tested: authenticated boot, 15-second data route, live rendering, stale snapshot label, manual retry, and return to live state.
- Browser console and uncaught page errors: checked; none in the passing live render.
- Layout measurement: document and viewport both measured exactly `1920 x 1080`.
- Accessibility evidence: semantic headings/regions, labelled controls, keyboard focus styles, and reduced-motion override are present.

## Findings

No actionable P0, P1, or P2 differences were found.

P3 follow-up polish:

- A future authoritative comparison window could restore prior-day deltas without using synthetic data.
- A city map could be added only after an approved geospatial aggregate source exists; it is intentionally absent today.

## Comparison history

- Pass 1: no P0/P1/P2 findings. No visual fixes were required after the normalized source/implementation comparison.

## Final result

final result: passed
