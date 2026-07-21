# Customer UI Full-Slice Refactor — Gate 2 Closure

> Status: **GATE 2 PASSED / READY FOR P3**
> Date: 2026-07-21
> Integration branch: `codex/customer-ui-refactor`
> Scope: Customer only; Worker/Admin/OA/Dashboard excluded

## Serial integration

Gate 2 was integrated from the Gate 1 closure `408b34c2` in the required order:

1. A2 `3565e741` → merge `3390d166`: App Shell, five-item navigation, authentication and global recovery states.
2. B2 `cad95a0b` → merge `788f1f66`: locked Customer Home master and official 16-category presentation.
3. C2 `6dad3465` → merge `17e0c8eb`: real-browser evidence and enforcing Home QA.

The three source branches had the same Gate 1 ancestor, clean worktrees and zero file overlap. No Worker, Admin, OA or Dashboard source entered the integration.

## Serial closure corrections

The integration window corrected issues that existed only after the three branches were composed:

- consolidated Home typography and dimensions back into canonical tokens/inheritance so Gate 1A remained no-new-hardcodes;
- calibrated the canonical bottom-navigation size/safe-area token to the locked Home visual truth;
- tightened the Home hierarchy without copying its layout to any other route;
- added proportional 3D category scaling so 320px labels do not clip;
- made the partial-risk capture a real-API-derived three-category state and made the QA assertion state-aware;
- changed the evidence checker to follow the contract's current immutable iteration instead of silently checking Round 01.

## Proof and verification

- Final proof: `phase25/evidence/customer/CUSTOMER_HOME_QA_ROUND_09.md`.
- Same-screen comparison: `phase25/evidence/customer/customer-home-comparison-390x844-09.png`.
- Enforcing browser gate: 4/4 passed; P0/P1/P2/P3 = 0/0/0/0.
- Home/Shell/assets/evidence focused regression: 4 files / 16 tests passed.
- Customer typecheck and production build passed.
- Phase 25 design gate, Gate 1A and Gate 1B passed after integration corrections.
- Available 320×844, available 390×844, partial 390×844 and available 430×932 all pass overflow, safe area, touch, focus, forced-colors, reduced-motion, no-blur and console checks.

## Frozen handoff to P3

P3 may start only from the Gate 2 closure commit on `codex/customer-ui-refactor`. Its parallel scope is:

- A3: Services / service discovery;
- B3: Order Create;
- C3: Coupons.

The frozen rule is design-language inheritance, not Home-layout duplication. P3 must keep catalog, price, coupon and order facts authoritative and must not modify Worker/Admin surfaces.
