# Phase 24F — CSAT, Quality Review, and Support Operations Closure Design

## 1. Status and source-of-truth baseline

This document is a Phase 24F design candidate only. It does not authorize
runtime code, schema, API, UI, seed, or Outbox changes.

The implementation branch must re-read `docs/CURRENT_STATE.md`, the locked
Phase 24C–24E tags, their migrations, and their final contracts before writing
code. At design time the repository migration head is the in-progress Phase
24C migration `050_phase24c_support_sla_breach_workbench.sql`; Phase 24D and
24E are not yet locked. Therefore Phase 24F does not reserve a numeric
migration. Its candidate filename is:

`<next_after_locked_phase24e>_phase24f_support_quality.sql`

Migration `024` is a permanent historical gap and must never be used. Phase 24F
does not create Phase 25 or reorganize Phase 0–23.

Existing facts that this design preserves:

- `support_tickets` owns Support lifecycle and requester ownership; Phase 17
  remains the owner of complaint, repair, liability, compensation, reverse,
  and refund facts.
- `support_agents.assigned_agent_id` resolves through existing Admin identity;
  Phase 24F does not create another login or role system.
- Phase 24D conversation IDs, closed-state semantics, and participant ownership
  must be taken from its locked contract rather than inferred from the Phase
  24A blueprint.
- CSAT is a Support-owned satisfaction fact. It is not an `order_reviews` row.
- All side effects use the transactional Outbox and all Support business data
  is scoped to a real city, never `__global__`.

## 2. Scope and explicit exclusions

Phase 24F delivers:

- one requester-owned CSAT submission for an eligible closed ticket or closed
  conversation;
- versioned quality rubrics and an immutable rubric snapshot on every submitted
  quality review;
- city-scoped quality review queues and corrective-action tracking;
- Admin dashboards for CSAT, review coverage, SLA correlation, and open quality
  actions;
- minimal internal Outbox facts for CSAT, completed reviews, and quality-action
  lifecycle;
- privacy, ownership, role, city, idempotency, and concurrency enforcement.

Phase 24F does not implement:

- payroll, attendance, shifts, HR discipline, commissions, worker penalties,
  or automatic agent compensation changes;
- changes to Worker ratings, levels, certification, dispatch ranking, finance,
  settlement, payment, refund, or ledger state;
- sentiment/NLU scoring, generative review, or an external AI provider;
- arbitrary report SQL, unbounded export, raw message bulk export, or a new
  analytics platform;
- reopening or mutating Phase 17 complaint facts;
- enterprise webhook publication merely because an internal Support event
  exists.

## 3. Identity, ownership, and eligibility

### 3.1 CSAT submitter

The service derives `cityCode`, requester type, requester ID, and enterprise
tenant (when a later approved enterprise route exists) from verified
`RequestContext`. None is accepted in the request body.

The Phase 24F MVP exposes authenticated Customer and Worker submission through
their existing Support API surface. Admin, operator, auditor, bot, and system
identities cannot submit requester CSAT. Enterprise submission is disabled
until the locked Phase 24D/24E line provides a tenant-authenticated Support
requester route; an Admin acting for an enterprise is not ownership.

For a ticket target, all of the following must hold in one transaction:

1. the ticket exists in the verified real city;
2. `ticket.source` matches the caller application (`customer` or `worker`);
3. `ticket.requester_id` equals the verified caller ID;
4. the ticket status is exactly `closed` and `closed_at` is non-null;
5. the ticket has no existing CSAT row;
6. the supplied idempotency key has not been used with different canonical
   content.

For a conversation target, the equivalent locked Phase 24D ownership and
participant rules apply. The conversation must be exactly closed and the caller
must be its requester, not merely a historical agent participant. Phase 24F
must not weaken the Phase 24D membership guard.

`resolved` is not eligible: it can still be reopened. Closing is the stable
survey boundary. A target closed before Phase 24F may be rated; no bulk CSAT
rows are generated. A configurable submission window may be added only as an
explicit city policy with a documented default; the MVP recommendation is 30
days from `closed_at`, evaluated using the database clock.

### 3.2 Uniqueness and replay

One closed target has at most one effective CSAT record for its lifetime. CSAT
is immutable after accepted submission; there is no edit endpoint. A privacy
erasure workflow may redact comment text while retaining score and aggregate
facts, but cannot silently replace the score.

The database enforces target uniqueness independently of idempotency:

- UNIQUE `(city_code, ticket_id)` where `ticket_id` is nullable;
- UNIQUE `(city_code, conversation_id)` where `conversation_id` is nullable;
- CHECK that exactly one target FK is non-null;
- same-city composite FKs to the target tables;
- UNIQUE `(city_code, requester_type, requester_id, idempotency_key)`.

