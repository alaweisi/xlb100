# Customer — Aftersale

| Field | Contract |
| --- | --- |
| route / role | `/customer/aftersale` / customer |
| visual source | Customer liquid-glass PNG extension; Phase 17 flow |
| workflow / API source | Phase 17 reverse, complaint, and evidence bindings through `@xlb/api-client` |
| states | guarded, actionable, reviewing, repair, resolved, closed |
| actions | request cancellation/reschedule, complaint, note, and eligible evidence action |
| constraints | Phase 17 state machine and audit semantics are unchanged; no fabricated resolution |
| components | Customer shell, cards, forms, status tags, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-aftersale-<state>-390x844-<iteration>.png` |
| design QA | Gate 3: operational status remains higher priority than glass decoration |
