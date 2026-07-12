# Phase 24B Support Ticket Contract

## Scope and ownership

Phase 24B introduces a city-scoped support ticket resource. It owns intake,
requester-visible communication, assignment metadata and ticket lifecycle. It
does not own complaint adjudication, repair, liability, compensation, refund,
payment, dispatch, ledger or settlement state.

Phase 17 remains the source of truth for aftersale complaints. A support ticket
may reference `linkedAftersaleComplaintId`, but a Support repository must never
write an `aftersale_*` table. Such a reference also requires `relatedOrderId`,
and both references must resolve in the ticket city.

## Identity and city boundary

- `cityCode`, `requesterId`, `source`, and (for enterprise callers)
  `businessClientId` are derived from the verified `RequestContext`. They are
  never accepted from a requester create body.
- A Worker caller creating `type=withdrawal_issue` is automatically bound to
  `relatedWorkerId=context.userId` by the service. The client does not need to
  send `relatedWorkerId`, and any supplied worker relation remains subject to
  exact verified-identity and same-city authorization.
- Customer and worker callers share `/api/support/tickets`; authorization uses
  the verified `appType`, role, requester identity and city, not caller input.
- Requesters can read and mutate only their own tickets in their own city.
- Admin/operator access is limited to its verified city scope. An auditor is
  read-only.
- Requester event reads exclude `visibility=internal`. This is a service-level
  invariant, not a UI filtering convention.

## Closed enumerations

| Name | Values |
|---|---|
| source | `customer`, `worker`, `enterprise`, `admin`, `system` |
| type | `order_question`, `order_dispute`, `service_complaint`, `withdrawal_issue`, `account_issue`, `safety`, `other` |
| priority | `low`, `normal`, `high`, `urgent`, `critical` |
| status | `open`, `processing`, `waiting_requester`, `escalated`, `resolved`, `closed` |
| event type | `created`, `commented`, `assigned`, `status_changed`, `escalated`, `resolved`, `reopened`, `closed` |
| actor type | `customer`, `worker`, `admin`, `operator`, `system`, `bot` |
| visibility | `requester`, `internal`, `all` |

The canonical TypeScript definitions are exported from `@xlb/types`; strict
runtime schemas are exported from `@xlb/validators`.

## Request contracts

All JSON request schemas are strict: unknown properties are rejected.

- Create: `{ type, priority, subject, description, relatedOrderId?,
  relatedWorkerId?, linkedAftersaleComplaintId?, preferredLanguage?,
  idempotencyKey }`.
  `subject` is 1–160 characters, `description` is 1–10,000 characters, and
  `idempotencyKey` is 8–128 characters. For a Worker `withdrawal_issue`, the
  service derives `relatedWorkerId` from the verified context even when the
  optional field is omitted.
  `preferredLanguage` is optional 2–32 character BCP-47-like routing metadata.
  It is trimmed and canonicalized to lowercase `routingLanguage`, persists on
  the ticket, and participates in create-idempotency comparison. It is not an
  identity or authorization input.
- Requester comment: `{ content, idempotencyKey }`. Visibility is assigned by
  the service and cannot be supplied by a requester.
- Admin comment: `{ content, visibility, idempotencyKey }`.
- Reopen: `{ reason?, idempotencyKey }`.
- Assign: `{ assignedAgentId, expectedVersion, idempotencyKey }`.
  During 24B, `assignedAgentId` is a verified admin/operator user ID; the
  `support_agents` binding belongs to 24C.
- Escalate: `{ reason, expectedVersion, idempotencyKey }`.
- Resolve: `{ resolutionCode, resolutionNote?, expectedVersion,
  idempotencyKey }`.
- Close: `{ reason?, expectedVersion, idempotencyKey }`.

`expectedVersion` is a non-negative integer used for compare-and-swap. A stale
version returns HTTP 409 and must not append an event or Outbox row.

## State machine

```text
open -> processing -> waiting_requester -> processing
open|processing|waiting_requester -> escalated -> processing
processing|escalated -> resolved -> closed
resolved -> processing
```

