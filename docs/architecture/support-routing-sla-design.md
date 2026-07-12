# Phase 24C — Support Routing / SLA / Agent Workbench Design

## 1. Status and evidence baseline

This document is the Phase 24C Phase 0 design output. It contains no runtime,
migration, API, or UI implementation.

- Phase 24B is locked by tag `xlb-phase24b-support-ticket-mvp`.
- Current latest migration is `047_phase24b_support_ticket_mvp.sql`; execution
  must re-check the migration head before creating the next append-only file.
- Locked facts are migration 047, `CONTRACT_SUPPORT_TICKETS.md`, and the actual
  `backend/src/support/ticket/` implementation.
- Phase 24C is limited to `routing` and `agentWorkbench`. It does not enter
  conversation/WebSocket, bot, knowledge-base, quality, CSAT, or OA scheduling.

## 2. Repository discoveries

### 2.1 Existing job mechanism

`backend/src/jobs/autoRun.ts` is the only recurring background-task entry. It
uses `setInterval`, an environment switch, a fixed city list, and an in-process
`isRunning` flag. It is disabled in tests and production examples currently
describe it as demo-only. There is no cron service, independent job daemon, or
distributed scheduler.

The reusable production-grade concurrency primitive is the database claim
pattern in `backend/src/events/eventOutbox.ts`: `FOR UPDATE SKIP LOCKED`, owner
and token CAS, lease expiry, bounded retries, and recovery. Phase 24C will reuse
the auto-run run-once lifecycle but must implement an independent ticket SLA
claim/CAS inside the Support repository. It must not use `event_outbox` as a
delayed-command queue or change its published semantics.

### 2.2 Existing Admin identity

`admin_users` is the canonical identity table. `admin_city_scopes` is the
canonical city authorization table; `city_scopes_json` is not an authorization
source. `admin_users.role` is a `VARCHAR`, and JWT role claims may remain valid
for up to the token lifetime, so sensitive Support writes must re-read the
current database role instead of relying only on the token claim.

Support agents therefore use a new business-profile table with foreign keys to
the existing identity and city-scope tables. Phase 24C does not add a parallel
login, password, JWT, or global `support_agent` role.

### 2.3 Locked ticket compatibility

Migration 047 already contains `assigned_agent_id`,
`assigned_skill_group_id`, both SLA due timestamps, `first_responded_at`, and
queue/SLA indexes. Only `assigned_agent_id` and `first_responded_at` currently
have write behavior.

`assigned_agent_id` and API `assignedAgentId` are locked as an
`admin_users.id`, not a future `support_agents.agent_id`. Phase 24C keeps that
meaning. Agent profiles are resolved using `(city_code, admin_user_id)`.

The current default list is stable keyset pagination by
`(created_at DESC, ticket_id DESC)`. It remains unchanged for the locked 24B
API. SLA workbench ordering receives an explicit new sort mode and a versioned
cursor; an old cursor is never reinterpreted as an SLA cursor.

## 3. Scope

Phase 24C delivers:

- city-scoped agent profiles bound to current Admin/Operator identities;
- city-scoped skill groups and agent membership;
- automatic type/language skill-group selection for new tickets;
- city-scoped SLA policies and immutable due-time snapshots on new tickets;
- skill-group-aware manual assignment and a CAS public-pool claim action;
- first-response semantics suitable for SLA measurement;
- bounded SLA breach polling with observable ticket event and Outbox facts;
- Admin workbench views for mine, skill-group pool, and scoped supervision.

Phase 24C explicitly excludes:

- realtime IM, WebSocket, Redis presence fanout, and transfers (24D);
- bot/NLU and knowledge base (24E);
- CSAT, quality review, and quality analytics (24F);
- shift scheduling, attendance, payroll, or OA integration;
- payment, refund, payout, worker-finance approval, dispatch mutation, ledger,
  settlement, and any protected-domain state transition.

## 4. Data model

