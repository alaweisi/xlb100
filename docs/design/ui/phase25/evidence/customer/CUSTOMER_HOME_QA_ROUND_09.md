# Customer Home QA — Round 09

> Status: **ACCEPTED — GATE 2 PROOF**
> Date: 2026-07-21
> Role: Customer only
> Authority: `docs/design/ui/references/customer-home-visual-truth.png`
> Authority SHA-256: `32cb6d243e8c7dd1b662110ebf2d9cfc79fe568ea23611097a4e4b2d6e3af74c`

## Result

Round 09 is the accepted rendered proof after the A2 → B2 → C2 serial integration and Gate 2 density correction.

| State | Viewport | Data source | Result | P0 | P1 | P2 | P3 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| available | 320×844 | real local backend catalog | PASS | 0 | 0 | 0 | 0 |
| available | 390×844 | real local backend catalog | PASS | 0 | 0 | 0 | 0 |
| partial | 390×844 | real API response, deterministically reduced to the first 3 official categories | PASS | 0 | 0 | 0 | 0 |
| available | 430×932 | real local backend catalog | PASS | 0 | 0 | 0 | 0 |

Every report records successful primary search navigation, no horizontal overflow, safe-area clearance, keyboard focus, 44px touch targets, reduced-motion behavior, forced-colors behavior, no-blur fallback and zero console errors.

The partial fixture does not invent catalog entries. It derives a three-category response from the authenticated real API response and verifies the explicit `当前已开放 3 项正式服务` degradation message. Recommendation and nearby-worker sections remain honest empty states because no authoritative API currently supports those facts.

## Visual acceptance

- `customer-home-comparison-390x844-09.png` places the unique source and the actual 390×844 render on one board.
- Brand hierarchy, functional Liquid Glass search, 4×4 semantic 3D categories, warm service-card surfaces, honest recommendation/nearby states, four trust guarantees and the five-item bottom navigation inherit the locked Home language.
- The 320 capture was manually checked for category-label clipping after proportional image scaling; the 430 capture was checked for density drift.
- Rounds `02`–`08` remain evidence of manual rejection and correction. Automated checks alone were not used to declare visual acceptance.

## Gate command

```powershell
pnpm gate:customer-home
```

Expected result:

```text
4 passed
[customer-home-qa] PASS iteration=09 evidence=4 reports=4 comparison=1 result=passed
```

Gate 2 accepts the Home proof only. It does not mark Services, Order Create, Coupons, Orders, Aftersale, Support, Notifications or Profile visually complete; those remain P3+ construction.
