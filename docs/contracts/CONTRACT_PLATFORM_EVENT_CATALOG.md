# Contract Draft — Platform Event Catalog

> **ACCEPTED — DESIGN ONLY.** It documents the locked repository and proposed future contracts. Human acceptance of D2/E2/F2 records PASS for the focused review; it does not modify `OutboxEventType`, TypeScript, validators, producers, consumers, migrations, subscriptions, Providers, or runtime behavior.

Phase26 Gate record: G0 passed baseline/scope review; G1 is accepted; G2, G3 and G4 are **PASS WITH APPROVED DEFERRED DECISIONS**; G5 passed design review; and G6 passed because G1–G5 are signed off or covered by explicit human-approved deferrals. Those deferrals are exact retention/legal-hold/PII-redaction policy, initial subscriber allowlists, and the Notification/Marketing/Risk/BI product rules owned by their respective domains at the Phase 27/29/30/31 entry Gates. Deferral is not activation authority.

## 1. Catalog rules

### 1.1 Version notation

- `implicit-v0` means the current source event has no explicit envelope schema version. Its exact current payload shape is the compatibility contract; no ordered subscriber may infer fields that are not present.
- `v1-proposed` means a future contract only. It is not in `OutboxEventType`, has no producer, and cannot be subscribed to.
- A future explicit envelope must carry `schemaVersion`; ordered events also carry `aggregateVersion` or `sequence`.
- Consumers register one executable allowlist row for the exact `(city_code,subscriber_id,event_type,event_major_version)`. Version ranges are forbidden because ordinary MySQL uniqueness cannot reject overlapping ranges. Unknown major version, missing required field, payload hash conflict, or PII above the subscriber ceiling fails closed to a contract error/DLQ. The consumer must not acknowledge success or attempt a best-effort parse.
- A new major version creates a new paused allowlist row. Pause stops live materialization/claims and permits historical replay only with exact-version approval; revoke stops live work and replay. Major-version activation, retirement and replay never mutate another version row.

### 1.2 Payload and PII classes

| Code | Payload class | PII rule |
| --- | --- | --- |
| `LIFECYCLE` | Entity IDs, status and occurrence time | Usually P1; no contact/free text |
| `MONEY` | Amount/currency and financial state | P2-FIN; purpose-limited |
| `CONTENT-REF` | IDs/hash/type for content or evidence, never bytes/body | P1/P2 depending on linkability |
| `SUPPORT-META` | Ticket/conversation/message IDs, type/status/actor references, no message body | P1; Support access policy applies |
| `AUDIT` | Integrity snapshot/reference and decision metadata | P2-AUDIT; auditor/owner only |
| `PROJECTION` | Derived aggregate facts | P1 unless metric is sufficiently aggregated to P0 |

PII levels: P0 public/non-personal; P1 pseudonymous IDs/ordinary internal metadata; P2 contact/content/location/financial/audit-sensitive; P3 secrets, credentials, tokens, provider identifiers or evidence bytes. General platform payloads must not carry P3.

### 1.3 Retention classes

| Class | Meaning | Decision status |
| --- | --- | --- |
| `R1` | Operational lifecycle source/delivery evidence | Exact duration is an approved deferred decision owned by Operations/Privacy at the affected implementation entry Gate |
| `R2` | Financial, settlement, refund and immutable audit evidence | Exact duration/legal hold is an approved deferred decision owned by Finance/Legal/Audit at the affected implementation entry Gate |
| `R3` | Support/review/content-related metadata | Exact retention/redaction is deferred to the canonical domain and Privacy; it must not outlive source privacy/deletion policy |
| `R4` | Derived projection refresh/rebuild evidence | Exact window is deferred to source/Privacy/projection owners and remains bounded by source retention and reconciliation policy |

Source-event retention is set by the Producer and Privacy owner. Before a subscriber/version row is activated, that retention must cover candidate materialization, anti-join reconciliation, commit-skew/long-transaction overlap and incident recovery. Platform delivery cannot extend source PII retention unilaterally; insufficient coverage rejects the subscription or requires a separately approved minimum-data tombstone/redaction and reconciliation contract.