All tables are real-city business tables. `city_code='__global__'` is rejected.
Phase 24C does not support global SLA rows: service expectations and staffing
are city-owned configuration, and the project architecture requires business
data to remain city scoped. Phase 24C measures 24×7 elapsed minutes from the
database clock; business calendars, holidays, shifts, and paused clocks are not
implemented in this phase.

### 4.1 `support_agents`

| Column | Design |
|---|---|
| `agent_id` | String profile ID; primary key plus unique `(city_code,agent_id)` |
| `city_code` | Real city; FK to `cities` and CHECK not `__global__` |
| `admin_user_id` | Existing `admin_users.id`; never a new login identity |
| `display_name` | Workbench display name, bounded length |
| `lifecycle_status` | `active` or `suspended`; Support-profile business eligibility only |
| `work_status` | `offline`, `online`, or `busy`; manually managed in 24C |
| `version` | Optimistic concurrency for profile updates |
| `created_at/updated_at` | Millisecond audit timestamps |

Constraints:

- UNIQUE `(city_code,admin_user_id)`.
- FK `admin_user_id -> admin_users.id`.
- Composite FK `(admin_user_id,city_code) ->
  admin_city_scopes(admin_user_id,city_code)` with RESTRICT deletion.
- FK columns must exactly match the parent `VARCHAR(64)` type and
  `utf8mb4_unicode_ci` collation.
- Creating or activating a profile re-reads `admin_users.role` and accepts only
  `admin` or `operator`. A `__global__` scope alone is not enough: a person must
  have an explicit real-city scope to become that city's agent.
- `work_status` is not realtime presence and is not an authentication revocation
  signal. Realtime presence belongs to 24D.
- `lifecycle_status=suspended` does not revoke Admin login or city authorization;
  the existing Auth system remains the only authentication/authorization source.

Profile management requires verified `appType=admin`, a fresh database role of
`admin`, and the existing target-city access guard. Operators may read their own
profile and workbench but cannot administer profiles. Auditor is read-only and
cannot be an agent. Assignment, claim, and other sensitive writes also re-read
the current database role and explicit real-city scope.

### 4.2 `support_skill_groups`

| Column | Design |
|---|---|
| `skill_group_id` | String ID; primary key and unique city composite key |
| `city_code` | Real city |
| `name` | City-unique bounded name |
| `matched_types_json` | Non-empty canonical array of locked ticket types |
| `matched_languages_json` | Canonical language tags; empty means language-neutral |
| `priority_weight` | Deterministic tie-break weight, bounded integer |
| `is_default` | City fallback group marker |
| `is_active` | Routing eligibility |
| `version` | CAS for configuration updates |
| `created_at/updated_at` | Audit timestamps |

The Phase 1 prompt limits the first migration to three tables, so the MVP uses
strict JSON arrays instead of adding a fourth type-mapping table. Validators
reject unknown types, duplicate values, invalid language tags, expressions, and
unbounded arrays. A stored generated column
`active_default_guard = CASE WHEN is_default=1 AND is_active=1 THEN city_code
ELSE NULL END` plus UNIQUE `(active_default_guard)` permits at most one active
default group per city. A default group must be language neutral.

The earlier Phase 24A blueprint mentioned `source_scope`. Phase 24C
intentionally routes by city, type, and optional language only, matching the
approved construction prompt. Customer and Worker tickets of the same type use
the same group unless a later additive contract explicitly introduces source
routing.

### 4.3 `support_agent_skill_groups`

| Column | Design |
|---|---|
| `city_code` | Real city |
| `agent_id` | Composite FK to `support_agents` |
| `skill_group_id` | Composite FK to `support_skill_groups` |
| `proficiency` | Bounded integer used only as a deterministic tie-break |
| `is_primary` | Primary group hint |
| `created_at` | Audit timestamp |

Primary key is `(city_code,agent_id,skill_group_id)`. All references are
same-city and deletion is RESTRICT while active assignments depend on them.

### 4.4 `support_sla_policies`

