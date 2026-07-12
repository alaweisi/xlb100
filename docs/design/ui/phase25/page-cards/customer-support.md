# Customer — Support

| Field | Contract |
| --- | --- |
| route / role | `/customer/support` / customer |
| visual source | Customer liquid-glass PNG extension; Phase 24 flow |
| workflow / API source | ticket, conversation, message, reopen, and CSAT bindings through `@xlb/api-client` |
| states | empty, open, assigned, realtime, resolved, reopened, error |
| actions | create ticket/conversation, send message, reopen, submit CSAT where allowed |
| constraints | customer/city scope and Phase 24 workflow rules; no invented agent, reply, or resolution facts |
| components | Customer shell, cards, forms, status tags, state components |
| viewport / evidence | 390×844; `evidence/customer/customer-support-<state>-390x844-<iteration>.png` |
| design QA | Gate 3: state feedback is legible with fallbacks for reduced motion and contrast modes |