An identical idempotent replay returns the original record. Reuse of the key
with a different target, score, or canonical comment returns 409. Two different
keys racing for the same target produce exactly one success; the unique target
constraint is translated to a stable 409 response.

## 4. Candidate data model

Every table contains `city_code VARCHAR(64) NOT NULL`, a FK to `cities`, and a
CHECK rejecting `__global__`. IDs follow the existing string-ID convention and
timestamps use `TIMESTAMP(3)`. JSON fields are parsed by strict validators and
have bounded size; they are never executable expressions.

### 4.1 `support_csat_records`

| Column | Design |
|---|---|
| `csat_id` | Primary ID plus UNIQUE `(city_code,csat_id)` |
| `city_code` | Verified real city |
| `ticket_id` / `conversation_id` | Exactly one same-city target |
| `requester_type` | Closed enum: `customer`, `worker`, optionally later `enterprise` |
| `requester_id` | Verified requester snapshot; never supplied by body |
| `business_client_id` | Nullable tenant snapshot; required for an eventual enterprise submitter |
| `score` | Integer 1–5 |
| `comment` | Nullable, trimmed, maximum 1,000 characters |
| `related_worker_id` | Nullable read-only snapshot from the ticket, not a Worker mutation |
| `assigned_agent_admin_id` | Nullable Support assignment snapshot for stable reporting |
| `assigned_skill_group_id` | Nullable Support routing snapshot |
| `closed_at_snapshot` | Target close time used for eligibility/audit |
| `idempotency_key` / `request_fingerprint` | Replay and mismatch detection |
| `submitted_at` / `created_at` | Database-clock audit times |
| `comment_redacted_at` / `comment_redacted_by` | Nullable controlled privacy erasure audit |

No raw message transcript, phone, address, credential, or unrestricted target
payload is copied into the CSAT row.

### 4.2 `support_quality_rubrics`

| Column | Design |
|---|---|
| `rubric_id` | City-scoped rubric series ID |
| `name` / `description` | Bounded Admin metadata |
| `status` | `draft`, `published`, `archived` |
| `current_version` | Published version pointer for selection only |
| `created_by_admin_id` / `updated_by_admin_id` | Existing Admin identity |
| `version` | CAS for series metadata |
| audit timestamps | Database clock |

Names are unique within a city. Archiving prevents new reviews but never
changes historical snapshots.

### 4.3 `support_quality_rubric_versions`

| Column | Design |
|---|---|
| `rubric_version_id` | Immutable version ID |
| `city_code` / `rubric_id` / `version_number` | Same-city parent and unique monotonic version |
| `criteria_json` | Canonical ordered criteria: stable key, label, description, integer weight, score bounds |
| `maximum_score` | Fixed numeric denominator |
| `content_hash` | Hash of canonical criteria JSON |
| `created_by_admin_id` / `published_by_admin_id` | Existing Admin identities |
| `created_at` / `published_at` | Audit timestamps |

Weights must be positive and total exactly 100. Criterion keys are unique and
bounded. A published version is immutable; change creates the next version.
No delete is allowed while a review references the version.

### 4.4 `support_quality_reviews`

| Column | Design |
|---|---|
| `quality_review_id` | City-scoped review ID |
| `ticket_id` / `conversation_id` | Exactly one same-city target |
| `reviewer_admin_id` | Verified current Admin reviewer |
| `reviewed_agent_admin_id` / `reviewed_skill_group_id` | Target snapshots |
| `rubric_version_id` | Same-city immutable version reference |
| `rubric_snapshot_json` / `rubric_content_hash` | Exact criteria used for this review |
| `criterion_scores_json` | Strict keyed scores and bounded evidence references |
| `overall_score` | Server-calculated decimal 0–100; never accepted as authoritative client input |
| `finding` | Bounded internal finding, maximum 4,000 characters |
| `status` | `draft`, `submitted`, `voided` |
| `idempotency_key` / `request_fingerprint` | Submit replay protection |
| `version` | Draft CAS |
| `submitted_at` / audit timestamps | Database clock |

The rubric snapshot is captured when the draft is created and revalidated by
hash at submission. Later rubric publication cannot alter the review score.
Submitted reviews are immutable. A correction requires an Admin to void the
review with an audit reason and create a new review linked by nullable
`supersedes_quality_review_id`; at most one non-voided submitted review may be
active per target. This active-target rule is enforced with generated nullable
guard columns plus unique indexes, not process-local checking.