| Column | Design |
|---|---|
| `policy_id` | String ID; primary key and unique city composite key |
| `city_code` | Real city; never `__global__` |
| `type` | Existing locked Support ticket type |
| `priority` | Existing locked Support priority |
| `first_response_minutes` | Positive bounded integer |
| `resolution_minutes` | Positive and not shorter than first response |
| `effective_from/effective_to` | Effective window; end is optional |
| `is_active` | Configuration state |
| `version` | Admin CAS |
| `policy_series_id` / `revision` | Stable policy series and append-only revision number |
| `supersedes_policy_id` | Nullable self-reference to the previous revision |
| `created_at/updated_at` | Audit timestamps |

The service rejects overlapping active windows for the same
`(city_code,type,priority)`. Each configuration transaction first locks the
stable parent city row with `SELECT city_code FROM cities WHERE city_code=? FOR
UPDATE`, then re-queries the effective windows before insert/update. This also
serializes the empty-key case where no policy row exists yet. A policy PATCH
validates the active revision's expectedVersion, closes its effective window,
and inserts a new `policy_id`/revision linked by `supersedes_policy_id`; it does
not overwrite the old timing values. Policy edits affect only tickets created
after the edit, and due timestamps already stored on a ticket never move.

The Phase 24A blueprint also mentioned `source` and configurable
`escalation_priority`. Phase 24C deliberately omits both: SLA selection is
city/type/priority only, and breach escalation uses the fixed audited one-step
ladder. Source-specific timing or configurable escalation requires a later
additive design and migration.

Every city must retain an active fallback policy represented by
`type=other, priority=normal`. Policy management refuses to disable the last
fallback. If configuration is unexpectedly absent, ticket creation remains
available and uses an emergency conservative fallback of 240 minutes first
response and 2,880 minutes resolution, while emitting a structured error metric
and log. This fallback is disaster behavior, not a normal operating policy.

### 4.5 Required ticket and event additions

Migration 047 is immutable. A later append-only migration must add:

- `sla_first_response_breached_at TIMESTAMP(3) NULL`;
- `sla_resolution_breached_at TIMESTAMP(3) NULL`;
- `routing_language VARCHAR(32) NULL`.

These markers make repeated polling idempotent and indexable. It must also add
dedicated indexes for both scans, subject to EXPLAIN confirmation:

- `(city_code,status,first_responded_at,sla_first_response_breached_at,
  sla_first_response_due_at,ticket_id)`;
- `(city_code,status,sla_resolution_breached_at,sla_resolution_due_at,ticket_id)`.

Migration 047's event CHECK and current TypeScript union do not include
`claimed` or `sla_breached`. The append-only migration must drop and recreate
that named CHECK with those two additive values. The same change must update
`SupportTicketEventType`, validators, contract/runtime validation, and contract
tests. Existing event rows and meanings remain unchanged.

The Outbox closed set must add `support.sla.breached` with a minimal city/ticket,
breach-kind, due-time, and old/new-priority payload. Claim continues to publish
the existing `support.ticket.assigned` fact, so consumers do not receive a
duplicate lifecycle event name.

Policy ID is
recorded in the locked ticket `created` event payload together with the selected
minutes and skill-group decision, so no mutable policy FK is required on the
ticket. `routing_language` stores the canonical optional
`preferredLanguage`; create idempotency replay compares it together with the
locked request fields. Reusing an idempotency key with a different language
returns 409 even if both languages happen to select the same group. Existing
24B tickets remain NULL. No columns are added for realtime presence or
conversation state.

Candidate migration sequence, subject to re-checking the head immediately
before execution:

1. `048`: agents, skill groups, memberships, same-city constraints;
2. `049`: SLA policy revisions, routing language, and routing/SLA query indexes;
3. `050`: required breach markers, first-response/resolution scan indexes, and
   additive ticket-event CHECK expansion; EXPLAIN validates final index order.

## 5. Routing algorithm

Routing is deterministic and city local:

1. Load active groups for the ticket city whose canonical type array contains
   the ticket type.
2. When `preferredLanguage` is present, retain exact-language groups first; if
   none exist, retain language-neutral groups.
