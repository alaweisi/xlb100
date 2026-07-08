# Phase 15.3V-1B Worker/Admin Real Business UAT Readiness Scan

Date: 2026-07-08
Scope: docs-only readiness scan for the remaining Worker/Admin routes after Customer first-knife implementation.
Baseline accepted: `2125aa7 docs(uat): record root test gate triage`.

## 1) Executive Summary

- **Current signal**: Customer UAT chain contract-driven implementation已通过核心链路（catalog/pricing/order/payment order/order detail）的开发与修复。
- **This phase scope**: Worker/Admin must support real-business UAT checks only, without changing app/backend/DB logic.
- **Reality check from code**:
  - `apps/admin` today is a **settlement/治理 operational console** only.
  - `apps/worker` today is a **not-wired workflow shell** with hard disabled actions and guardrail notices.
  - Cross-app traceability for a specific customer order (`orderId`) is currently **not fully visible** from Admin and Worker UIs.
- **Safety status**:
  - No fake actions were introduced in this pass.
  - No worker/admin API mutations were implemented in this phase.
  - Security words remain hidden from customer-facing user copy and are surfaced only through binding/engineering context.

## 2) Current Green Baseline

- Baseline commit: `2125aa7`.
- Customer main-chain docs and scan evidence already exist:
  - `docs/reports/PHASE15_3V1_CUSTOMER_BACKEND_UI_CONTRACT_MAP.md`
  - `docs/reports/PHASE15_3V1_CUSTOMER_UAT_FIELD_TRACEABILITY.md`
  - `docs/reports/PHASE15_3V1_CUSTOMER_UAT_REVIEW_CHECKLIST.md`
  - `docs/reports/PHASE15_3V1_ROOT_TEST_GATE_TRIAGE.md`
  - `docs/reports/PHASE15_3V1_ROOT_TEST_GATE_FIX_REPORT.md`
- Current phase output includes only reports and execution updates (no code/runtime changes).

## 3) Customer-created Order Traceability Target

Goal for three-app alignment:

1. Customer creates an order at `/customer/order/create` and receives `orderId`.
2. Admin can retrieve/order-view contract-related artifacts derived from the same customer business state (at least settlement evidence trail).
3. Worker can retrieve/act on assigned/available task flow from same business context.

Observed gap:

- `orderId` is visible in customer detail refresh, but Admin has no route that consumes customer order id directly.
- Worker route shell is not yet wired to show real assignment/task data from `orderId`.

## 4) Admin UAT Readiness Map