No numeric duration or purge is authorized by this draft. A non-terminal source work claim; eligible Enterprise Webhook delivery not materialized or non-terminal; missing/non-terminal platform delivery; unresolved source/enterprise/platform DLQ; active replay; reconciliation gap; legal hold; or FK dependency blocks source purge. Approved cleanup order is attempts → terminal Enterprise/platform deliveries → source → independently retained audit. FKs use `RESTRICT/NO ACTION` for source/delivery dependencies, and audit must never be cascade-deleted.

### 1.4 Ordering and idempotency notation

- `aggregate sequence` means only `city_code + aggregate_type + aggregate_id + explicit aggregateVersion/sequence`.
- All current `implicit-v0` rows are **unordered business events**; `(created_at,event_id)` is only a deterministic scan cursor.
- Every future subscriber uses durable unique `(subscriber_id,event_id)`. Producer idempotency/aggregate uniqueness remains additional and is recorded below.
- `created_at` is not a commit sequence. Candidate cursors cannot prove completeness because long transactions may commit behind them; repeated retained-source anti-join reconciliation finds exact subscriber/event/city delivery gaps, and unique `(subscriber_id,event_id)` makes repair idempotent.
- No catalog entry promises exactly-once delivery, cross-city/global order or cursor-based no-gap behavior.

## 2. Current source-event catalog

“Current subscriber/reader” distinguishes a work-claim consumer from a scoped reader. “Proposed allowed” is a design candidate, not authorization.

### 2.1 Order, payment, worker and fulfillment

| Producer | `event_type` | Version | Payload / PII | Aggregate; order key | City scope | Current subscriber/reader | Proposed allowed subscriber | Retention | Producer + consumer idempotency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Order | `order.created` | implicit-v0 | LIFECYCLE+amount / P1+P2-FIN | `order/orderId`; unordered v0 | real event city | **Dispatch work-claim**; Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI after accepted minimal view | R1 | source event ID + one order; target `(subscriber,event)` |
| No active producer found; union/builder only | `order.paid` | implicit-v0 | LIFECYCLE+amount / P1+P2-FIN | `order/orderId`; unordered v0 | real event city if produced | Enterprise allowlist exists but no current source producer | Notification/Risk/BI only after producer contract | R1/R2 | event ID; target `(subscriber,event)` |
| Payment | `payment.paid` | implicit-v0 | MONEY; contains provider trade number / **P3** | `payment_order/paymentOrderId`; unordered v0 | real event city | none through platform ledger | No general subscriber until payload is minimized/tokenized; Risk/BI via approved view | R2 | payment webhook/business idempotency + event ID; target `(subscriber,event)` |
| Worker Accept | `dispatch.accepted` | implicit-v0 | LIFECYCLE / P1 worker+order IDs | `dispatch_task/dispatchTaskId`; unordered v0 | real event city | none | Notification, Risk, BI | R1 | acceptance/dispatch uniqueness + event ID; target `(subscriber,event)` |
| Worker Accept | `fulfillment.created` | implicit-v0 | LIFECYCLE / P1 | `fulfillment/fulfillmentId`; unordered v0 | real event city | none | Notification, BI | R1 | fulfillment uniqueness + event ID; target `(subscriber,event)` |
| Fulfillment | `fulfillment.started` | implicit-v0 | LIFECYCLE / P1 | `fulfillment/fulfillmentId`; unordered v0 | real event city | Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI | R1 | event ID; target `(subscriber,event)` |
| Fulfillment | `fulfillment.completed` | implicit-v0 | LIFECYCLE; completion note may be P2 / P1+P2 | `fulfillment/fulfillmentId`; unordered v0 | real event city | **Ledger work-claim**; Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI after excluding completion note | R1/R2 | Ledger source uniqueness + target `(subscriber,event)` |
| Fulfillment Evidence | `fulfillment.evidence.created` | implicit-v0 | CONTENT-REF; provider envelope metadata, no bytes / P2 | `fulfillment/fulfillmentId`; unordered v0 | real event city | Enterprise Webhook for mapped enterprise orders | Notification/Risk only minimal reference; BI counts only | R3 | evidence/event ID; target `(subscriber,event)` |
| Fulfillment | `fulfillment.customer_confirmation.pending` | implicit-v0 | LIFECYCLE / P1 | `fulfillment_confirmation/confirmationId`; unordered v0 | real event city | none | Notification, BI | R1 | confirmation uniqueness + target `(subscriber,event)` |
| Fulfillment Evidence | `fulfillment.customer_confirmation.confirmed` | implicit-v0 | LIFECYCLE; customer/complaint refs / P1 | `fulfillment_confirmation/confirmationId`; unordered v0 | real event city | Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI | R1/R3 | confirmation CAS + target `(subscriber,event)` |
| Fulfillment Evidence | `fulfillment.customer_confirmation.disputed` | implicit-v0 | LIFECYCLE; customer/complaint refs / P1/P2 | `fulfillment_confirmation/confirmationId`; unordered v0 | real event city | Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI minimal only | R3 | confirmation CAS + target `(subscriber,event)` |

