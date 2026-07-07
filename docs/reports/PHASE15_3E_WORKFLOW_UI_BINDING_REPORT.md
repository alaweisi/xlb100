# Phase 15.3E-ARCH - Workflow UI Binding Report

## Executive Conclusion

Phase 15 must continue with a backend-workflow-driven UI architecture.

Figma decides how workflow states look. Backend contracts decide what states and actions exist. `packages/ui` provides visual containers and reusable components, but it must not decide business permissions or call workflow APIs.

This architecture is required before Figma Pixel Repair because pixel-perfect UI without workflow binding would create visually convincing but business-incorrect screens.

## Files Added

- `docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md`
- `docs/reports/PHASE15_3E_WORKFLOW_UI_BINDING_REPORT.md`

Progress file updated:

- `docs/execution/PHASE15_PROGRESS.md`

No app, package, backend, db, deploy, infra, production, or tag changes were made.

## Contract Summary

The new contract defines:

- `WorkflowUiBinding`
- `ActionContract`
- `CustomerAnswerModel`
- `FigmaBinding`
- `NotWiredPolicy`
- UI slot mapping
- three-app workflow mapping
- Phase 15.3F entry gates

The central rule is:

```text
workflow/action contract -> app binding -> packages/ui presentation -> Figma visual fit
```

Not:

```text
Figma button -> frontend guesses endpoint -> backend side effect
```

## Why This Is Needed

Recent Phase 15 work proved that visual polish alone is not enough:

- 08e8355 created a staging-visible rough polish but not a Figma high-fidelity implementation.
- Admin Settlement/Governance have real backend logic but no matching Figma frames.
- Customer has real catalog/pricing/order/payment-order APIs, but order list/profile remain not-wired.
- Worker has important future workflows, but task acceptance, eligibility, wallet, and certification execution cannot be faked.

Without a binding contract, a Figma-like button could accidentally imply a backend capability that does not exist or is phase-forbidden.

## Workflow Binding Model

Every route must define:

| Field | Purpose |
| --- | --- |
| `workflowName` | Stable workflow identity. |
| `route` | Frontend route. |
| `actor` | customer / worker / admin. |
| `backendSource` | Contract docs, endpoints, modules, wiring status. |
| `state` | Backend/API/not-wired-derived state. |
| `availableActions` | All executable or disabled actions. |
| `disabledReasonCode` | Machine-readable reason for blocked states/actions. |
| `customerFacingCopy` | User-visible copy keys or copy scope. |
| `uiSlots` | Where the data binds in the page. |
| `figmaFrame` | exact, partial, derived, or missing design source. |
| `packagesUiComponents` | Shared components used for rendering. |
| `notWiredPolicy` | Required when capability is absent. |

## Action Rules

Every functional button must be described by:

- `actionId`
- `labelKey`
- `enabled`
- `disabledReasonCode`
- `danger`
- `confirmRequired`
- `endpoint`
- `method`
- `idempotencyRequired`
- `auditRequired`

Important consequences:

- Figma cannot invent actions.
- A button cannot be enabled without backend/API state.
- Disabled buttons must explain why.
- Admin, settlement, payment, dispatch, and audit actions require explicit audit/idempotency handling.

## Customer Answer Model

Customer UI must answer:

1. 当前在哪一步
2. 下一步能做什么
3. 为什么不能做
4. 预计多久
5. 出问题怎么办

This is especially important for:

- price quote
- order create
- pending payment
- payment order created
- order detail
- order list not-wired
- profile/account not-wired

## Three-App Mapping Summary

### Customer

Covered workflows:

- catalog browsing
- pricing quote
- order create
- pending payment
- payment order created
- order detail
- order list not-wired
- profile/account not-wired

Rules:

- Keep real catalog/pricing/order/payment-order APIs.
- Do not fake order list.
- Do not fake profile/account/address data.
- Do not fake payment success.

### Worker

Covered workflows:

- worker profile
- certification status
- task pool not-wired/read-only
- eligibility not-wired
- accept order unavailable
- wallet not-wired

Rules:

- No fake tasks.
- No fake earnings.
- No fake qualification.
- No enabled accept action until backend workflow allows it.

### Admin

Covered workflows:

- settlement dashboard
- governance hash
- export review
- statement detail
- 400/error state
- city_scope guardrail
- audit action

Rules:

- Existing Settlement/Governance backend logic remains authoritative.
- Do not swallow backend 400 or scope errors.
- Admin Settlement/Governance are `DESIGN_SOURCE_MISSING` until dedicated Figma frames exist.
- Governance-only actions must remain governance-only unless backend phase explicitly enables execution.

## Figma Binding Summary

Allowed binding statuses:

- `exact frame`
- `partial frame`
- `derived design`
- `DESIGN_SOURCE_MISSING`

Current admin limitation:

- Admin Settlement console: `DESIGN_SOURCE_MISSING`
- Admin Settlement export review: `DESIGN_SOURCE_MISSING`
- Admin Settlement statement detail: `DESIGN_SOURCE_MISSING`
- Admin Settlement governance: `DESIGN_SOURCE_MISSING`

They may be visually harmonized, but they cannot be claimed as Figma exact matches.

## packages/ui Mapping

Required conceptual bindings:

| Workflow data | UI component direction |
| --- | --- |
| `availableActions` | `ActionDock`, `AdminToolbar`, `Button` |
| order/workflow state | `WorkflowTimeline`, `StateBadge`, `StatusTag` |
| disabled reason | `GuardrailCard` |
| pending payment | `CustomerAnswerCard`, `CustomerQuoteCard` |
| not-wired | `NotWiredState` |
| API error | `ApiErrorPanel`, `ErrorState` |
| city scope | `ScopeBadge`, `GuardrailCard` |

If a component is missing in `packages/ui`, Phase 15.3F may add it only as business-neutral presentation. It must not import API clients or own business state.

## Phase 15.3F Entry Gate

Pixel repair may continue only when each target route has:

- route-frame mapping
- workflow mapping
- backend contract source
- action list
- disabled reason policy
- not-wired policy if needed
- packages/ui component map
- screenshot comparison plan

Routes without this mapping can be documented or visually audited, but they cannot be shipped as high-fidelity UI.

## Production / Deployment

- Production: NO-GO
- Cloud staging deploy: not performed
- Tag: not created
- Business code changes: none

## Recommendation

Proceed to Phase 15.3F only after using `CONTRACT_WORKFLOW_UI_BINDING.md` to build a route-by-route implementation checklist.

Recommended first implementation targets:

1. `/customer/order/create`
2. `/customer/orders`
3. `/worker/`

Admin Settlement/Governance should either receive matching Figma frames or remain explicitly marked as derived/admin-harmonized, not high-fidelity.
