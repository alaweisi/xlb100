# Customer — Create order

| Field | Contract |
| --- | --- |
| route / role | `/customer/order/create` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; current order contract controls workflow |
| workflow / API source | quote and order bindings through `@xlb/api-client` |
| states | invalid, quoting, quote ready, submitting, created, error |
| actions | choose real SKU, quantity, address, schedule, request quote, create order |
| constraints | authenticated customer and city scope; authoritative quote only; no payment/provider claim |
| components | Customer template, form fields, quote card, timeline, action dock, state components |
| viewport / evidence | 320、390×844、430; `evidence/customer/customer-order-create-confirm-390x844-b3-01.png`, `customer-order-create-success-390x844-b3-01.png` |
| design QA | PASS — B3-01; stable readable form layers, one Customer shell, safe-area action dock and protected focus/status semantics |

## B3 production acceptance

- Primary path: catalog `skuId` deep link → address → schedule → authoritative quote → create order → read-back confirmation.
- Protected truth: no client price calculation or success claim before the server responses; duplicate submission remains a persistent conflict state.
- Rendered checks: 320、390×844、430, no horizontal overflow, 44×44 touch targets, keyboard focus, reduced motion, forced colors, one App Shell and zero console errors.
- Visual inheritance review: `evidence/customer/customer-order-create-home-comparison-390x844-b3-01.png` compares the locked Home truth with the order-specific layout.
- Machine-readable result: `evidence/customer/customer-order-create-390x844-b3-01.report.json`.
