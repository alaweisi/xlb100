# Phase 25 Customer Gate 2 / Gate 3 audit

## Scope completed

- Added admissible page cards for `/customer/`, `/customer/services`,
  `/customer/order/create`, `/customer/orders`, `/customer/aftersale`,
  `/customer/support`, and `/customer/profile`.
- Mounted the canonical `ThemeProvider` at the Customer app boundary and loaded
  the Customer shell stylesheet.
- Applied the Gate 1B Customer recipe at the route-shell layer: warm ambient
  background, token-driven translucent/double-edge surfaces, glass navigation,
  safe-area bottom reservation, focus ring, and capability fallbacks.
- Removed user-visible UAT/debug panels and their endpoint, payload, workflow,
  and guard diagnostics. Customer actions remain the existing real API-client
  calls and state bindings.

## Workflow and boundary audit

All seven routes retain their existing `@xlb/api-client` flow. This work makes
no backend, database, API-client, provider, order/payment/aftersale/support
state-machine, or data-contract change. No catalog, price, order, worker,
support, or profile fact was added or mocked.

## Visual verification truth

The shell is tokenized and source-grounded against
`references/customer-apple-liquid-glass-source.png`; the route cards freeze the
required 390×844 state/evidence names. Customer typecheck passed.

No browser capture was produced in this work unit, so this report does **not**
claim pixel-level PNG fidelity, a P0/P1/P2 clearance, or a completed Gate 2
manual comparison. Existing route page bodies also retain legacy inline visual
styles inside their business-state composition; the shared, tokenized shell
does not by itself convert every legacy element to token variables. Those
element-level replacements require the shared primitive/shell pass and browser
evidence before final Phase 25 acceptance.

## Verification

```text
pnpm --filter @xlb/customer typecheck  PASS
pnpm --filter @xlb/customer build      PASS
```