The final transition is reopen. Every successful lifecycle change and its
`support_ticket_events` record are committed in one transaction. Resolved and
closed tickets require `resolutionCode` and `resolvedAt`; only closed tickets
have `closedAt`. Illegal transitions return HTTP 409.

## HTTP resources

Requester routes:

| Method | Route | Response |
|---|---|---|
| POST | `/api/support/tickets` | `SupportTicketResponse` |
| GET | `/api/support/tickets` | `SupportTicketListResponse` |
| GET | `/api/support/tickets/:ticketId` | `SupportTicketDetailResponse` |
| POST | `/api/support/tickets/:ticketId/events` | `SupportTicketMutationResponse` |
| POST | `/api/support/tickets/:ticketId/reopen` | `SupportTicketMutationResponse` |

Admin/operator routes:

| Method | Route | Response |
|---|---|---|
| GET | `/api/internal/support/tickets` | `SupportTicketListResponse` |
| GET | `/api/internal/support/tickets/:ticketId` | `SupportTicketDetailResponse` |
| POST | `/api/internal/support/tickets/:ticketId/assign` | `SupportTicketMutationResponse` |
| POST | `/api/internal/support/tickets/:ticketId/events` | `SupportTicketMutationResponse` |
| POST | `/api/internal/support/tickets/:ticketId/escalate` | `SupportTicketMutationResponse` |
| POST | `/api/internal/support/tickets/:ticketId/resolve` | `SupportTicketMutationResponse` |
| POST | `/api/internal/support/tickets/:ticketId/close` | `SupportTicketMutationResponse` |

`SupportTicketResponse` is `{ ok: true, ticket }`.
`SupportTicketListResponse` is `{ ok: true, tickets, nextCursor }`.
`SupportTicketDetailResponse` is `{ ok: true, detail: { ticket, events } }`.
`SupportTicketMutationResponse` is
`{ ok: true, ticket, event, idempotent }`.

From Phase 24C Phase 2, ticket responses expose nullable `routingLanguage`.
New-ticket creation snapshots automatic skill-group routing and SLA due times.
Policy changes never recalculate an existing ticket, and Phase 24B historical
NULL routing/SLA values are not backfilled.

Lists use a bounded `limit` of 1–100 and an opaque cursor. Admin filters may
include `source`, `type`, `priority`, `status`, `requesterId`,
`relatedOrderId`, and `assignedAgentId`. Requester filters do not expand the
ownership scope.

## Idempotency and API Client retry

Create and every POST mutation require an idempotency key. The uniqueness
scope includes the verified city/source/requester (and enterprise client where
applicable), resource/action and idempotency key. Reuse with a different
canonical request payload returns HTTP 409.

`@xlb/api-client` enables idempotent POST retry only for calls whose request
type requires `idempotencyKey`. GET remains safe to retry. No support POST
without such a key may set `retry: "idempotent"`.

The Customer and Worker APIs export:
`createSupportTicket`, `listSupportTickets`, `getSupportTicket`,
`addSupportTicketComment`, and `reopenSupportTicket`.

The Admin API exports:
`listSupportTickets`, `getSupportTicket`, `assignSupportTicket`,
`addSupportTicketComment`, `escalateSupportTicket`, `resolveSupportTicket`, and
`closeSupportTicket`.

Critical create/list/detail/mutation responses are runtime-validated by the
client; malformed success responses become `ApiClientError` with
`kind=response_format`.

## Outbox facts

The closed `OutboxEventType` and validator include:

- `support.ticket.created`
- `support.ticket.assigned`
- `support.ticket.escalated`
- `support.ticket.resolved`
- `support.ticket.reopened`
- `support.ticket.closed`

Each successful fact is written atomically with the ticket/event mutation.
Support events are internal by default and are not implicitly added to the
enterprise webhook allowlist. Payloads must contain only the documented
minimal `SupportTicketOutboxEventPayload`; credentials, tokens, raw contact
details and unrestricted message content are forbidden.