### 2.2 Settlement, refund and audit

| Producer | `event_type` | Version | Payload / PII | Aggregate; order key | City scope | Current subscriber/reader | Proposed allowed subscriber | Retention | Producer + consumer idempotency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Settlement Preparation | `settlement.prepared` | implicit-v0 | MONEY aggregate / P2-FIN | `settlement_batch/batchId`; unordered v0 | real event city | none | Risk/BI aggregate only | R2 | batch/source uniqueness + target `(subscriber,event)` |
| Settlement Confirmation | `settlement.confirmed` | implicit-v0 | MONEY aggregate / P2-FIN | `settlement_batch/batchId`; unordered v0 | real event city | none | Risk/BI aggregate only | R2 | confirmation/batch uniqueness + target `(subscriber,event)` |
| Settlement Payable | `settlement.payable` | implicit-v0 | MONEY aggregate / P2-FIN | `settlement_payable/payableId`; unordered v0 | real event city | none | Risk/BI aggregate only | R2 | payable/source uniqueness + target `(subscriber,event)` |
| Settlement Queue | `settlement.payable.queued` | implicit-v0 | MONEY aggregate / P2-FIN | `settlement_payable_queue/queueId`; unordered v0 | real event city | none | Risk/BI aggregate only | R2 | queue/payable uniqueness + target `(subscriber,event)` |
| Settlement Statement | `worker.receivable.statement.created` | implicit-v0 | MONEY+worker ID / P2-FIN | `worker_receivable_statement/statementId`; unordered v0 | real event city | none | Worker Notification; Risk/BI scoped aggregate | R2 | statement source uniqueness + target `(subscriber,event)` |
| Settlement Statement Review | `worker.receivable.statement.reviewed` | implicit-v0 | decision+worker ID / P2-FIN | `worker_receivable_statement_review/reviewId`; unordered v0 | real event city | none | Worker Notification; Risk/BI scoped aggregate | R2 | one review fact/event ID + target `(subscriber,event)` |
| Settlement Export | `worker.receivable.statement.exported` | implicit-v0 payload contains `payloadVersion=v1` but source envelope is unversioned | CONTENT-REF hash+worker ID / P2-FIN | `worker_receivable_statement_export/exportId`; unordered v0 | real event city | Settlement audit queries join source row as evidence | Notification only if product-approved; Risk/BI metadata only | R2 | export ID/content hash + target `(subscriber,event)` |
| Aftersale Refund | `refund.approved` | implicit-v0 | MONEY; payment/customer/worker linkage / P2-FIN | `refund/refundId`; unordered v0 | real event city | **Ledger work-claim** | Notification, Risk, BI via minimized payload | R2 | refund approval + Ledger source uniqueness + target `(subscriber,event)` |
| Ledger Audit Gate | `conflict_audit` | implicit-v0 | AUDIT snapshot/hash / P2-AUDIT | producer-selected ledger aggregate; unordered v0 | real event city | Ledger replay/immutability reader | Auditor/BI only aggregated; not Notification | R2 | deterministic audit event/snapshot hash + target `(subscriber,event)` |

### 2.3 Order reverse and aftersale

