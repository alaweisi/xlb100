# CONTRACT_REQUEST_CONTEXT.md — 喜乐帮 / XLB

## RequestContext fields

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `traceId` | string | Yes | Header `x-xlb-trace-id` or auto-generated UUID |
| `appType` | AppType | Yes | Header `x-xlb-app-type` |
| `role` | Role | Yes | Header `x-xlb-role` |
| `cityCode` | CityCode | Route-dependent | Header `x-xlb-city-code` |
| `userId` | string | No | Header `x-xlb-user-id` |
| `requestStartedAt` | ISO datetime | Yes | Server-generated |
| `requestId` | string | No | Defaults to `traceId` |
| `correlationId` | string | No | Defaults to `traceId` |

## Headers

| Header | Required | Values |
|--------|----------|--------|
| `x-xlb-trace-id` | No (auto) | UUID string |
| `x-xlb-app-type` | Yes* | customer \| worker \| admin \| oa \| dashboard |
| `x-xlb-role` | Yes* | customer \| worker \| admin \| operator \| auditor |
| `x-xlb-city-code` | Route-dependent | Canonical city_code |
| `x-xlb-user-id` | No | Opaque user id |

\* Required on context-aware routes (e.g. `/api/debug/context`).

## Anonymous routes (Phase 1)

- `GET /health`
- `GET /api/system/status`

## Debug route

- `GET /api/debug/context` — requires appType, role, cityCode headers

## AppType ↔ Role matrix

| appType | allowed roles |
|---------|---------------|
| customer | customer |
| worker | worker |
| admin | admin, operator, auditor |
| oa | admin, operator |
| dashboard | admin, operator, auditor |
