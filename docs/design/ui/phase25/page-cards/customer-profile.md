# Customer — Profile

| Field | Contract |
| --- | --- |
| route / role | `/customer/profile` / customer |
| visual source | Customer liquid-glass PNG extension; Figma profile workflow |
| workflow / API source | profile and address bindings through `@xlb/api-client` |
| states | loading, display, editing, invalid, saving, saved, error |
| actions | edit profile; create, update, and delete address through existing guards |
| constraints | authenticated identity and city-scoped address records; no fabricated profile facts |
| components | Customer template, cards, form fields, actions, status and error states |
| viewport / evidence | 390×844; `evidence/customer/customer-profile-<state>-390x844-<iteration>.png` |
| design QA | Gate 3: maintain 44px touch targets and fixed safe-area navigation |