The reviewer cannot review their own handled target when
`reviewer_admin_id == reviewed_agent_admin_id`; the service rechecks this under
the target lock. Only a current DB-role `admin` with explicit real-city scope
can create, submit, or void a review. Operators may read only reviews about
their own agent profile with requester identity, CSAT comment, internal finding,
and transcript-sensitive evidence redacted. Auditors retain scoped read-only
access and cannot write reviews.

### 4.5 `support_quality_actions`

This table closes an operational quality loop without becoming an OA or HR
system.

| Column | Design |
|---|---|
| `quality_action_id` | City-scoped ID |
| `quality_review_id` | Same-city submitted review |
| `assigned_admin_id` | Admin responsible for follow-up |
| `action_type` | `coaching`, `process_fix`, `knowledge_gap`, `routing_followup` |
| `status` | `open`, `in_progress`, `completed`, `waived` |
| `summary` / `resolution_note` | Bounded internal text |
| `due_at` / `completed_at` | Operational dates |
| `created_by_admin_id` / `completed_by_admin_id` | Audit identities |
| `version` / audit timestamps | CAS and database clock |

Actions cannot impose Worker penalties, change agent employment facts, alter
pay, or mutate ticket/conversation state. Completion requires a resolution
note; waiver requires a reason. All mutations use expected version and
idempotency.

## 5. Service and API contracts

Implementation belongs under `backend/src/support/quality/` and follows
RequestContext → real CityCode → strict Contract → ownership/role Guard.
Applications consume it only through `@xlb/api-client`.

Requester resources:

| Method/path | Contract |
|---|---|
| `POST /api/support/tickets/:ticketId/csat` | `{score, comment?, idempotencyKey}`; closed owner only |
| `GET /api/support/tickets/:ticketId/csat` | Own CSAT or 404; never another requester's record |
| `POST /api/support/conversations/:conversationId/csat` | Same rules after locked Phase 24D route reconciliation |
| `GET /api/support/conversations/:conversationId/csat` | Closed conversation requester only |

Admin quality resources:

| Method/path | Purpose |
|---|---|
| `GET/POST /api/internal/support/quality/rubrics` | Scoped list/create |
| `POST /api/internal/support/quality/rubrics/:id/versions` | Create immutable next version |
| `POST /api/internal/support/quality/rubrics/:id/versions/:versionId/publish` | Publish with CAS/idempotency |
| `GET/POST /api/internal/support/quality/reviews` | Queue/list and draft creation |
| `GET/PATCH /api/internal/support/quality/reviews/:id` | Detail and draft CAS update |
| `POST /api/internal/support/quality/reviews/:id/submit` | Calculate and freeze score |
| `POST /api/internal/support/quality/reviews/:id/void` | Audited correction path |
| `GET/POST /api/internal/support/quality/actions` | List/create corrective actions |
| `PATCH /api/internal/support/quality/actions/:id` | CAS status transition |
| `GET /api/internal/support/quality/dashboard` | Bounded aggregate dashboard |

All list resources use bounded keyset pagination and opaque versioned cursors
that bind city, filters, role view, and sort. Mutation bodies are strict and
unknown fields are rejected.

## 6. Transaction and concurrency rules

- CSAT creation locks the target, checks ownership/closed eligibility using the
  database clock, inserts CSAT, and appends Outbox in one transaction.
- Review draft creation locks its target and selected rubric version. Submit
  validates expected version once, recomputes the score server-side from the
  stored snapshot, freezes the row, optionally creates required low-score
  actions, and appends Outbox atomically.
- Rubric publication locks the rubric series row so two publishers cannot
  create the same version or current pointer.
- Action transition uses CAS; a stale completion returns 409 and appends no
  event.
- Database unique constraints are the final concurrency authority. In-memory
  locks or UI button disabling are not correctness mechanisms.

The design recommends a city-configured low-quality threshold defaulting to 70
only if Phase 24F adds a Support-owned policy row. It must not be hard-wired to
worker penalties or payroll. If policy configuration is deferred, action
creation remains an explicit Admin decision.

## 7. Outbox contracts and Worker feedback boundary

Candidate additive closed event types:

- `support.csat.submitted`
- `support.quality.reviewed`
- `support.quality.action.created`
- `support.quality.action.completed`

They require matching changes in `@xlb/types`, validators, runtime payload
validation, contract tests, and event dictionaries. Each is written in the same
transaction as its aggregate mutation and is internal by default.

Minimal payloads:

- CSAT: `csatId`, `cityCode`, `targetType`, `targetId`, `score`, nullable
  `relatedWorkerId`, nullable `assignedAgentAdminId`, `submittedAt`.
