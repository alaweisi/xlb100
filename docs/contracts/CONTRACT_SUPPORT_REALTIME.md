# Phase 24D Support Realtime Contract

## Boundary

Phase 24D provides city-scoped Customer/Worker/Admin conversations, durable ordered messages, REST fallback, one-time WebSocket tickets and reconnect catch-up. MySQL is authoritative; Redis fanout and presence are non-durable hints. No Bot/KB, CSAT/quality, external IM provider, or protected-domain mutation is included.

## Closed values

- source: `customer|worker|enterprise` (24D UI opens customer/worker only)
- status: `queueing|active|transferred|closed`
- participant: `customer|worker|agent`
- message sender: `customer|worker|agent|system`
- message type: `text|image|system`
- Outbox: `support.conversation.started|transferred|closed`, `support.message.created`

All resources derive city and requester identity from verified RequestContext. Customer/Worker access is ownership/membership scoped; Admin/Operator requires explicit city scope and an active Support profile. Auditor is REST read-only.

## REST

Requester:

- `POST /api/support/conversations`
- `GET /api/support/conversations`
- `GET /api/support/conversations/:id`
- `GET|POST /api/support/conversations/:id/messages`
- `POST /api/support/conversations/:id/read`
- `POST /api/support/realtime-ticket`

Admin:

- `GET /api/internal/support/conversations`
- `GET /api/internal/support/conversations/:id`
- `GET|POST /api/internal/support/conversations/:id/messages`
- `POST /api/internal/support/conversations/:id/accept|transfer|close`

POST mutations use strict bodies, idempotency keys and CAS where state changes. Message identity is `(city,conversation,clientMessageId)` and retries return the original message. List limits are 1–100 and cursors bind city and filters. Message catch-up uses increasing `serverSeq` and `afterSeq`.

## WebSocket

An authenticated REST call issues a CSPRNG opaque, single-use ticket with a 60-second expiry. JWT is never placed in the URL. `GET /api/support/realtime?ticket=...` consumes the Redis ticket atomically; Redis failure fails closed.

Protocol version is exactly `1`. Client frames are `subscribe`, `send_message`, `mark_read`, `ping`; server frames are `ready`, `catchup`, `message_created`, `conversation_updated`, `message_ack`, `error`, `pong`. WebSocket and REST send call the same idempotent message service. Reconnect always resumes from MySQL using `afterSeq`; Pub/Sub does not imply durability or exactly-once delivery.

## Privacy and Provider truthfulness

Outbox and Redis payloads contain IDs, sequence and routing metadata only—never message text, media bytes, JWT or connection tickets. Image storage remains private local/mock and reports `externalProviderExecuted=false`. The self-hosted realtime envelope must not claim a third-party provider.
