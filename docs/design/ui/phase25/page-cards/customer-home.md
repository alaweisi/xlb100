# Customer — Home

| Field | Contract |
| --- | --- |
| route / role | `/customer/` / customer |
| visual source | `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md` + `docs/design/ui/references/customer-home-visual-truth.png` — the only Customer Home visual truth |
| workflow / API source | Catalog home binding; `GET /api/catalog` via `@xlb/api-client` |
| states | loading, empty, error, available, partial sections when recommendation/nearby sources are unavailable |
| actions | city/area selection, query, notification entry, open category/service, support, create order, orders, profile |
| constraints | authenticated customer; city-scoped catalog; all 16 top-level categories derive from the official catalog/API; no fabricated recommendation, price, worker, certification, distance, or availability facts |
| components | brand header, notification button, combined location/search bar, 4×4 category grid with semantic 3D assets, recommended-service scroller, nearby-worker scroller, trust strip, five-item bottom navigation, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-home-<state>-390x844-<iteration>.png` |
| design QA | Same-state comparison against the unique source: hierarchy, 4×4 catalog grid, imagery language, horizontal sections, trust strip, `首页/客服/+/订单/我的`, safe area and 44px targets |
