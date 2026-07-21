# Customer Home C2 visual QA — Round 01

> Result: **FAILED — EXPECTED BEFORE A2/B2 INTEGRATION**
> Capture date: 2026-07-21
> C2 base: `408b34c2982138594f60b38a965aee7ec9ca3295`
> Source ownership: C2 changed no Customer Home or Shell source file

## Evidence

- Unique truth: `docs/design/ui/references/customer-home-visual-truth.png`
- Runtime target: `customer-home-available-390x844-01.png`
- Same-screen comparison: `customer-home-comparison-390x844-01.png`
- Responsive captures: 320×844, 390×844 available/partial, 430×932
- Structured reports: four `customer-home-*.report.json` files

All captures used the running Customer app, real development authentication and the real city-scoped catalog API. No local success, category, worker, recommendation or price fact was fabricated.

## Result

The four viewports produced the same unresolved set: P0 = 0, P1 = 9, P2 = 6, P3 = 0. This is a truthful negative baseline against the pre-A2/B2 implementation, not Gate 2 acceptance.

### Checks already passing

- Primary search interaction reaches `/customer/services` with the query preserved.
- No horizontal viewport overflow.
- Keyboard focus enters an interactive control.
- Reduced-motion, forced-colors and no-blur fallback probes remain readable.
- No browser console errors were recorded.

### A2 Shell findings

- Missing the locked five-item navigation labels and center new-repair entry.
- Safe-area navigation evidence therefore fails.

### B2 Home findings

- Missing the “喜乐帮” brand header and “全部服务” hierarchy.
- The formal 16-category presentation is incomplete.
- No semantic 3D category assets are rendered.
- Missing the four-item trust strip.
- English/engineering copy remains visible.
- Two interactive targets are below 44×44.

## Gate 2 handoff

Do not modify round `01`. After A2 and B2 merge into the Gate 2 integration line, run round `02` with `CUSTOMER_HOME_QA_ENFORCE=1`. Gate 2 remains red until P0/P1/P2 are zero and the new 390×844 comparison is visually accepted.
