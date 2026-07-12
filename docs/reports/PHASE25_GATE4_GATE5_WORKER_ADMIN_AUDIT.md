# Phase 25 — Gate 4 / Gate 5 Worker and Admin Audit

## Scope

This audit covers the existing Worker and Admin route surfaces under the global Phase 25 authorization. It does not change backend business semantics, database schema, API-client contracts, provider integrations, or use fabricated business data.

## Source and contract evidence

- Worker visual authority: `docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png`, the Figma inventory in `docs/design/figma/pages.json`, and the approved `worker-operational-dark` recipe.
- Admin visual authority: the archived Admin frame set under `docs/design/figma/frames/admin/`, the same Figma inventory, and the approved `admin-dense-operations` recipe.
- Route/action/state inventory: `docs/design/ui/phase25/PHASE25_ROUTE_CONTRACT_MATRIX.md`.
- Runtime facts: Worker uses `createWorkerApiClient`; Admin page modules retain their existing authenticated API bindings and hash routes. Neither implementation adds mock task, earnings, settlement, or operations data.

## Delivered foundation integration

- Worker and Admin app entry points now mount the canonical `ThemeProvider`, making the single Phase 25 token tree available at each role root.
- Worker’s outer shell, device surface, and content surface consume `role.worker.page` / `role.worker.text` CSS variables.
- Admin’s login, navigation, and shell backgrounds consume canonical semantic/role CSS variables.
- The detailed route cards are checked in under `docs/design/ui/phase25/page-cards/`, with visual source, API/workflow source, required states, action constraints, viewport, and evidence status for every Gate 4/5 surface.

## Acceptance evidence status

Typecheck/build evidence is recorded after this audit. Browser screenshots remain explicitly pending because the local backend dependency needed to exercise authenticated real workflows is not available in this work session; no synthetic substitute was generated. The source screenshots above remain the comparison authority, not implementation proof.

## Remaining closure work

1. Capture authenticated real-data screenshots at Worker 390×844 and Admin 1440×900/1280px for every card state reachable from the approved contracts.
2. Record visual comparison and P0/P1/P2 corrections in each card, then set its design QA to `passed`.
3. Run the unified Gate 8 browser, responsive, accessibility, typecheck/build/test, preflight, and readiness gates. OA/Dashboard remain runtime-blocked unless their independent readiness facts are supplied.
