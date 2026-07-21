# Customer UI visual QA evidence

> C1 status: **INFRASTRUCTURE READY**
> C2 status: **GATE 2 ACCEPTED — ROUND 09 IS THE FINAL HOME PROOF**
> Actual visual acceptance: Round 09; P0/P1/P2/P3 = 0/0/0/0
> Role boundary: Customer only

This directory is the canonical evidence root for the Customer full-slice visual refactor. C1 establishes the contract and tooling; it does not fabricate screenshots or mark `CUST-QA-001..005` complete.

## Contract

- Manifest: `qa-manifest.json`
- Report contract: `qa-report.schema.json`
- Visual authority: `docs/design/ui/references/customer-home-visual-truth.png`
- Routes: 9 Customer carriers
- Viewports: 320×844, 390×844 and 430×932
- Required capture plan: 36 PNGs
  - 390×844: default plus highest-risk state for every route;
  - 320×844 and 430×932: default state for every route.

Evidence uses this stable filename:

```text
customer-{surface}-{state}-{width}x{height}-{iteration}.png
```

Example:

```text
customer-home-available-390x844-01.png
```

An iteration is a two-digit local comparison round. Never overwrite an earlier capture to hide a regression. A later accepted round is identified in the corresponding QA report.

## Commands

Validate the infrastructure without requiring screenshots:

```powershell
node scripts/check-customer-ui-qa-infrastructure.mjs
```

Print the deterministic capture plan:

```powershell
node scripts/check-customer-ui-qa-infrastructure.mjs --plan
```

After P2 begins producing real browser evidence, require every planned PNG:

```powershell
node scripts/check-customer-ui-qa-infrastructure.mjs --strict-evidence
```

The strict command is expected to remain red until the corresponding page/state has a real API-backed or honest error/empty fixture and an actual browser capture.

## C2 Home commands

Capture the real Customer Home route at 320×844, 390×844 and 430×932, plus the 390×844 partial-risk state. The current contract writes immutable accepted iteration `09` screenshots, schema-shaped reports and a same-screen comparison board:

```powershell
pnpm capture:customer-home
```

Validate an evidence round while allowing a truthful failed visual result before A2/B2 integration:

```powershell
node scripts/check-customer-home-evidence.mjs --allow-failed
```

Gate 2 uses the enforcing command after A2 and B2 are integrated. Any P0/P1/P2 finding makes it red:

```powershell
pnpm gate:customer-home
```

C2 owns only test, evidence and QA files. It must not repair `CustomerHomePage.tsx`, the Customer Shell, shared components or tokens; findings are assigned back to A2/B2 and recaptured in a later iteration.

Round `01` is the pre-integration negative baseline. Rounds `02`–`08` are retained as serial visual-correction evidence and are not accepted proof. The default command now targets accepted Round `09`:

```powershell
$env:CUSTOMER_HOME_QA_ITERATION="09"
pnpm capture:customer-home
node scripts/check-customer-home-evidence.mjs --iteration=09
```

## Capture and review protocol

1. Start only the Customer app and its required local backend through `playwright.customer-ui.config.ts`.
2. Authenticate through the existing development auth contract; do not inject a fake success state.
3. Open the manifest route with an explicit city scope.
4. Exercise the primary interaction needed to reach the named state.
5. Check console errors, horizontal overflow, safe-area clearance, focus, touch targets and applicable fallbacks.
6. Capture the exact manifest viewport and filename.
7. Compare the capture with the unique Home truth and the route page card.
8. Record the result against `qa-report.schema.json`, including console errors, checks and P0/P1/P2/P3 findings. P0–P2 must be fixed and recaptured; only P3 may remain at final acceptance.

Screenshots establish rendered evidence only. They never authorize service categories, prices, discounts, workers, permissions, order states or success results.
