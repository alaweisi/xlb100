# Customer — Orders

| Field | Contract |
| --- | --- |
| route / role | `/customer/orders` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; current order contract controls workflow |
| workflow / API source | order, payment, confirmation, review, refund-request bindings through `@xlb/api-client` |
| states | empty and every backend order, payment, fulfillment state; guarded error |
| actions | open, pay only when allowed, confirm, review, request refund only when allowed |
| constraints | backend state machine remains authoritative; customer/city scope and guards are retained |
| components | Customer template, order cards, status tags, actions, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-orders-<state>-390x844-<iteration>.png` |
| design QA | Gate 3: status colors are protected from decorative campaign styling |
