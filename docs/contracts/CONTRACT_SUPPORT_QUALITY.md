# Support Quality Contract — Phase 24F

Phase 24F owns CSAT and internal quality facts only. It never mutates Worker, Order, Payment, Dispatch, Aftersale, Ledger, Settlement or Refund state.

- `POST /api/support/tickets/:ticketId/csat`
- `POST /api/support/conversations/:conversationId/csat`

Body: `{score:1..5, comment?:string<=1000, idempotencyKey}`. Identity and city are derived from RequestContext. Only the closed target's Customer/Worker requester may submit. One target has one immutable CSAT; identical replay is stable and competing submissions return 409.

- `POST /api/internal/support/quality/rubrics`: Admin with explicit city scope; criteria weights total 100.
- `POST /api/internal/support/quality/reviews`: closed target, immutable rubric snapshot/hash, server-calculated score, no self-review.
- `GET /api/internal/support/quality/dashboard`: Admin, explicit city, bounded to persisted Support aggregates.

Internal Outbox events are `support.csat.submitted` and `support.quality.reviewed`. Payloads exclude comments, requester identity, findings, transcripts and rubric JSON. They are not enterprise webhook events and do not authorize Worker-domain effects.

Migration `053_phase24f_support_quality.sql` is append-only. Migration 024 remains a permanent gap.