| Producer | `event_type` | Version | Payload / PII | Aggregate; order key | City scope | Current subscriber/reader | Proposed allowed subscriber | Retention | Producer + consumer idempotency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Order Reverse | `order.reverse.requested` | implicit-v0 | LIFECYCLE/reason refs / P1/P2 | reverse request; unordered v0 | real event city | none | Notification, Risk, BI minimal | R3 | reverse request/idempotency key + target `(subscriber,event)` |
| Order Reverse | `order.reverse.approved` | implicit-v0 | decision metadata / P1/P2 | reverse request; unordered v0 | real event city | none | Notification, Risk, BI minimal | R3 | reverse CAS + target `(subscriber,event)` |
| Order Reverse | `order.reverse.applied` | implicit-v0 | lifecycle result / P1/P2 | reverse request; unordered v0 | real event city | none | Notification, Risk, BI minimal | R3 | reverse application uniqueness + target `(subscriber,event)` |
| Aftersale | `aftersale.complaint.submitted` | implicit-v0 | case refs/type; no unrestricted content should fan out / P1/P2 | `aftersale_complaint/complaintId`; unordered v0 | real event city | Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI minimal | R3 | complaint ID/idempotency + target `(subscriber,event)` |
| Aftersale | `aftersale.complaint.resolved` | implicit-v0 | case decision refs / P1/P2 | `aftersale_complaint/complaintId`; unordered v0 | real event city | Enterprise Webhook for mapped enterprise orders | Notification, Risk, BI minimal | R3 | complaint version/CAS + target `(subscriber,event)` |
| Aftersale | `aftersale.repair.created` | implicit-v0 | repair/order/worker refs / P1 | repair task; unordered v0 | real event city | none | Notification, BI | R3 | repair ID + target `(subscriber,event)` |
| Aftersale | `aftersale.repair.completed` | implicit-v0 | repair result refs / P1/P2 | repair task; unordered v0 | real event city | none | Notification, Risk, BI | R3 | repair state/CAS + target `(subscriber,event)` |
| Aftersale | `aftersale.liability.decided` | implicit-v0 | liability decision / P2 | `aftersale_complaint/complaintId`; unordered v0 | real event city | none | Notification minimal, Risk, BI aggregate | R3/R2 | one accepted decision/version + target `(subscriber,event)` |
| Aftersale | `aftersale.compensation.approved` | implicit-v0 | MONEY+case refs / P2-FIN | compensation intent; unordered v0 | real event city | none | Notification, Risk, BI minimal | R2 | compensation decision ID + target `(subscriber,event)` |

### 2.4 Support

Support Outbox payloads must remain metadata-only. Ticket description, comments, message text, KB article text, CSAT free text, bot transcripts and secrets are never general fan-out payloads.

| Producer | `event_type` | Version | Payload / PII | Aggregate; order key | City scope | Current subscriber/reader | Proposed allowed subscriber | Retention | Producer + consumer idempotency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Support Ticket | `support.ticket.created` | implicit-v0 | SUPPORT-META requester/actor refs / P1 | `support_ticket/ticketId`; ticket `version` exists in payload but is not envelope sequence | real event city | none | Notification, Risk, BI | R3 | ticket create key + target `(subscriber,event)` |
| Support Ticket | `support.ticket.assigned` | implicit-v0 | SUPPORT-META / P1 | `support_ticket/ticketId`; payload version field may order ticket lifecycle after future contract | real event city | none | Notification, BI | R3 | ticket CAS/idempotency + target `(subscriber,event)` |
| Support Ticket | `support.ticket.escalated` | implicit-v0 | SUPPORT-META / P1/P2 | `support_ticket/ticketId`; unordered envelope v0 | real event city | none | Notification, Risk, BI | R3 | ticket CAS/idempotency + target `(subscriber,event)` |
| Support Ticket | `support.ticket.resolved` | implicit-v0 | SUPPORT-META / P1 | `support_ticket/ticketId`; unordered envelope v0 | real event city | none | Notification, BI | R3 | ticket CAS/idempotency + target `(subscriber,event)` |
| Support Ticket | `support.ticket.reopened` | implicit-v0 | SUPPORT-META / P1/P2 | `support_ticket/ticketId`; unordered envelope v0 | real event city | none | Notification, Risk, BI | R3 | ticket CAS/idempotency + target `(subscriber,event)` |
| Support Ticket | `support.ticket.closed` | implicit-v0 | SUPPORT-META / P1 | `support_ticket/ticketId`; unordered envelope v0 | real event city | none | Notification, BI | R3 | ticket CAS/idempotency + target `(subscriber,event)` |
| Support SLA | `support.sla.breached` | implicit-v0 | SUPPORT-META due time/priority / P1 | `support_ticket/ticketId`; unordered v0 | real event city | none | Notification, Risk, BI | R3 | SLA breach idempotency key + target `(subscriber,event)` |
| Support Conversation | `support.conversation.started` | implicit-v0 | SUPPORT-META / P1 | `support_conversation/conversationId`; unordered v0 | real event city | none | Notification, Risk, BI counts | R3 | conversation create key + target `(subscriber,event)` |
| Support Conversation | `support.conversation.transferred` | implicit-v0 | SUPPORT-META / P1 | `support_conversation/conversationId`; unordered v0 | real event city | none | Notification, Risk, BI counts | R3 | conversation version/CAS + target `(subscriber,event)` |
| Support Conversation | `support.conversation.closed` | implicit-v0 | SUPPORT-META / P1 | `support_conversation/conversationId`; unordered v0 | real event city | none | Notification, BI counts | R3 | conversation version/CAS + target `(subscriber,event)` |
| Support Conversation | `support.message.created` | implicit-v0 | CONTENT-REF message ID/sequence/type; no text / P1 | `support_message/messageId`; conversation sequence is payload metadata | real event city | none | Notification only under anti-spam policy; BI counts | R3 | client message ID/server sequence + target `(subscriber,event)` |
| Support Quality | `support.csat.submitted` | implicit-v0 | score/fingerprint/ticket refs / P2 | `support_csat/csatId`; unordered v0 | real event city | none | Risk optional, BI aggregate only | R3 | submission key/fingerprint + target `(subscriber,event)` |
| Support Quality | `support.quality.reviewed` | implicit-v0 | quality scores/target refs / P2-AUDIT | quality review; unordered v0 | real event city | none | Risk, BI aggregate, auditor | R3 | review fingerprint/version + target `(subscriber,event)` |
| Support Bot | `support.bot.handed_off` | implicit-v0 | SUPPORT-META reason refs / P1/P2 | bot run/conversation reference; unordered v0 | real event city | none | Notification, Risk, BI counts | R3 | bot run/trigger key + target `(subscriber,event)` |

