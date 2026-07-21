# Customer — Orders

| Field | Contract |
| --- | --- |
| route / role | `/customer/orders` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; current order contract controls workflow |
| workflow / API source | order, payment, confirmation, review, refund-request bindings through `@xlb/api-client` |
| states | empty and every backend order, payment, fulfillment state; guarded error |
| actions | open, pay only when allowed, confirm, review, request refund only when allowed |
| constraints | backend state machine remains authoritative; customer/city scope and guards are retained |
| components | Customer runtime surface, functional glass filter bar, stable order cards, progressive action panels, honest state components |
| viewport / evidence | 320/390/430 responsive QA; `evidence/customer/customer-orders-lifecycle-390x844-a4-01.png`, `customer-orders-review-390x844-a4-01.png`, `customer-orders-home-comparison-390x844-a4-01.png` |
| design QA | P4-A4 passed: inherits the Customer Home warm-white, forest/orange, Liquid Glass control language without copying its layout; authoritative status, single next action, 44px targets, reduced motion, forced colors and no-blur fallback verified |