| Area | Route | Page File | API Client Method | Backend Endpoint | Request Fields | Response Fields | Real Data? | Manual UAT Ready? | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Settlement operations dashboard | `/admin/` (hash `#`) | `apps/admin/src/pages/SettlementOpsPage.tsx` | `settlementApi.listStatementAudit`, `settlementApi.getReviewSummary`, `settlementApi.getSettlementAuditSummary`, `settlementApi.scanReconciliationGaps` | `GET /api/internal/settlement/worker-statement-audit`, `GET /api/internal/settlement/worker-statement-review-summary`, `GET /api/internal/settlement/settlement-audit-summary`, `GET /api/internal/settlement/reconciliation-gap-scan` | query: `cityCode`, optional `cursor` | `items[]`, `summary` objects | Yes | Yes | SUPPORTED | Real settlement control-plane scope only. |
| Settlement statement detail | `/admin/#/settlement-ops/statements/:statementId` | `apps/admin/src/pages/SettlementStatementDetailPage.tsx` | `settlementApi.getStatementAuditDetail` | `GET /api/internal/settlement/worker-statement-audit/:statementId` | `statementId` (path) | `statement`, `review`, `export`, `exportedOutboxEvent` | Yes | Yes | SUPPORTED | 可读到 statement 与 outbox 审计链信息；不包含 customer order detail 直接查询。 |
| Export review | `/admin/#/settlement-ops/exports` | `apps/admin/src/pages/SettlementExportReviewPage.tsx` | `settlementApi.listExportAudit` | `GET /api/internal/settlement/worker-statement-export-audit` | query: `cityCode`, optional `cursor`, optional `statementId` | `items[]`, `nextCursor` | Yes | Yes | SUPPORTED | 出口/导出审计链可验证。 |
| Governance shell | `/admin/#/settlement-ops/governance` | `apps/admin/src/pages/SettlementActionGovernancePage.tsx` | `plannerApi.listSettlementDryRunPlans`, `plannerApi.createSettlementDryRunPlan`, `plannerApi.getSettlementDryRunPlan`, `plannerApi.getSettlementDryRunPlanItems`, `plannerApi.getSettlementDryRunPlanAudit`, `plannerApi.getReadinessPacketDryRunEligibility` | `GET /api/internal/settlement-action-governance/dry-run-plans`, `POST /api/internal/settlement-action-governance/dry-run-plans`, `GET /api/internal/settlement-action-governance/dry-run-plans/:planId`, `GET /api/internal/settlement-action-governance/dry-run-plans/:planId/items`, `GET /api/internal/settlement-action-governance/dry-run-plans/:planId/audit`, `GET /api/internal/settlement-action-governance/readiness-packets/:packetId/dry-run-eligibility` | `cityCode`, `packetId`, `planId`, `packet-placeholder` | `plans[]`, `items[]`, `entries[]`, `eligibility` | Yes | Partial | SUPPORTED | 页面为 governance dry-run/执行边界展示，执行路径受禁。 |
| Admin customer order detail (target) | `/admin/orders` / `/admin/order/:orderId` | N/A | N/A | N/A | `orderId` (path/query) | `order`, `payment`, `dispatch` | No | No | DATA_FLOW_MISSING | Admin scope currently未覆盖订单主链路读取，不能基于 `customer orderId` 做订单检索。 |

## 5) Worker UAT Readiness Map

| Area | Route | Page File | API Client Method | Backend Endpoint | Request Fields | Response Fields | Real Data? | Manual UAT Ready? | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Task hall / first contact | `/worker/` | `apps/worker/src/app/App.tsx` | N/A (binding-only) | binding 参考: `GET /api/worker/task-pool`, `POST /api/worker/tasks/:dispatchTaskId/accept` | none (binding path) | none (当前无真实请求渲染) | Partial | No | DATA_FLOW_MISSING | 业务逻辑在 workflow binding 中定义但当前页面未发起 API 调用，状态为 not-wired。 |
| Task list / assigned tasks | `/worker/tasks` | `apps/worker/src/app/App.tsx` | N/A (binding-only) | binding 参考: `GET /api/worker/fulfillments`, `POST /api/worker/fulfillments/:fulfillmentId/start`, `POST /api/worker/fulfillments/:fulfillmentId/complete` | none | none | No | No | ACTION_NOT_SUPPORTED | 可进入页面，但无真实任务列表/API 驱动数据。 |
| Worker wallet | `/worker/wallet` | `apps/worker/src/app/App.tsx` | N/A | binding 参考: `GET /api/ledger/...`（未集成） | none | none | No | No | CONTRACT_MISSING | 页面仅为占位说明，不连接真实收入/结算 API。 |
| Worker profile | `/worker/profile` | `apps/worker/src/app/App.tsx` | N/A | binding 参考: `GET /api/admin/certifications...`（不在该页触发） | none | none | No | No | CONTRACT_MISSING | 证件/身份链路不在该页 API 拉取。 |
| Worker certification | `/worker/certification` | `apps/worker/src/app/App.tsx` | N/A (disabled intent) | `POST /api/worker/certifications`, `GET /api/worker/eligibility` | none / `skuId` (if eligibility query) | none (当前未发起请求) | No | No | ACTION_NOT_SUPPORTED | 表单与状态区域仅提示不可用。 |
| Worker assigned task action (target) | `/worker/tasks/:fulfillmentId` | N/A | `workerApi.getFulfillment`, `workerApi.startFulfillment`, `workerApi.completeFulfillment` | `/api/worker/fulfillments/:fulfillmentId`, `/api/worker/fulfillments/:id/start`, `/api/worker/fulfillments/:id/complete` | `fulfillmentId` | `fulfillment` | Backend Yes | No | NOT_IN_PHASE_SCOPE | 该路由在 Worker 入口中未存在；当前 UI 没有 task detail/action 链。 |

