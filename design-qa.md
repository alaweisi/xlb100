# Customer homepage design QA

final result: passed

- Visual authority: `docs/design/ui/visual-authority/customer-home-approved-2026-07-21.png`
- Implementation: `artifacts/design-qa/customer-edge-full-2026-07-20/C-01-home-ready-390x844.png`
- Side-by-side comparison: `artifacts/design-qa/customer-edge-full-2026-07-20/C-01-home-reference-vs-implementation.png`
- Browser: Microsoft Edge
- Viewport: 390 x 844
- State: authenticated, catalog ready, recommendations ready, worker showcase ready

## Design QA history

1. First implementation drifted from the approved reference: line icons replaced the dimensional service assets, recommendation cards lost their photography, the worker showcase and assurance strip were visually weakened, and the glass treatment became too generic. Severity: P1.
2. Rebuilt the homepage against the approved screenshot with 16 individual service assets, three service photographs, a display-only worker avatar, compact glass surfaces, and the approved five-item bottom navigation.
3. Second comparison found orange category labels, excessive worker-card height, and assurance content colliding with the navigation. Severity: P2.
4. Corrected text color, compacted the worker showcase, tightened the assurance strip, and rendered the page again in Edge.

## Final review

- No P0, P1, or P2 visual defects remain in the approved 390 x 844 state.
- The 16 service categories keep their real catalog links.
- Recommendation cards keep their real SKU order links.
- Notifications and customer support keep their real routes.
- Worker cards are read-only. They expose only alias, certification, rating, and skills; there is no phone, chat, booking, selection, assignment, or location control.
- The implementation intentionally says `本城师傅` instead of `附近师傅`: the backend currently proves city coverage, not live distance, so the interface does not invent proximity.
- The full Edge gate passed 21 mobile screenshots and 9 desktop shell checks with no horizontal overflow, missing shell, undersized touch target, or unexpected error.
