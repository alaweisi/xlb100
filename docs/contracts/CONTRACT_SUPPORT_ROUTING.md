# CONTRACT_SUPPORT_ROUTING.md — Phase 24C Phase 1

## Scope

This contract activates city-scoped Support agent profiles, skill groups, and
agent membership. It does not define SLA policies, automatic routing, jobs,
realtime presence, conversation, bot, knowledge-base, quality, or CSAT behavior.

`admin_users` remains the only login identity. `support_agents` is a business
profile and never creates a parallel account, password, token, or role.

## Identity and city boundary

- Every route requires verified `appType=admin`, a real `RequestContext.cityCode`,
  and database-backed city authorization. `__global__` is never a business city.
- Profile and group management requires the current database role `admin`.
  Operators may read their own profile/workbench facts but cannot administer
  profiles or configuration. Auditors are read-only and cannot be agents.
- Creating or reactivating an agent requires the target `admin_users.role` to be
  `admin` or `operator` and an explicit `(admin_user_id, city_code)` row in
  `admin_city_scopes`. A `__global__` row alone is insufficient.
- Sensitive writes re-read the current database role; a stale JWT role is not
  sufficient authority.
- `assignedAgentId` and `support_tickets.assigned_agent_id` continue to carry
  `admin_users.id`. They never change to `support_agents.agent_id`.

## Resources

### Support agent

| Field | Contract |
|---|---|
| `agentId` | Support profile ID |
| `cityCode` | Real city |
| `adminUserId` | Existing `admin_users.id`; unique within the city |
| `displayName` | 1–128 characters |
| `lifecycleStatus` | `active` or `suspended` |
| `workStatus` | `offline`, `online`, or `busy` |
| `version` | Positive CAS version |
| `createdAt` / `updatedAt` | ISO timestamps |

`lifecycleStatus` is Support eligibility only. Suspending a profile does not
disable Admin authentication. `workStatus` is manually managed Phase 24C state,
not realtime presence and not an authentication-revocation signal.

### Support skill group

| Field | Contract |
|---|---|
| `skillGroupId` | Skill-group ID |
| `cityCode` | Real city |
| `name` | City-unique, 1–128 characters |
| `matchedTypes` | Non-empty unique subset of the locked ticket type enum |
| `matchedLanguages` | Up to 16 unique, case-insensitive BCP-47-like tags |
| `priorityWeight` | Integer from -1000 through 1000 |
| `isDefault` | City fallback marker |
| `isActive` | Configuration eligibility |
| `version` | Positive CAS version |
| `createdAt` / `updatedAt` | ISO timestamps |

At most one active default group exists per city. A default group must be
language neutral (`matchedLanguages=[]`). Phase 1 stores the canonical arrays as
strict JSON; clients always receive arrays, never JSON strings.

### Membership

Membership is keyed by `(cityCode, agentId, skillGroupId)` and contains
`proficiency` (0–100), `isPrimary`, `isActive`, `createdAt`, and `updatedAt`.
Both referenced records must be in the same city. Exit is a soft deactivation so
an idempotent DELETE can be replayed safely.

`isPrimary` is a non-exclusive workbench preference hint in Phase 1; it is not
an invariant that limits an agent to one active primary group. A soft-deleted
skill group retains its city-unique name and must be reactivated or renamed
instead of being recreated under the same name.

## Admin APIs

Agents:

- `GET /api/internal/support/agents`
- `GET /api/internal/support/agents/:agentId`
- `POST /api/internal/support/agents`
- `PATCH /api/internal/support/agents/:agentId`
- `DELETE /api/internal/support/agents/:agentId`
- `GET /api/internal/support/agents/:agentId/skill-groups`
- `POST /api/internal/support/agents/:agentId/skill-groups`
- `DELETE /api/internal/support/agents/:agentId/skill-groups/:skillGroupId`

Skill groups:

- `GET /api/internal/support/skill-groups`
- `GET /api/internal/support/skill-groups/:skillGroupId`
- `POST /api/internal/support/skill-groups`
- `PATCH /api/internal/support/skill-groups/:skillGroupId`
- `DELETE /api/internal/support/skill-groups/:skillGroupId`

List endpoints use cursor pagination with `limit` 1–100 and return
`nextCursor`. Agent filters are `lifecycleStatus`, `workStatus`, and
`adminUserId`; group filters are `isActive` and `isDefault`. Cursor identity is
server-generated and must not be interpreted by clients.

Create-agent body:

```json
{
  "adminUserId": "operator-hangzhou",
  "displayName": "Hangzhou Support",
  "lifecycleStatus": "active",
  "workStatus": "offline",
  "idempotencyKey": "agent-create-0001"
}
```

Create-group body:

```json
{
  "name": "Hangzhou Order Support",
  "matchedTypes": ["order_question", "order_dispute"],
  "matchedLanguages": [],
  "priorityWeight": 100,
  "isDefault": false,
  "isActive": true,
  "idempotencyKey": "group-create-0001"
}
```

PATCH bodies contain the mutable fields plus positive `expectedVersion` and
`idempotencyKey`. Agent DELETE contains `{ expectedVersion, idempotencyKey }`
and sets `lifecycleStatus=suspended`; it is not a physical delete. Group DELETE
uses the same envelope and sets `isActive=false`.

Membership POST contains
`{ skillGroupId, proficiency?, isPrimary?, expectedAgentVersion,
idempotencyKey }`. Membership DELETE contains
`{ expectedAgentVersion, idempotencyKey }`. Both operations CAS-increment the
agent version; DELETE sets membership `isActive=false`.

## Responses

- Single-agent mutation/read: `{ ok: true, agent }`.
- Agent list: `{ ok: true, agents, nextCursor }`.
- Single-group mutation/read: `{ ok: true, skillGroup }`.
- Group list: `{ ok: true, skillGroups, nextCursor }`.
- Membership add/reactivate: `{ ok: true, agent, membership }`.
- Membership list: `{ ok: true, memberships }`, ordered by primary first,
  proficiency descending, then `skillGroupId` ascending. Admin may read a
  same-city agent; an Operator may read only their own agent profile.
- Membership remove: `{ ok: true, agent, removedSkillGroupId }`.

## Concurrency and idempotency

- Agent/group creation keys are unique per city. Reusing a key with the same
  canonical payload returns the original resource; a different payload is 409.
- Updates and soft deletes persist the resource's last successful key and a
  SHA-256 canonical-request fingerprint. Membership mutations retain the last
  successful key per agent membership row. An immediate retry with the same key
  and fingerprint replays without incrementing the version; the same retained
  key with another fingerprint is 409. This bounded retry window does not claim
  an immutable history of every older mutation key.
- A non-replay mutation with a stale expected version is 409 and makes no write.
- City, role/scope checks, CAS, membership write, and idempotency state are
  committed in one transaction.

## Assignment compatibility

For tickets with `assigned_skill_group_id`, assignment requires an active agent
profile in the ticket city and an active membership in that group. For tickets
without a skill group, Phase 24B free assignment remains compatible by omitting
the profile/membership requirement, but the target must still have current
`admin`/`operator` role and an explicit scope for the ticket's real city.

Migration 048 deliberately adds no FK from historical ticket assignments to
agent profiles. Existing non-null `assigned_agent_id` values therefore remain
valid Admin user IDs without reinterpretation or forced backfill.