## 6) Three-App Manual UAT Runbook (docs-only)

### Step | App | Route | User Action | Expected evidence

1. `Customer` | `/customer/` | Open page and set city | Search bar + catalog source visible; no duplicate city cards | `/customer/` renders real catalog route context |
2. `Customer` | `/customer/services?q=疏通` | Search and filter | URL query and rendered service count一致 | `searchQuery` / `matchedSkuCount` evidence |
3. `Customer` | `/customer/order/create` | Select service + quote | quote fields from `GET /api/pricing/quote` only | payload and response一致 |
4. `Customer` | `/customer/order/create` | Create order + payment order | `orderId`, `paymentOrderId` from real contract endpoints | real order/payment payload shown |
5. `Worker` | `/worker/` | Open task hall and task list | page loads with guardrail + disabled reasons (not-wired) | no false “supported” action claims |
6. `Worker` | `/worker/tasks` | Attempt start/complete actions | action disabled by binding, no executable action path | no mutation call |
7. `Admin` | `/admin/#/settlement-ops` | Inspect statement/export/gov views | real settlement/exports/gov data shown from internal endpoints | real data shown, no fake action |
8. `Cross-app` | any | Capture same `orderId` from customer detail and search corresponding Admin route | cannot close loop to settlement/worker from order in current scope | expected `CONTRACT_MISSING` note |

## 7) Supported Items

| Scope | Contract Evidence | Why supported |
|---|---|---|
| Admin settlement operations | `GET /api/internal/settlement/worker-statement-audit` etc | App routes call `settlementApi` directly and render fields |
| Admin export audit | `GET /api/internal/settlement/worker-statement-export-audit` | Export list/detal route wired |
| Admin governance dry-run read-only | `GET /api/internal/settlement-action-governance/*`, `POST /api/internal/settlement-action-governance/dry-run-plans` (plan create) | UI supports non-executing dry-run planner view |
| Worker shell + binding context | `apps/worker/src/adapters/workflowBindings.ts` | 5 worker routes render consistent guardrail/workflow states |
| Backend worker task APIs | `/api/worker/task-pool`, `/api/worker/tasks/:dispatchTaskId/accept`, `/api/worker/fulfillments*` | Endpoints registered and method signatures exist |

## 8) CONTRACT_MISSING List

| ID | App | Area | Evidence | Impact | Minimal fix |
|---|---|---|---|---|---|
| CONTRACT_MISSING-ADM-01 | Admin | customer order detail route | Admin shell无订单路由和订单消费 API 调用 | 无法从用户端订单直接追踪至 Admin |
| CONTRACT_MISSING-ADM-02 | Admin | worker management roster | 无 `/worker` 人员管理页面/API | 人员态势不可在 Admin 观察 |
| CONTRACT_MISSING-WKR-01 | Worker | task assignment execution | Worker App 当前不发起 accept/start/complete | 真实任务履约链未闭环 |
| CONTRACT_MISSING-WKR-02 | Worker | wallet/certification/order history data | 页面为说明文案/guardrail，不具备数据字段定义 | 财务与资质可视化缺失 |
| CONTRACT_MISSING-WKR-03 | Worker | worker task detail | 路由缺失 `fulfillmentId` 级详情页面 | 任务级动作链不可验证 |

## 9) UAT_BLOCKER List