3. When `preferredLanguage` is absent, retain language-neutral groups only.
4. If those eligible sets are empty—including when type groups exist but all
   require another language—use the city's active language-neutral default.
5. If no default exists, leave `assigned_skill_group_id=NULL`, write the
   fallback decision into the created event payload, and allow supervisor
   assignment. Ticket creation must not fail because staffing configuration is
   incomplete.
6. Break ties by `priority_weight DESC`, then `skill_group_id ASC`.

Language preference is optional and canonicalized as a BCP-47-like bounded
tag. Phase 24C adds optional `preferredLanguage` to
`CreateSupportTicketRequest`; omission preserves every 24B caller. It is routing
metadata only, is not accepted from an identity header, and Phase 24C adds no
language detection.

Routing and ticket insert happen in the same transaction. Idempotent create
replay returns the original routing/SLA snapshot rather than re-running current
configuration.

## 6. SLA selection and first-response semantics

Policy lookup order is:

1. exact `(city,type,priority)` effective policy;
2. city fallback `(other,normal)` policy;
3. emergency 240/2,880-minute application fallback with an error signal.

Ticket due times are calculated from the database transaction timestamp and
stored once in the existing 047 columns. Policy changes never update historical
tickets. Existing 24B tickets with NULL group/SLA remain NULL and display
“无技能组 / 无 SLA”; Phase 24C does not bulk backfill them.

The locked implementation currently marks first response on the first Admin
comment even when visibility is `internal`. Phase 24C corrects the prospective
rule: only an Admin/Operator agent message visible to the requester
(`requester` or `all`) counts as first response. Assignment and internal notes
do not count. The author must have a current real-city role/scope and active
Support profile, but need not already be the assigned agent; this permits an
active supervisor to provide a valid first response. Existing non-null
timestamps are not rewritten as a compatibility
and audit policy: locked historical facts remain as originally recorded even
though their events could be examined during a separate reconciliation audit.

## 7. Assignment and claim compatibility

The existing `/assign` action remains the supervisor/manual assignment and
reassignment API. `assignedAgentId` continues to carry `admin_users.id`.

- If `assigned_skill_group_id` is non-null, the assignee must have an active
  Support profile in the ticket city and an active membership in that group.
- If the ticket has no skill group, the locked 24B free-assignment behavior is
  retained only by waiving Support-profile and group-membership requirements.
  Every assignee must still be revalidated as a current `admin` or `operator`
  with an explicit scope row for the ticket's real city; `__global__` alone is
  insufficient. This closes the current implementation gap without changing
  the locked `assignedAgentId` value meaning.

Public-pool claiming is a separate endpoint:

`POST /api/internal/support/tickets/:ticketId/claim`

Body: `{ expectedVersion, idempotencyKey }`. The target admin user ID is derived
from verified RequestContext and the active Support profile; clients cannot
claim on behalf of another agent.

The final update requires city, ticket, expected version,
`assigned_agent_id IS NULL`, status in
`open|processing|waiting_requester|escalated`, an active Support profile with
`work_status=online`, a non-null assigned skill group, and active membership in
that group. Busy/offline/suspended agents and ungrouped fallback tickets cannot
use public-pool claim; ungrouped tickets require supervisor assignment. Exactly
one concurrent claimant succeeds. A loser receives 409 and writes no ticket
event or Outbox row. Success writes the new `claimed` ticket event and the
existing `support.ticket.assigned` Outbox fact in the same transaction.

## 8. SLA breach polling

Phase 24C chooses database polling, not a delayed queue:

- ticket status, first-response state, and breach markers change after creation;
- due timestamps are immutable snapshots, so a queued delayed command can still
  become stale when the ticket is responded to or resolved;
- migration 047 already has an SLA scan index;
- delayed commands would need cancellation/staleness handling and would mix
  commands with the factual Outbox stream.

The existing auto-run lifecycle gains a Support SLA run-once step and explicit
configuration. Production enablement must be a deployment decision; the
current demo-only default cannot be presented as production ready.

