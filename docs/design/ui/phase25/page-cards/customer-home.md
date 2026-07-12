# Customer — Home

| Field | Contract |
| --- | --- |
| route / role | `/customer/` / customer |
| visual source | `../references/customer-apple-liquid-glass-source.png` |
| workflow / API source | Catalog home binding; `GET /api/catalog` via `@xlb/api-client` |
| states | loading, empty, error, available |
| actions | city selection, query, open services, select real SKU |
| constraints | authenticated customer; city-scoped catalog; no fabricated price, worker, or availability facts |
| components | Customer template, glass surface, search, service card, action dock, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-home-<state>-390x844-<iteration>.png` |
| design QA | Gate 2 proof surface: token-driven warm ambience, double-edge glass, fixed safe-area navigation |
