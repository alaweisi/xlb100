# Customer — Support

| Field | Contract |
| --- | --- |
| route / role | `/customer/support` / customer |
| visual source | Inherit `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`: warm cream canvas, dark ink-green hierarchy, orange primary actions, stable Apple-service cards, and Liquid Glass only on interaction layers |
| workflow / API source | Phase 24 ticket, conversation, message, reopen, and CSAT bindings through `@xlb/api-client`; server-confirmed results remain authoritative |
| states | initial loading, empty, open, processing, waiting requester, escalated, resolved, reopened, closed, queueing, active, transferred, offline/error, retry, disabled, and confirmed success |
| actions | create ticket, open ticket, refresh, add requester-visible comment, reopen resolved ticket, submit 1–5 CSAT for closed ticket, create/open conversation, and send message |
| constraints | customer/city scope and Phase 24 workflow rules; no invented agent, reply, status, resolution, or success facts; preserve draft content after failed submission |
| components | Customer shell, customer service hero, glass segmented control, stable ticket/conversation cards, status tags, timeline, message layer, composer, persistent result feedback, and shared state components |
| responsive behavior | single-column mobile flow at 390 px; card/list content wraps without tables or horizontal scrolling; touch actions preserve the shared minimum target |
| accessibility | explicit control labels, semantic tabs/panels/lists/timeline, live result messaging, disabled reasons, reduced-motion fallback, forced-colors borders, and keyboard-visible shared focus treatment |
| viewport / evidence | 390×844; `evidence/customer/customer-support-<state>-390x844-<iteration>.png` |
| design QA | Gate 4 C4: compare rendered ticket and conversation states against the frozen Customer home visual truth before local commit |

## Material hierarchy

- Stable business content uses opaque/warm service cards.
- Liquid Glass is limited to the sticky service switch and message/composer docks where depth communicates interaction.
- Orange is reserved for primary actions and progress anchors; dark ink green carries headings and trust cues.
- Ticket and conversation lifecycle labels map directly from Phase 24 server statuses.
