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
| viewport / evidence | 390×844; `evidence/customer/customer-services-<state>-390x844-<iteration>.png` |
| design QA | Gate 3: preserve the selected Customer Home palette, imagery, surface hierarchy and safe-area navigation |