- Review: `qualityReviewId`, `cityCode`, `targetType`, `targetId`, nullable
  `reviewedAgentAdminId`, `overallScore`, `rubricVersionId`, `submittedAt`.
- Action: `qualityActionId`, `qualityReviewId`, `cityCode`, `actionType`,
  `status`, and the relevant created/completed timestamp.

Payloads exclude CSAT comments, requester IDs, message text, transcript,
findings, rubric JSON, contact data, tokens, and credentials.

`support.csat.submitted` is the only Phase 24F feedback signal involving a
related Worker. Support never writes a Worker table. A Customer CSAT linked to
a worker does not automatically change worker rating, level, dispatch rank,
certification, penalty, earnings, or finance. If the Worker domain later elects
to consume this internal fact, it must use its own city-scoped receipt/inbox,
define its own approved policy, and remain the sole owner of any Worker-domain
effect. A Worker who is the requester is rating Support service, not themselves.

No new Support event is automatically added to enterprise webhook allowlists.

## 8. Admin dashboard and review queue

### 8.1 Bounded dashboard query

`GET /api/internal/support/quality/dashboard` accepts:

- required/derived city scope;
- `from` and `to`, maximum 90-day range;
- optional ticket type, source, skill group, assigned agent, and target type;
- `groupBy=day|ticket_type|source|skill_group|agent` from a closed enum.

It returns bounded aggregate series only:

- CSAT response count, eligible closed-target denominator, response rate,
  average score, and 1–5 distribution;
- quality review count, eligible handled-target denominator, review coverage,
  average review score, and below-threshold count;
- open/overdue/completed corrective-action counts;
- SLA-breached versus non-breached CSAT aggregates when due/breach facts exist;
- requester-type split without requester IDs.

The service uses parameterized whitelisted query builders, never client SQL or
column names. Aggregates suppress groups below a documented small-count
threshold (recommended `<5`) for operator-facing views. Admin/auditor exports,
if later approved, require a separate bounded contract and audit event.

### 8.2 Detail queues

- CSAT queue: submitted-desc cursor; filters for score, target, agent, group,
  and date. Raw comment requires Admin or Auditor scoped access.
- Review sampling queue: closed tickets/conversations not actively reviewed,
  with filters for SLA breach, CSAT band, agent, group, type, and closed date.
  Sampling is deterministic from persisted facts; it does not claim statistical
  randomness unless a tested sampling algorithm is added.
- Review queue: status then due/created cursor; operators see only their own
  redacted result view.
- Action queue: open/in-progress first, `due_at ASC`, NULL last, unique ID
  tie-breaker.

Dashboards do not read protected-domain repositories. Related order, complaint,
or Worker facts require an approved read facade or event projection; missing
facades display unavailable rather than trigger direct joins/writes.

## 9. Privacy, security, and retention

- Cross-city reads return 404 where resource existence must be hidden; role
  failures return the repository-standard 403. A global Admin scope alone does
  not substitute for explicit real-city scope on sensitive writes.
- CSAT comment and quality finding are internal sensitive text. They never enter
  logs, metrics labels, Outbox payloads, URL query strings, or list cursors.
- Requester list/detail APIs never expose rubric, review, action, internal
  finding, or another requester's CSAT.
- Operators cannot browse other agents' raw comments or reviews. Self views are
  redacted and exclude requester identity and transcript evidence.
- Reviewer evidence references use Support-owned message/event IDs and are
  resolved through the owning service guard. Raw transcript duplication into
  JSON is forbidden.
- Retention must be explicit before implementation. Recommended defaults are:
  retain numeric aggregate facts for audit, retain raw CSAT comment and quality
  finding for 365 days, then redact text with an auditable job. These defaults
  are not active until policy and legal review approve them.
- Free text receives the existing size/encoding controls and output escaping.
  Formula/export injection protections are mandatory if a later export exists.

## 10. Migration and rollout strategy

1. After Phase 24E final Lock, discover the real migration head. Create only
   the next append-only migration; never edit 000 through the locked head and
   never fill 024.
2. Add quality tables, same-city FKs, XOR checks, generated active-review
   guards, unique idempotency/target constraints, and city-leading indexes.
3. Add contracts/types/validators before backend routes, then API Client and
   UI. Do not copy contracts into apps.
4. Existing closed tickets and conversations become eligible read targets but
   receive no synthetic CSAT or quality rows. Historical assignments remain
   nullable snapshots.
5. Enable requester CSAT first, then review/rubric operations, then actions and
   dashboard. Each surface is feature-flagged fail-closed until its gate passes.