For each configured city, bounded batch transactions select overdue, unmarked
tickets using `FOR UPDATE SKIP LOCKED` and the database clock.

First-response eligibility is: due time non-null and due, `first_responded_at`
null, first-response breach marker null, and status not `resolved` or `closed`.
Resolution eligibility is: resolution due time non-null and due, resolution
breach marker null, and status not `resolved` or `closed`. Phase 24C does not
implement paused SLA accounting, so `waiting_requester` continues toward the
resolution deadline; pause calendars require a later explicit contract.

To avoid missing a breach between polling ticks, the requester-visible first
response and resolve/close mutation paths call the same breach service before
committing when their database timestamp is later than the applicable due time.
Polling never retroactively changes an already terminal ticket; mutation-time
catch-up records the breach before that terminal transition.

For a client mutation with `expectedVersion`, the transaction locks the ticket
and validates that client version exactly once before catch-up. If a breach is
then recorded, the service reloads and carries the new internal version into the
remaining response/resolve/close update. The same overdue request must not make
itself stale; a version mismatch observed before catch-up still returns 409 with
no breach, domain mutation, event, or Outbox write.

For each eligible row the transaction atomically:

1. marks the relevant breach timestamp;
2. raises priority one step (`low→normal→high→urgent→critical`), with critical
   remaining critical;
3. increments ticket version;
4. appends one `sla_breached` ticket event with breach kind and old/new
   priority;
5. appends one `support.sla.breached` Outbox fact.

The two breach kinds use separate markers and deterministic idempotency keys.
Each kind may raise priority once, so a ticket that breaches both first response
and resolution may rise by two total steps. Terminal tickets are never raised.
No process-local `isRunning` claim is treated as multi-instance safety. Small
batches, short lock waits, a per-city processing budget, and a rotating start
city reduce—but cannot eliminate—the starvation risk of the current serial
city loop.

## 9. Agent workbench API

Configuration APIs are Admin-only and city scoped:

| Method/path | Request/response contract | Authorization |
|---|---|---|
| `GET /api/internal/support/agents` | bounded filters + cursor → profiles | Admin; Operator own profile only |
| `POST /api/internal/support/agents` | admin user, display name, status, idempotency key → profile | current DB Admin + target-city guard |
| `PATCH /api/internal/support/agents/:id` | mutable fields + expectedVersion → profile | current DB Admin + target-city guard |
| `GET/POST/PATCH /api/internal/support/skill-groups[/:id]` | cursor or versioned configuration → group | read Admin/Operator; writes current DB Admin |
| `PUT/DELETE /api/internal/support/skill-groups/:id/agents/:agentId` | expected versions/idempotency → membership result | current DB Admin |
| `GET/POST/PATCH /api/internal/support/sla-policies[/:id]` | effective filters or versioned policy → policy | read Admin/Operator; writes current DB Admin |
| `GET /api/internal/support/tickets` | locked list plus explicit workbench view/sort cursor → tickets | scoped Admin/Operator/Auditor read matrix |
| `POST /api/internal/support/tickets/:id/claim` | expectedVersion + idempotencyKey → ticket/event | active online member, server-derived identity |

All mutation responses are backend-confirmed, use expectedVersion where the
resource is mutable, and reject stale versions with no partial write.

Workbench list keeps the locked list endpoint compatible and adds explicit
filters. Omitting both `view` and `sort` preserves the exact 24B city-wide
Admin/Operator/Auditor read behavior, `created_desc` order, and legacy cursor.
Explicit view authorization is:

| View | Admin | Operator | Auditor |
|---|---|---|---|
| `mine` | own assigned tickets; active profile required | own assigned tickets; active profile required | rejected |
| `skill_group` | own active groups' unassigned tickets | own active groups' unassigned tickets | rejected |
| `all` | city-wide read | city-wide read, preserving 24B | city-wide read-only |

Additional filters and sorts are:

