# Customer — Coupons

| Field | Contract |
| --- | --- |
| route / role | `/customer/coupons` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; coupon and discount-decision contracts control states and actions |
| workflow / API source | coupon grant list and order quote/discount decision through `@xlb/api-client` |
| states | loading, available empty, all empty, error/retry, available, used, expired, not selectable, stale selection |
| actions | switch available/all, retry, select eligible grant for order quote, recover deep link |
| constraints | authenticated customer and city scope; UI never calculates discount or claims application success before server quote/decision |
| components | Customer shell, page header, segmented control, coupon cards, state components, quote-selection action |
| viewport / evidence | 390×844; `evidence/customer/customer-coupons-<state>-390x844-<iteration>.png` |
| design QA | Stable warm-white cards, clear eligibility/status, no fake amount, safe-area navigation and 44px targets |
| construction status | C3 implemented; local production build and rendered browser deployment verification passed on 2026-07-22 |
| rendered evidence | `evidence/customer/customer-coupons-available-390x844-01.png`, `customer-coupons-stale-390x844-01.png`, and `customer-coupons-comparison-390x844-01.png` |
