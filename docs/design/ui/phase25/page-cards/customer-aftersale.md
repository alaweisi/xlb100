# Customer — Aftersale

| Field | Contract |
| --- | --- |
| route / role | `/customer/aftersale` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`; Phase 17 contract controls workflow |
| workflow / API source | Phase 17 reverse, complaint, and evidence bindings through `@xlb/api-client` |
| states | no-order, loading, validation, submitting, requested/submitted, rejected, applied/resolved, evidence pending/confirmed/disputed, error |
| actions | request cancellation/reschedule, complaint, note, and eligible evidence action |
| constraints | Phase 17 state machine and audit semantics are unchanged; no fabricated resolution |
| components | Customer shell, cards, forms, status tags, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-aftersale-<state>-390x844-<iteration>.png` |
| design QA | Gate 4 B4: operational status remains higher priority than glass decoration; passed 320/390/430 overflow, 44px touch target, focus, reduced-motion, forced-colors, console, and homepage comparison checks |
| evidence | `customer-aftersale-ready-390x844-b4-01.png`, `customer-aftersale-decision-390x844-b4-01.png`, `customer-aftersale-home-comparison-390x844-b4-01.png`, `customer-aftersale-390x844-b4-01.report.json` |