## 3. Proposed future events — not implemented

These names and payload sketches require producer-owner, privacy, TypeScript, validator, migration and gate approval in their owning later Phase. They must not be emitted or consumed now.

| Proposed producer | Proposed `event_type` | Version | Minimal payload / PII | Aggregate and sequence | Candidate subscribers | Retention/idempotency |
| --- | --- | --- | --- | --- | --- | --- |
| Existing Review writer | `review.created` | v1-proposed | review ID, order ID, worker ID, rating, visibility, occurredAt; **no comment** / P1 | `order_review/reviewId`, `aggregateVersion=1` | Reputation projection; Notification only if product-approved; Risk; BI aggregate | R3; source unique city+order, target `(subscriber,event)` |
| Review moderation owner | `review.visibility.changed` | v1-proposed | review ID, from/to visibility, reason code, decision ID/time; no comment / P1/P2 | `order_review/reviewId`, monotonically increasing version | Reputation, Notification optional, BI | R3; review decision/version + target `(subscriber,event)` |
| Review reply owner | `review.reply.recorded` | v1-proposed | review/reply IDs, author role/ID, visibility; no reply body / P1 | `order_review/reviewId`, version | Notification, moderation projection | R3; one reply command key + target `(subscriber,event)` |
| Review appeal owner | `review.appeal.decided` | v1-proposed | review/appeal/decision IDs, outcome/reason code/time / P1/P2 | `order_review/reviewId`, version | Reputation, Notification, Risk | R3; appeal decision/version + target `(subscriber,event)` |
| Reputation projection | `reputation.snapshot.updated` | v1-proposed | worker ID, projection revision, counts/bands, source watermark; no raw comments / P1 | `worker_reputation/workerId`, projection revision | Worker read surface, Dispatch **read only after separate eligibility decision**, BI | R4; projection generation+watermark, target `(subscriber,event)` |
| Notification | `notification.in_app.created` | v1-proposed | notification ID, recipient type/ID, template key, source event ID; no rendered sensitive body / P1 | `notification/notificationId`, version | Notification read model/audit only | R3; recipient+source+template uniqueness |
| Notification | `notification.read_state.changed` | v1-proposed | notification ID, recipient ID, read flag/time, version / P1 | `notification/notificationId`, version | Notification projection, BI aggregate only | R3; CAS/version + target `(subscriber,event)` |
| Marketing quote decision | `marketing.discount.decision.issued` | v1-proposed | decision ID, city, customer pseudonym, SKU, discount amount/reason, expiry, rule revision / P1+P2-FIN | `discount_decision/decisionId`, version | Quote orchestration only; Risk/BI after approval | R2; request fingerprint+decision revision |
| Marketing coupon | `marketing.coupon.reserved` | v1-proposed | reservation/coupon grant/order refs, expiry/version / P1 | `coupon_reservation/reservationId`, version | Quote/Order orchestration, Notification, Risk | R2/R3; grant+order active reservation uniqueness |
| Marketing coupon | `marketing.coupon.redeemed` | v1-proposed | reservation/redemption/order refs, amount, version / P1+P2-FIN | `coupon_reservation/reservationId`, version | Notification, Risk, BI | R2; one redemption per reservation |
| Marketing coupon | `marketing.coupon.released` | v1-proposed | reservation/order refs, reason code/version / P1 | `coupon_reservation/reservationId`, version | Notification optional, Risk, BI | R2; CAS/version |
| Risk-Control | `risk.case.opened` | v1-proposed | case ID, subject reference, rule IDs, severity, evidence refs; no raw payload / P2-AUDIT | `risk_case/caseId`, version | Admin manual-review projection, Support handoff, BI aggregate | R2; case fingerprint+rule revision |
| Risk-Control | `risk.case.reviewed` | v1-proposed | case/decision IDs, outcome, reason code, reviewer ID/time / P2-AUDIT | `risk_case/caseId`, version | Support handoff, Notification if approved, BI aggregate | R2; review command key+CAS |
| Analytics/BI | `analytics.projection.refreshed` | v1-proposed | metric/read-model ID, city, window, watermark, freshness state, row count/hash / P1 or P0 aggregate | `bi_projection/projectionId`, revision | Dashboard readiness/operations only | R4; projection+window+watermark uniqueness |

