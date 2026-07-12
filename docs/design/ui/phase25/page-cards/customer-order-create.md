# Customer — Create order

| Field | Contract |
| --- | --- |
| route / role | `/customer/order/create` / customer |
| visual source | Customer liquid-glass PNG extension; Figma CreateOrder workflow |
| workflow / API source | quote and order bindings through `@xlb/api-client` |
| states | invalid, quoting, quote ready, submitting, created, error |
| actions | choose real SKU, quantity, address, schedule, request quote, create order |
| constraints | authenticated customer and city scope; authoritative quote only; no payment/provider claim |
| components | Customer template, form fields, quote card, timeline, action dock, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-order-create-<state>-390x844-<iteration>.png` |
| design QA | Gate 3: readable glass form layers and protected focus/status semantics |