| ID | App | Area | Severity | Evidence | Impact |
|---|---|---|---|---|---|
| UAT_BLOCKER-01 | Admin | order traceability | High | 未提供订单主链路视图页 | 无法在 staging 执行「Customer orderId」验收闭环 |
| UAT_BLOCKER-02 | Worker | action execution | High | 关键动作 `accept/start/complete` 全部不可用（not-wired） | 无法做任务履约 UAT |
| UAT_BLOCKER-03 | Worker | task data | Medium | task pool/fulfillment endpoints未在 UI 列表渲染 | 业务状态不可视化 |

## 10) DATA_FLOW_MISSING List

| ID | Data path | Source -> Sink | Missing node |
|---|---|---|---|
| DATA_FLOW_MISSING-01 | `/customer/order/create` `orderId` -> Admin view | Customer detail payload -> Admin settlement/workflow pages | Admin route consuming order id |
| DATA_FLOW_MISSING-02 | Customer payment success -> Worker task state | payment/order -> worker fulfillment list | Worker sink mapping |
| DATA_FLOW_MISSING-03 | Task pool -> Worker task action | `/api/worker/task-pool` -> UI task list -> accept/start actions | UI rendering + action wiring |

## 11) UI_VISIBILITY_MISSING List

| ID | Missing UI field | Required user-visible field | Notes |
|---|---|---|---|
| UI_VISIBILITY_MISSING-01 | Admin order detail snapshot | `orderId`, `paymentOrderId`, `order items` | Admin currently settlement-centric |
| UI_VISIBILITY_MISSING-02 | Worker task card detail | `orderId`, `skuId`, `quantity`, task status timeline | 当前以 guardrail / boundary 说明替代 |
| UI_VISIBILITY_MISSING-03 | Admin worker roster | worker name/status/city binding | 目前缺失 |

## 12) ACTION_NOT_SUPPORTED List

| ID | App | Area | Action | Contract | Status |
|---|---|---|---|---|---|
| ACTION_NOT_SUPPORTED-ADM-01 | Admin | settlement governance | execute payout/refund/reverse/commit | API exists in governance intent/rules layer | Not executed (Execution boundary disabled) |
| ACTION_NOT_SUPPORTED-WKR-01 | Worker | task accept | `POST /api/worker/tasks/:dispatchTaskId/accept` | API exists | Disabled by binding (`not-wired`/`WORKFLOW_NOT_IMPLEMENTED`) |
| ACTION_NOT_SUPPORTED-WKR-02 | Worker | fulfillment start | `POST /api/worker/fulfillments/:id/start` | API exists | Disabled by binding |
| ACTION_NOT_SUPPORTED-WKR-03 | Worker | fulfillment complete | `POST /api/worker/fulfillments/:id/complete` | API exists | Disabled by binding |

## 13) Must-fix Before Staging UAT

1. Add explicit cross-app UAT mapping notes in handoff:
   - Customer→Admin/Worker trace scope and known gaps.
2. Provide explicit acceptance proof matrix for each `PHASE` scope item (supported / missing).
3. Update Admin/Worker routes to expose **read-only** real endpoints for their target scopes before staging.
4. Keep security/engineering terms out of user visible copy.

## 14) Can-defer After Gray Test

1. Production-grade admin worker management pages (`/admin/workers`, `/admin/orders`).
2. Worker wallet/commission/ledger detail cards.
3. Certification workflow execution forms.
4. Full settlement action execution (payout/refund/commit) actions.

## 15) Recommended Third Knife Scope (docs-only)

- `docs/reports/PHASE15_3V1_WORKER_ADMIN_REAL_BUSINESS_UAT_SCAN.md`
- `docs/execution/PHASE15_PROGRESS.md`
- Next implementation knife (still docs-only for now) should remain real-business readiness only:
  - Worker: implement `/worker/` and `/worker/tasks` read-only real task list/detail binding, keep action contracts explicit.
  - Admin: add order-id-addressable admin order settlement view (non-mutating), if project scope allows.
  - Do not introduce fake data or actions.