`reputation.snapshot.updated` does not authorize a direct Worker profile or dispatch-eligibility write. Any future Dispatch use requires a separate contract specifying whether and how a read-only reputation band can influence eligibility.

## 4. Payload minimization and access

1. Source producers include only fields needed by registered subscriber purposes.
2. Subscriber-specific sensitive enrichment is a guarded read from the canonical domain after authorization; it is not copied into the general delivery row.
3. The platform delivery ledger references source `(city_code,event_id)` and stores routing/version/hash metadata, not a second unrestricted payload copy.
4. P2 requires an explicit subscriber allowlist, purpose, retention class, audit trail and city scope. P3 is rejected from general delivery.
5. Review comments, Support text, addresses, phones, precise coordinates, evidence bytes/URLs, tokens, secrets and Provider response bodies are excluded.
6. Analytics receives aggregates or approved pseudonymous dimensions, never unrestricted source payload dumps.

## 5. Compatibility and fail-closed evolution

- New optional fields may be added only when old consumers ignore them safely and the catalog revision records the change.
- Removing/renaming fields, changing units/meaning, changing PII level, aggregate identity or ordering creates a new major schema version.
- Producers publish only versions present in the shared type/validator catalog accepted by all registered subscribers.
- A subscriber encountering an unknown version records `UNSUPPORTED_EVENT_VERSION`, does not invoke business logic, and moves through bounded retry/DLQ according to policy.
- A known event type with an invalid payload is `INVALID_EVENT_PAYLOAD`, not an empty/default object.
- Catalog/handler deployment order is expand first: approve and activate a new exact-major allowlist row → deploy producer → observe candidate scans and retained-source reconciliation → retire the old major only after delivery/replay/retention conditions pass.
- Rollback returns the producer to the last accepted version while subscribers retain dual-version readers for the compatibility window.

## 6. Current-consumer isolation rule

No proposed subscriber may call the source `claimEventsByType` path. The source row has one shared lifecycle/completion state, at most one active lease at a time and potentially multiple sequential retry claims; competing workers are not separate subscribers. Dispatch and Ledger retain their existing claims. Enterprise Webhook retains its local enterprise delivery ledger. New subscribers become eligible only after the ADR's additive platform delivery ledger, exact-major allowlist, retained-source reconciliation, durable target idempotency, retention/FK and city/PII gates are independently authorized, implemented and verified.

Before any corresponding subscriber or Provider activation, the owning Phase must confirm exact retention, legal hold, PII redaction/tombstone, the initial subscriber/event/exact-major-version/PII allowlist and applicable product rules. Phase 27–31 entry must repeat this check. A material ADR, catalog or migration-ledger change reopens affected G2/G5 review and impacted test-matrix rows. No proposed subscriber, event or Provider in this catalog is production-ready or implemented.