6. Explain-plan tests must verify dashboard/date/group indexes against seeded
   representative volume before Lock.

Candidate indexes include:

- CSAT `(city_code,submitted_at,csat_id)`,
  `(city_code,assigned_agent_admin_id,submitted_at,csat_id)`, and
  `(city_code,assigned_skill_group_id,submitted_at,csat_id)`;
- reviews `(city_code,status,created_at,quality_review_id)`,
  `(city_code,reviewed_agent_admin_id,submitted_at,quality_review_id)`;
- actions `(city_code,status,due_at,quality_action_id)`;
- rubric versions `(city_code,rubric_id,version_number)` unique.

Final index order is contingent on real `EXPLAIN ANALYZE` evidence.

## 11. Test matrix

### Unit

- CSAT score/comment canonicalization and 30-day eligibility boundary;
- rubric criteria uniqueness, weight total, score bounds, canonical hash;
- server-side weighted-score calculation and rounding;
- review/action state machines and forbidden transitions;
- dashboard date-range, grouping, suppression, and cursor binding.

### Contract

- types, Zod schemas, API Client, response validators, SQL enums/checks, and
  Outbox closed sets agree;
- unknown properties, out-of-range score, oversized text, invalid rubric JSON,
  and unbounded dashboard queries reject;
- minimal Outbox payload schemas reject comment, requester, transcript, and
  finding fields.

### Integration

- Customer and Worker each submit CSAT on their own closed target and replay
  the same idempotency key;
- resolved/open/reopened-equivalent, wrong owner, wrong app, and wrong city are
  rejected with no CSAT or Outbox row;
- two keys concurrently rate one target: exactly one success;
- rubric v1 review remains byte/hash-stable after v2 publication;
- self-review, stale draft submit, duplicate active review, and stale action
  completion reject atomically;
- review submit and all Outbox facts commit or roll back together;
- dashboard totals reconcile with source rows and do not mix cities.

### Security and privacy

- Customer A cannot read Customer B, Worker, enterprise, or another-city CSAT;
- operator cannot create rubrics/reviews, review themselves, or inspect another
  agent's raw feedback;
- auditor is scoped read-only; global-only identity cannot perform real-city
  write;
- Support SQL has no writes to orders, payment, dispatch, worker, aftersale,
  ledger, settlement, payout, or refund tables;
- logs, Outbox, cursors, dashboard results, and operator views contain no raw
  CSAT comment/requester/transcript leakage;
- no Phase 24F event appears in enterprise webhook allowlist.

### Migration, performance, and UI

- fresh migration, replay/partial-DDL recovery, FK/collation, CHECK, generated
  guard, and permanent migration-024-gap tests;
- concurrent CSAT/review/action tests run against MySQL, not an in-memory fake;
- dashboard `EXPLAIN ANALYZE` and latency thresholds use representative rows;
- Customer/Worker show success only after API confirmation; ineligible closed
  state and duplicate CSAT have accessible errors;
- Admin rubric/review/action/dashboard flows have browser evidence and no
  UI-only success.

## 12. Hard-blocking Phase gate

The Phase 24F aggregate gate must fail closed and include:

1. Phase 24A–24E locked-tag and append-only migration verification;
2. proof that migration 024 remains absent and no Phase 25 artifact exists;
3. schema/replay/partial-DDL migration tests for the discovered Phase 24F
   migration number;
4. contract and Outbox closed-set alignment;
5. unit, MySQL integration, concurrency, security/privacy, API Client, and UI
   tests above;
6. protected-domain write/import scan and enterprise-webhook deny check;
7. dashboard explain-plan/performance thresholds;
8. workspace typecheck, build, full regression, critical dependency audit, and
   architecture preflight;
9. report, browser evidence, test-count reconciliation, and clean-worktree
   evidence before human acceptance.

The gate and report must not claim Phase 24F Lock until a human explicitly
accepts the implementation. Final Lock must provide the final commit, tag,
test report, and clean worktree for the later independent Phase-number
governance task.

## 13. Decisions requiring confirmation after Phase 24E Lock

Before Phase 24F implementation, confirm:

- the actual Phase 24D conversation target table, close semantics, and ownership
  guard;
- whether enterprise requesters receive CSAT in Phase 24F or remain excluded;
- the CSAT submission-window and text-retention policies;
- whether low review scores automatically create quality actions or require an
  explicit Admin action;
- the small-count dashboard suppression threshold;
- whether any Worker-domain consumer is approved to consume
  `support.csat.submitted` during Phase 24F. Publication alone never authorizes
  a Worker-domain mutation.
