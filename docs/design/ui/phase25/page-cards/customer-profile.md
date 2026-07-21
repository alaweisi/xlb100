# Customer — Profile

| Field | Contract |
| --- | --- |
| route / role | `/customer/profile` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; current profile/address contract controls workflow |
| workflow / API source | profile and address bindings through `@xlb/api-client` |
| states | loading, ready, empty address, profile validation/saving/success, address editing/validation/saving/success, delete confirmation, recoverable error/conflict |
| actions | save the customer name; create, update, and explicitly confirm deletion of a city-scoped address through the existing API guards |
| constraints | authenticated identity and server-returned masked phones remain authoritative; editing requires protected phone re-entry; city scope and idempotency are retained; no fabricated profile facts |
| components | single Customer shell, warm-white service cards, orange primary actions, Liquid Glass bottom sheet/confirmation modal, form fields, status tags, empty/loading/error/success states |
| viewport / evidence | 320/390/430 responsive QA; `evidence/customer/customer-profile-ready-390x844-b5-01.png`, `customer-profile-addresses-390x844-b5-01.png`, `customer-profile-address-editor-390x844-b5-01.png`, `customer-profile-home-comparison-390x844-b5-01.png` |
| design QA | P5-B5 passed: inherits the Customer Home warm-white, forest/orange, service-card and Liquid Glass language without copying its layout; single shell, 44px targets, focus, reduced motion, forced colors, no overflow, no engineering copy and console cleanliness verified |
| evidence report | `customer-profile-390x844-b5-01.report.json` |
