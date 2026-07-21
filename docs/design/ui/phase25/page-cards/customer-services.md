# Customer — Services

| Field | Contract |
| --- | --- |
| route / role | `/customer/services` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; this page card controls route structure |
| workflow / API source | Catalog binding; `GET /api/catalog` via `@xlb/api-client` |
| states | loading, error, no result, list, selected |
| actions | query, category filter, select SKU, continue to order creation |
| constraints | city-scoped catalog only; browser filtering does not invent catalog records |
| components | Customer template, search, tabs, service card, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-services-selected-390x844-a3-01.png`, `customer-services-no-result-390x844-a3-01.png`, `customer-services-error-390x844-a3-01.png` |
| design QA | PASS — A3-01; inherited Customer Home palette, semantic 3D imagery, stable service cards, functional glass search/selection surfaces and safe-area navigation |

## A3 production acceptance

- Data truth: real `GET /api/catalog` response for Hangzhou; no locally invented catalog records or price claims.
- Primary path: query/category → select exact SKU → `/customer/order/create?cityCode=hangzhou&skuId=<skuId>`.
- Recovery states: initial loading, refresh with previous data, blocking/non-blocking error, empty city, no result and stale SKU deep link.
- Rendered checks: 390×844, no horizontal overflow, 44×44 touch targets, keyboard focus, reduced motion, forced colors, no-blur fallback and zero ready-state console errors.
- Visual inheritance review: `evidence/customer/customer-services-home-comparison-390x844-a3-01.png` compares the accepted Home runtime with the A3 business layout.
- Machine-readable result: `evidence/customer/customer-services-390x844-a3-01.report.json`.