- `view=mine`: `assigned_agent_id` is derived from RequestContext user ID;
- `view=skill_group`: unassigned tickets in the agent's active groups;
- filters for group, status, type, priority, overdue state, and due range;
- `sort=created_desc` preserves 24B behavior;
- `sort=sla_due` orders due time ascending with NULL last, then priority business
  rank descending, created time ascending, and ticket ID ascending.

All SLA presentation and filtering uses one `effectiveDue` expression:

- while `first_responded_at IS NULL`, use `sla_first_response_due_at` when
  present, otherwise use `sla_resolution_due_at`;
- after first response, use `sla_resolution_due_at`;
- if the selected value is NULL, the ticket is non-SLA and sorts last.

`overdue`, due-range filters, cursor `dueAt`, and UI colors all use this value
and the database clock. `overdue` means `effectiveDue <= now`; `near_due` means
greater than now and within 30 minutes; otherwise the color is normal.

SLA cursors are opaque, versioned, and bind a filter fingerprint plus
`dueAt/priorityRank/createdAt/ticketId`. A cursor for another view, sort, city,
or filter set is rejected. Queries fetch `limit+1` rows to calculate
`nextCursor` without the current exact-full-last-page ambiguity.

The Admin UI provides “分配给我”, “技能组公海”, and scoped “全部” tabs,
claim/assign actions, real pagination, and SLA normal/near-due/overdue colors.
Threshold colors are presentation only; database due timestamps remain the
truth.

## 10. Tests and gates

Phase 24C implementation must include:

- unit: routing specificity/tie-breaks, policy fallback/effective windows,
  priority escalation, cursor encode/decode and filter binding;
- contract: types/validators/API client/Outbox closed-set alignment;
- integration: profile and membership CRUD, cross-group assignment rejection,
  legacy ungrouped assignment, SLA snapshots, policy-change immutability,
  first-response visibility, breach processing;
- concurrency: two claimants yield one success; multi-worker SLA polling emits
  one fact per breach kind;
- security: cross-city, `__global__`, auditor mutation, stale JWT role, client-
  supplied mine identity, and protected-domain writes are rejected;
- migration: fresh/replay, 000–047 checksums unchanged, composite same-city FKs,
  historical NULL tickets accepted;
- performance: EXPLAIN evidence for mine/group/SLA scans and bounded batch time;
- E2E: Admin configures group/policy, Customer creates routed ticket, two agents
  contend to claim, winner responds, and SLA state is visible;
- gates: Phase 24C boundary, migration replay, focused tests, build/typecheck,
  browser flow, preflight, and critical dependency audit.

## 11. Historical data policy

- Do not backfill 24B NULL skill-group or SLA fields.
- Do not rewrite existing first-response timestamps.
- Do not reinterpret `assigned_agent_id` as `support_agents.agent_id`.
- Before any optional FK from tickets to agent profiles, audit existing non-null
  assignments. Phase 24C does not require that FK because locked ungrouped
  tickets must retain free-assignment compatibility.

## 12. Decisions requiring human confirmation

Approval of this Phase 0 design confirms:

1. SLA policies are strictly real-city scoped; no `__global__` policy rows.
2. Existing tickets are not bulk backfilled for skill group or SLA.
3. `assignedAgentId` remains an Admin user ID; profiles bind by
   `(city_code,admin_user_id)`.
4. Internal notes do not count as first response for new Phase 24C behavior.
5. SLA uses bounded DB polling with Support-owned claim/CAS, not a delayed
   Outbox queue.
6. Work status is manual 24C state; realtime presence remains in 24D.
7. Routing and SLA are not source-specific in 24C; the fixed one-step breach
   ladder replaces configurable `escalation_priority`.
8. SLA is 24×7 elapsed minutes; business calendars and paused waiting time are
   outside this phase.
9. Optional `preferredLanguage` is persisted as canonical routing metadata and
   participates in create-idempotency replay comparison.
10. SLA configuration uses append-only policy revisions, and every workbench
    SLA sort/filter/color uses the single documented `effectiveDue` rule.

Phase 24C Phase 1 must not begin until these decisions receive explicit human
approval.
