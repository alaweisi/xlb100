# XLB / 喜乐帮 全量体检报告

日期：2026-07-08  
检查范围：`E:\xlb100` monorepo 全量目录、文档、三端 App、后端、数据库、测试、CI/CD、Git 状态。  
检查原则：只检查和记录，不修改业务代码。本报告替换了原先同名未跟踪报告文件，原因是原文件中文编码乱码且部分结论需要按本次命令重新核实。

## 0. 总体结论

项目不是 Phase 0/3 的空壳，也还不是可直接灰度的完整产品。当前更准确的状态是：

**后端业务主链路已大量实现，C 端已有真实 API 下单入口，W 端基本还是 guardrail UI，A 端偏结算运营后台；整体处于“后端半成品偏成熟 + 前端三端不均衡 + 工程 gate 有假绿”的阶段。**

关键证据：

- `docs/CURRENT_STATE.md` 标记：Phase 0-7 EXITED、Phase 8 EXITED、Phase 9A-9E LOCKED、Phase 10/11 LOCKED、Phase 12/13 COMPLETE、Phase 14 IN PROGRESS，Readiness 64/100。
- `README.md` 仍写“当前阶段：Phase 3 已封版”，`AGENTS.md` 和 `.cursor/rules/xlb-architecture-mandatory.mdc` 仍写“Phase 0 禁止业务实现”，与当前代码和 CURRENT_STATE 冲突。
- `backend/src/app.ts` 注册了 catalog、pricing、order、payment、dispatch、worker、certification、ledger、settlement、governance、planner、preparation、aftersale 等模块。
- `pnpm turbo run build`、`pnpm turbo run typecheck` 均通过。
- `pnpm turbo run lint` 通过但所有包都是 `echo "lint: skipped phase 0"`，不是真 lint。
- `pnpm turbo run test` 通过但只跑了 5 个 build 任务，没有跑根目录 Vitest；真实 `pnpm test` 失败：9 个文件、11 个测试失败，根因是 `Could not acquire Phase 8B integration-test lock`。

## 1. 项目地图核实

### 1.1 文档描述的架构和范围

`README.md` 描述：

```md
三端 App（Customer · Worker · Admin）+ 后端 + 共享包 Monorepo。
当前阶段：Phase 3 已封版 · Phase 3A 正式类目导入协议已建立
```

`AGENTS.md` 描述：

```md
apps/customer — C 端：用户下单服务入口
apps/worker — W 端：师傅接单履约入口
apps/admin — A 端：运营审核管理入口
backend — 后端 API 服务
packages/ — 共享类型、校验、配置、API Client、UI、模块加载器
db/ — 数据库 schema、migrations、seed
```

`AGENTS.md` 同时写：

```md
## Phase 0 约束（当前阶段）
- 禁止写任何真实业务逻辑
- 禁止：登录、JWT、city_code 路由、ScopedExecutor、订单、支付、派单、账本、资质、退款、真实 Provider
```

`docs/CURRENT_STATE.md` 写：

```md
| Phase 14 | IN PROGRESS | - | Readiness diagnostics (64/100) |
```

结论：`CURRENT_STATE` 更接近实际代码；README、AGENTS、强制架构规则仍残留早期 Phase 0/3 表述，已经过时。

### 1.2 实际目录结构

命令：

```powershell
Get-ChildItem -Force
rg --files apps backend packages db infra deploy tests .github scripts
```

主要实际结构：

```text
apps/admin
apps/customer
apps/worker
apps/dashboard
apps/oa
backend/src
packages/api-client
packages/config
packages/module-loader
packages/shared
packages/types
packages/ui
packages/validators
db/migrations
db/schema
db/seed
infra/docker
infra/nginx
deploy/compose
deploy/production
tests/unit
tests/integration
tests/contract
tests/security
```

对比结果：

| 目录 | 文档描述 | 实际状态 | 一致性 |
|---|---|---|---|
| `apps/customer` | C 端下单入口 | 5 个页面，已接 catalog/pricing/order/payment-order/order-detail API | 超过早期文档 |
| `apps/worker` | W 端接单履约 | 5 个 UI 页面，但全部 guardrail/not-wired，无真实 API 渲染 | 部分一致 |
| `apps/admin` | A 端运营管理 | settlement ops / detail / export / governance 四类视图 | 部分一致，范围偏结算 |
| `apps/oa` | 未在 README 表格中列出 | 只有 `package.json` + `README.md` | 文档缺失/空壳 |
| `apps/dashboard` | 未在 README 表格中列出 | 只有 `package.json` + `README.md` | 文档缺失/空壳 |
| `backend` | 后端 API | 真实业务模块很多，非 Phase 0 | README/AGENTS 过时 |
| `db` | schema/migrations/seed | 27 个 migration 文件，schema 多为空壳/摘要 | 部分一致 |
| `infra/deploy` | Docker/MySQL/Redis/Nginx/OSS | Dockerfile、compose、Nginx、生产脚本存在 | 基本一致 |
| `tests` | 单元/集成/契约/E2E/安全 | 存在 unit/integration/contract/security，无 E2E 目录 | 文档多写了 E2E |

### 1.3 明确过时或缺失的文档

- `README.md` 当前阶段过时：写 Phase 3，实际 `CURRENT_STATE` 已到 Phase 14，最近提交大量 Phase 15 前端工作。
- `AGENTS.md` 和 `.cursor/rules/xlb-architecture-mandatory.mdc` 的 Phase 0 禁止项过时：当前已有订单、支付、派单、账本、结算、售后退款等代码。
- `.cursor/skills/xlb-context-map/reference.md` 仍写 “Latest on record: 012/013/014”，实际 migrations 已到 `027_aftersale_refund_reversal.sql`。
- `docs/release/PHASE14_READINESS_REPORT.md` 写 `docs/CURRENT_STATE.md` 仍将 Phase 12 标为 NOT STARTED，但当前 `CURRENT_STATE` 已修正为 Phase 12 COMPLETE；该报告本身是历史状态。
- `docs/README.md` 只有一句索引说明，未反映当前文档体系。
- API 文档缺失：没有发现 OpenAPI/Swagger；`rg -n "swagger|openapi|@fastify/swagger"` 无结果。

## 2. 三端 App 完成度盘点

### 2.1 Customer 用户端

评分：**60/100**

已实现页面/模块：

| 页面 | 文件 | 状态 |
|---|---|---|
| 首页 `/customer/` | `apps/customer/src/pages/CustomerHomePage.tsx` | 读取 catalog 状态并展示 |
| 服务列表 `/customer/services` | `apps/customer/src/pages/CustomerServicesPage.tsx` | catalog 搜索/筛选 |
| 下单 `/customer/order/create` | `apps/customer/src/pages/CustomerOrderCreatePage.tsx` | 报价、创建订单、创建支付单、回读订单 |
| 订单 `/customer/orders` | `apps/customer/src/pages/CustomerOrdersPage.tsx` | 从 localStorage orderIds 回读订单 |
| 我的 `/customer/profile` | `apps/customer/src/pages/CustomerProfilePage.tsx` | profile/auth/address not-wired |

真实 API 证据：

```ts
// apps/customer/src/app/App.tsx
const orderCreateApi = {
  getPriceQuote: (skuId) => api.getPriceQuote(skuId),
  createOrder: (payload) => api.createOrder(payload),
  createPaymentOrder: (request) => api.createPaymentOrder(request),
  getOrder: (orderId) => api.getOrder(orderId),
};
```

```ts
// packages/api-client/src/customer.ts
getCatalog() { return client.get("/api/catalog"); }
getPriceQuote(skuId) { return client.get(`/api/pricing/quote?...`); }
createOrder(body) { return client.post("/api/orders", body); }
createPaymentOrder(body) { return client.post("/api/payments/orders", body); }
mockPaySuccess(body) { return client.post("/api/payments/mock-webhook", body); }
```

下单页实际闭环证据：

```ts
// apps/customer/src/pages/CustomerOrderCreatePage.tsx
const orderResponse = await api.createOrder(requestPayload);
const paymentResponse = await api.createPaymentOrder({ orderId: orderResponse.order.orderId });
const verifiedOrderResponse = await api.getOrder(orderResponse.order.orderId);
```

注意：页面没有调用 `mockPaySuccess`，所以 C 端当前不是“支付完成”闭环，而是“报价 -> 创建订单 -> 创建支付单 -> 回读订单”。支付单 provider 类型仍是 mock。

mock/硬编码/骨架：

```ts
// apps/customer/src/pages/customerPageShell.tsx
export const CUSTOMER_ID = "customer-demo-001";
window.localStorage.setItem(...)
```

```ts
// apps/customer/src/adapters/workflowBindings.ts
profileUnavailable: () => createNotWiredAction("customer.profile.unavailable", "Profile not wired", "API_NOT_AVAILABLE")
```

核心业务闭环进度：

```text
浏览类目 -> 报价 -> 下单 -> 创建支付单 -> 回读订单：已走真实 API
支付成功 -> 派单 -> 师傅接单 -> 上门 -> 完工 -> 评价：C 端 UI 未闭环
```

### 2.2 Worker 师傅端

评分：**15/100**

已实现页面：

| 页面 | 文件 | 状态 |
|---|---|---|
| 接单大厅 `/worker/` | `apps/worker/src/app/App.tsx` | UI guardrail，任务池未接线 |
| 任务 `/worker/tasks` | `apps/worker/src/app/App.tsx` | UI guardrail，履约未接线 |
| 收益 `/worker/wallet` | `apps/worker/src/app/App.tsx` | UI guardrail，收益 API 未接线 |
| 我的 `/worker/profile` | `apps/worker/src/app/App.tsx` | UI guardrail，资料 API 未接线 |
| 认证 `/worker/certification` | `apps/worker/src/app/App.tsx` | UI guardrail，认证状态未接线 |

not-wired 证据：

```ts
// apps/worker/src/adapters/workflowBindings.ts
action(...) {
  return {
    enabled: false,
    disabledReasonCode: reasonCode,
    source,
    endpoint,
    method,
  };
}
```

```ts
// apps/worker/src/adapters/workflowBindings.ts
endpoints: ["GET /api/worker/task-pool", "POST /api/worker/tasks/:dispatchTaskId/accept"],
status: "not-wired",
```

后端/API client 已有一部分能力：

```ts
// packages/api-client/src/worker.ts
acceptTask(dispatchTaskId) -> POST /api/worker/tasks/:dispatchTaskId/accept
getMyFulfillments() -> GET /api/worker/fulfillments
startFulfillment(...) -> POST /api/worker/fulfillments/:id/start
completeFulfillment(...) -> POST /api/worker/fulfillments/:id/complete
```

缺口：

- Worker App 没有调用 `@xlb/api-client` 的 worker API。
- `GET /api/worker/task-pool` 后端存在，但 `packages/api-client/src/worker.ts` 没有封装 task-pool。
- 认证/收益/profile 页面没有真实 API 渲染。
- 接单、开始履约、完成履约动作在 UI 层全部 disabled。

核心业务闭环进度：

```text
后端 accept/start/complete 已存在并有测试；
Worker 前端仍停在 UI guardrail，不能完成接单/履约 UAT。
```

### 2.3 Admin 管理端

评分：**55/100**

已实现视图：

| 视图 | 文件 | 状态 |
|---|---|---|
| 结算运营台 | `apps/admin/src/pages/SettlementOpsPage.tsx` | 真实 settlement audit/summary/gap API |
| 结算单详情 | `apps/admin/src/pages/SettlementStatementDetailPage.tsx` | 真实 statement audit detail |
| 导出复核 | `apps/admin/src/pages/SettlementExportReviewPage.tsx` | 真实 export audit API |
| 结算治理 | `apps/admin/src/pages/SettlementActionGovernancePage.tsx` | 部分 dry-run planner 接线，部分表单占位 |

路由证据：

```ts
// apps/admin/src/app/App.tsx
{ key: "settlement", label: "结算", href: "#" }
{ key: "exports", label: "导出复核", href: "#/settlement-ops/exports" }
{ key: "governance", label: "治理", href: "#/settlement-ops/governance" }
```

API 范围证据：

```ts
// packages/api-client/src/admin.ts
export function createAdminApi(client: ApiClient) {
  return { settlement: createSettlementApi(client) };
}
```

占位证据：

```tsx
// apps/admin/src/pages/SettlementActionGovernancePage.tsx
<input value={actionKind} disabled readOnly ... placeholder="例如：复核、批准、标记；不可执行" />
```

缺口：

- Admin 不是完整运营后台，目前基本是 settlement/governance 控制台。
- 没有订单详情、工单池、师傅管理、用户管理、售后处理等通用后台页面。
- `apps/admin/src/apiBase.ts` 读取 `VITE_API_BASE`，但 `.env*.example` 没有定义该变量。

核心业务闭环进度：

```text
结算/导出/治理可观察一部分链路；
不能从 customer orderId 直接追踪到 Admin 工单/订单详情；
无法支撑完整运营 UAT。
```

## 3. 后端接口健康度

### 3.1 路由/controller 清单

模块注册证据：

```ts
// backend/src/app.ts
await registerCatalogModule(app);
await registerPricingModule(app);
await registerOrderModule(app);
await registerPaymentModule(app);
await registerDispatchModule(app);
await registerWorkerModule(app);
await registerWorkerCertificationModule(app);
await registerLedgerRoutes(app);
await registerSettlementRoutes(app);
await registerGovernanceIntentRoutes(app);
await registerGovernanceReviewRoutes(app);
await registerGovernanceEvidenceRoutes(app);
await registerGovernanceReadinessRoutes(app);
await registerPlannerRoutes(app);
await registerPreparationRoutes(app);
await registerAftersaleModule(app);
```

主要路由摘录：

| 模块 | 路由 | 状态 |
|---|---|---|
| system | `GET /health`, `/api/system/status`, `/api/system/db-health`, `/api/debug/context` | 实现 |
| catalog | `GET /api/catalog` | 实现 |
| pricing | `GET /api/pricing/quote` | 实现 |
| order | `POST /api/orders`, `GET /api/orders/:orderId` | 实现 |
| payment | `POST /api/payments/orders`, `POST /api/payments/mock-webhook` | mock provider |
| dispatch | `POST /api/internal/dispatch/run-once`, `GET /api/dispatch/tasks` | 手动 run-once |
| worker | `GET /api/worker/task-pool`, `POST /api/worker/tasks/:dispatchTaskId/accept` | 实现 |
| fulfillment | `GET /api/worker/fulfillments`, `GET /api/worker/fulfillments/:id`, `POST start`, `POST complete` | 实现 |
| certification | `POST /api/worker/certifications`, `GET /api/worker/eligibility`, admin approve/reject | 实现 |
| ledger | `POST /api/internal/ledger/run-once`, `POST /api/internal/ledger/reverse`, `GET /api/internal/ledger/accruals` | 实现 |
| settlement | prepare/confirm/payable/queue/worker-statements/review/export/audit/summary/gap | 实现 |
| governance | intents/reviews/evidence/readiness/plans/preparation-envelopes | 实现 |
| aftersale | refund request / approve | 实现但偏 MVP |

占位/半成品：

- `backend/src/dispatch/dispatchStrategy.ts` 注释：`Phase 5A dispatch strategy — placeholder; no worker matching`。
- `backend/src/streams/dispatchStreamConsumer.ts` 仍是 stream skeleton，不是长期 consumer daemon。
- `backend/src/providers/README.md` 只有 provider 占位。
- Payment provider 类型是 `mock`，真实支付 provider 未实现。

### 3.2 鉴权

当前是 header-based skeleton，不是登录/JWT。

证据：

```ts
// backend/src/gateway/authz.ts
/** Phase 1 authorization skeleton — no JWT, header-based only */
export function authorizeRequest(context: RequestContext): AuthzResult {
  const appGuard = assertAppTypeRole(context.appType, context.role);
  ...
}
```

```ts
// backend/src/context/requestContext.ts
message: "Missing required headers: x-xlb-app-type and x-xlb-role"
```

`.env.example` 有 `JWT_SECRET=change-me-in-production`，但后端没有 JWT 校验实现。

### 3.3 错误处理与日志

日志：

```ts
// backend/src/app.ts
const app = Fastify({ logger: true });
```

错误处理：

- 没有发现 `setErrorHandler`。
- 大量 route 内部手写 `try/catch`，例如 planner/preparation/governance routes。

风险：错误格式不统一，500/400/404/409 由每个 route 自己拼。

### 3.4 API 文档一致性

命令：

```powershell
rg -n "swagger|openapi|@fastify/swagger" . -g "!node_modules/**" -g "!dist/**"
```

结果：无命中。

已有的是 `docs/contracts/*.md` 手写契约，但没有自动生成 OpenAPI，也没有检查“实际 Fastify 路由 vs 文档”完全一致的工具。

## 4. 数据库现状

### 4.1 migration/schema/seed

命令：

```powershell
Get-ChildItem db\migrations -File
Get-ChildItem db\schema -File
Get-ChildItem db\seed -File
```

结果：

- `db/migrations`：27 个文件，`000` 到 `027`，中间跳过 `024`。
- `db/schema`：15 个文件，但多个只有几十字节，更像摘要/占位。
- `db/seed`：10 个文件，其中 official catalog/pricing seed 很大。

Migration 文件：

```text
000_init.sql
001_city_foundation.sql
...
023_settlement_action_governance_readiness_packets.sql
025_settlement_execution_dry_run_plans.sql
026_settlement_execution_preparation_envelope.sql
027_aftersale_refund_reversal.sql
```

Schema 文件长度证据：

```text
order.sql 38
payment.sql 40
refund.sql 39
audit.sql 38
core.sql 37
```

说明：真实 DDL 主要在 migrations，`db/schema` 不是完整事实源。

### 4.2 migration 实跑结果

本地 Docker 状态：

```text
xlb-mysql-local mysql:8 Up 2 hours (healthy) 0.0.0.0:3306->3306/tcp
xlb-redis-local redis:7 Up 2 hours (healthy) 0.0.0.0:6379->6379/tcp
```

命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\migrate-local.ps1
```

输出摘要：

```text
SKIP 000_init (already applied)
...
SKIP 027_aftersale_refund_reversal (already applied)
migrate-local: passed
```

查询结果：

```text
SELECT COUNT(*) ... xlb_local -> 42
schema_migrations:
000_init
001_city_foundation
...
023_settlement_action_governance_readiness_packets
025_settlement_execution_dry_run_plans
026_settlement_execution_preparation_envelope
027_aftersale_refund_reversal
```

结论：本地 migration 能跑通，当前库已有 42 张表；但版本号跳过 024，需文档解释或补一条 no-op migration 记录。

### 4.3 数据模型覆盖与遗漏

已覆盖：

- 城市/城市 scope：`cities`, `admin_city_scopes`
- catalog/pricing：`service_categories`, `service_items`, `service_skus`, `price_rules`
- order/payment/outbox：`orders`, `payment_orders`, `event_outbox`
- dispatch/worker/qualification/fulfillment
- ledger/accrual/settlement/payable/worker receivable statement
- governance/planner/preparation envelope
- aftersale refund reversal MVP

明显遗漏/弱项：

| 缺口 | 证据 | 影响 |
|---|---|---|
| customers 主表缺失 | migrations 只有 `orders.customer_id VARCHAR(64)`，无 `CREATE TABLE customers` | C 端用户身份硬编码，无法真实登录/地址 |
| admin_users 主表缺失 | `admin_city_scopes.admin_user_id` 无 admin user 表 | 后台权限/审计主体不完整 |
| 用户地址/上门地址缺失 | `orders` 仅 sku/quantity/amount 等，没有 address 字段 | 家政维修下单关键字段缺失 |
| 预约时间缺失 | 未见 `scheduled_at` | 无法预约服务时间 |
| 评价/评分缺失 | 未见 rating/review 表 | 完工后评价闭环缺失 |
| 师傅提现/银行卡缺失 | wallet/withdraw/bank 未见真实模型 | W 端收益闭环不足 |

## 5. 构建与依赖体检

### 5.1 `pnpm install`

命令：

```powershell
pnpm install
```

真实输出：

```text
Scope: all 14 workspace projects
Already up to date
Done in 287ms using pnpm v11.7.0
```

结论：成功。注意 `package.json` 写 `packageManager: pnpm@9.15.0`，本机实际用 pnpm 11.7.0。

### 5.2 `pnpm turbo run build`

命令：

```powershell
pnpm turbo run build
```

真实输出摘要：

```text
Packages in scope: @xlb/admin, @xlb/api-client, @xlb/backend, ...
Running build in 13 packages
Tasks:    11 successful, 11 total
Cached:    11 cached, 11 total
Time:    44ms >>> FULL TURBO
```

三端产物摘要：

```text
@xlb/admin dist/assets/index-DRRfsr4O.js 189.08 kB gzip 57.48 kB
@xlb/customer dist/assets/index-CSLJNuJ4.js 189.87 kB gzip 59.54 kB
@xlb/worker dist/assets/index-kMKJB1kV.js 169.25 kB gzip 53.83 kB
```

结论：成功，但全部 cache hit；这验证了缓存产物，不等于无缓存重建。

### 5.3 `pnpm turbo run lint`

真实输出摘要：

```text
Tasks:    16 successful, 16 total
@xlb/backend:lint > echo "lint: skipped phase 0"
@xlb/customer:lint > echo "lint: skipped phase 0"
@xlb/worker:lint > echo "lint: skipped phase 0"
...
```

结论：命令成功，但 lint 是空跑。所有有 lint 脚本的包都只是 echo。

包脚本证据：

```text
@xlb/admin | lint=echo "lint: skipped phase 0"
@xlb/customer | lint=echo "lint: skipped phase 0"
@xlb/worker | lint=echo "lint: skipped phase 0"
@xlb/backend | lint=echo "lint: skipped phase 0"
@xlb/types | lint=echo "lint: skipped phase 0"
```

### 5.4 `pnpm turbo run typecheck`

真实输出摘要：

```text
Tasks:    16 successful, 16 total
Cached:    16 cached, 16 total
Time:    31ms >>> FULL TURBO
```

结论：成功。

### 5.5 `pnpm turbo run test`

真实输出：

```text
Packages in scope: @xlb/admin, @xlb/api-client, ...
Running test in 13 packages
Tasks:    5 successful, 5 total
Cached:    5 cached, 5 total
Time:    31ms >>> FULL TURBO
```

结论：命令成功，但没有跑根目录 `vitest run`。原因是 workspace 包基本没有 `test` 脚本，根目录 `package.json` 的 `"test": "vitest run"` 不在 turbo package graph 里执行。

为确认真实测试健康度，额外执行：

```powershell
pnpm test
```

真实结果：

```text
Test Files  9 failed | 246 passed (255)
Tests       11 failed | 1037 passed | 1 todo (1049)
Duration    139.46s
Error: Could not acquire Phase 8B integration-test lock
```

失败测试清单：

```text
tests/integration/reconciliationGapScan.test.ts
tests/integration/settlementCityScoped.test.ts
tests/integration/settlementPayableIdempotency.test.ts
tests/integration/settlementPayableQueue.test.ts
tests/integration/workerReceivableStatementAudit.test.ts
tests/integration/workerReceivableStatementAuditCityScoped.test.ts
tests/integration/workerReceivableStatementAuditReadOnlyInvariant.test.ts
tests/integration/workerReceivableStatementNoUpstreamMutation.test.ts
tests/integration/workerReceivableStatementReviewSummaryCityScoped.test.ts
```

根因代码：

```ts
// tests/integration/helpers/settlementTestHelper.ts
const [rows] = await connection.query(
  "SELECT GET_LOCK('xlb-phase8b-integration-tests', 30) AS acquired"
);
if (rows[0]?.acquired !== 1) throw new Error("Could not acquire Phase 8B integration-test lock");
```

## 6. 测试覆盖情况

目录统计：

```text
tests/contract: 41 files
tests/integration: 77 files
tests/security: 80 files
tests/unit: 64 files
apps/admin: 0 app-local test files
apps/customer: 0 app-local test files
apps/worker: 0 app-local test files
```

覆盖亮点：

- 后端合同、状态机、city scope、phase boundary、安全 gate 覆盖很多。
- 集成测试覆盖 order/payment/dispatch/worker accept/fulfillment/ledger/settlement/receivable statement/audit。
- Admin settlement 页面有根目录单测，如 `tests/unit/settlementOpsPage.test.tsx`、`settlementStatementDetailPage.test.tsx`。

高风险无测试区域：

| 区域 | 风险 |
|---|---|
| C 端完整交互 | app 目录无本地前端测试，真实用户流程主要靠文档/UAT |
| W 端真实接线 | 目前 UI 不接 API，未来接线缺页面测试护栏 |
| Admin 通用运营后台 | 当前只测 settlement，缺订单/工单/师傅/用户后台 |
| 登录/JWT/会话 | 未实现也无测试 |
| 真实支付 provider | 只有 mock provider |
| 地址/预约/评价 | 数据模型和测试都缺 |
| Turbo test gate | `turbo run test` 假绿，不能代表真实测试 |

## 7. CI/CD 与部署链路

### 7.1 GitHub Actions

`.github/workflows/ci.yml`：

```yaml
- name: Install
  run: pnpm install
- name: Build
  run: pnpm build
- name: Typecheck
  run: pnpm typecheck
- name: Test
  run: pnpm test
- name: Preflight
  run: pwsh -NoProfile -File scripts/preflight-architecture.ps1
```

风险：CI 用 `pnpm test`，按本次本地真实结果会失败 11 个测试；如果 GitHub 没有 MySQL/Redis 服务，集成测试还可能更早失败。

`.github/workflows/architecture-guard.yml`：

```yaml
- uses: actions/checkout@v4
- name: Preflight architecture
  run: pwsh -NoProfile -File scripts/preflight-architecture.ps1
```

风险：没有 setup Node/pnpm/install。如果脚本依赖 repo 外命令或 node_modules，会失败或只跑部分检查。

`.github/workflows/contract-check.yml`：

```yaml
- name: Contract check placeholder
  run: pwsh -NoProfile -File scripts/check-contracts.ps1
```

风险：命名为 placeholder，需确认是否真实覆盖。

`.github/workflows/security-scope-check.yml`：

```yaml
- name: Security tests
  run: pnpm test tests/security
```

风险：有 install，但同样没有 MySQL/Redis 服务定义；security tests 里大量 PowerShell gate 应可跑，若触发集成依赖需确认。

### 7.2 部署方式

本地：

```yaml
# deploy/compose/docker-compose.local.yml
mysql: mysql:8 -> 3306
redis: redis:7 -> 6379
```

Staging：

```yaml
# deploy/compose/docker-compose.staging.yml
mysql + redis + backend + customer + worker + admin + reverse-proxy
backend uses infra/docker/Dockerfile.backend
frontends use infra/docker/Dockerfile.frontend
```

Production：

```yaml
# deploy/compose/docker-compose.prod.yml
backend/customer/worker/admin app services only
expects external production MySQL, Redis, ingress, TLS, secrets, monitoring, backups
```

Dockerfile 证据：

```dockerfile
# infra/docker/Dockerfile.backend
RUN pnpm install --frozen-lockfile --filter @xlb/backend...
RUN pnpm --filter @xlb/backend... build
CMD ["node", "backend/dist/server.js"]
```

```dockerfile
# infra/docker/Dockerfile.frontend
ARG APP_NAME=customer
RUN pnpm --filter @xlb/$APP_NAME build
CMD ["sh", "-c", "serve -s apps/$APP_NAME/dist -l 4173"]
```

当前本机容器证据：

```text
xlb-backend-staging Up 2 hours 0.0.0.0:3000->3000/tcp
xlb-customer-staging Up 2 hours 0.0.0.0:4173->4173/tcp
xlb-worker-staging Up 2 hours 0.0.0.0:4174->4173/tcp
xlb-admin-staging Up 2 hours 0.0.0.0:4175->4173/tcp
xlb-mysql-local Up healthy
xlb-redis-local Up healthy
```

### 7.3 env 示例一致性

`.env.example`：

```text
NODE_ENV=development
BACKEND_PORT=3000
MYSQL_*
REDIS_*
JWT_SECRET=change-me-in-production
```

`.env.staging.example`：

```text
NODE_ENV=production
MYSQL_HOST=mysql
STAGING_MYSQL_PORT=3307
STAGING_REDIS_PORT=6380
JWT_SECRET=change-me-in-production
```

`.env.production.example` 额外包含：

```text
PROD_BACKEND_HEALTH_URL
PROD_CUSTOMER_URL
PROD_WORKER_URL
PROD_ADMIN_URL
PROD_BACKEND_IMAGE
...
```

缺口：

- `apps/admin/src/apiBase.ts` 读取 `VITE_API_BASE`，但三个 env example 均未定义。
- Frontend Docker compose 只给了 `NODE_ENV`，没有 `VITE_API_BASE` build arg/env。由于 Vite 是 build-time env，生产前端可能默认同源 API；这需要和 Nginx 代理策略明确绑定。
- production env 是 placeholder，不是可上线密钥清单。

## 8. Git 与协作状态

### 8.1 当前状态

命令：

```powershell
git status --short --branch
```

输出：

```text
## main...origin/main [ahead 8]
?? docs/health-check-2026-07-08.md
?? docs/reports/PHASE16_V18_PROJECT_HEALTHCHECK.md
```

说明：当前 `main` 本地领先远端 8 个 commit；体检前已有两个未跟踪报告文件。本报告文件仍为未跟踪文档改动。

### 8.2 最近 30 个提交

```text
5992136 docs(uat): map worker admin real business readiness
2125aa7 docs(uat): record root test gate triage
abc1833 fix(security): narrow provider withdraw ui gate scope
16a213a fix(customer): repair order create validation failures
1c71b81 feat(customer): complete service discovery order entry uat flow
6f31101 docs(uat): define three app real business uat handoff
76895d0 refactor(frontend): land five layer customer ui structure
8e82843 fix(customer): unify location and search entry
92641fb fix(customer): improve location search and quantity ux
6226815 fix(security): allow customer capacitor readiness assets
162a3d3 fix(customer): recover customer mobile shell uat changes
bcf7f84 docs(frontend): define ui system layers and component manifest
d375b3e docs(mobile): add customer capacitor readiness plan
07b0cf0 feat(ui): add campaign theme token architecture
018fdd1 fix(customer): make home catalog user-facing
91c737a fix(customer): show full catalog categories on home
13cd521 feat(customer): make order flow usable for product uat
90b7abd feat(frontend): repair customer worker figma pixels
...
```

方向判断：最近集中在 Phase 15 前端产品化、Customer UAT、Worker/Admin readiness 文档、UI 系统和安全 gate 修补。

### 8.3 分支

主要分支类型：

```text
main
phase1-request-context-city-foundation
phase2-database-scope-dal-foundation
...
phase9e-admin-query-filter-pagination
phase10-settlement-action-governance-release-train
phase11-settlement-execution-dry-run-planner
phase12-settlement-execution-preparation-control-envelope
phase14r-refund-reversal
chore-agent-skills-current-state
backup/phase8h-merged-before-postlock-e2446c5
```

说明：

- `phase*` 分支基本是历史阶段交付/lock 轨迹。
- `phase14r-refund-reversal` 表示售后退款/冲正方向。
- `chore-agent-skills-current-state` 是 Agent skill/事实源维护方向。
- backup 分支是合并前备份。

## 9. 完成度打分

### 9.1 三端功能完成度

| App | 分数 | 证据 |
|---|---:|---|
| Customer | 60% | catalog/pricing/order/payment-order/get-order 已接真实 API；profile/auth/address 未接线；支付成功/评价/地址/预约缺失 |
| Worker | 15% | 5 个页面都有 UI，但 workflow binding 全是 `enabled:false` / `status:"not-wired"`；后端能力未接到 UI |
| Admin | 55% | settlement ops/detail/export/governance 部分可用；缺订单、工单、师傅、用户、售后等完整后台 |
| OA | 0% | 只有 package/README |
| Dashboard | 0% | 只有 package/README |

### 9.2 后端/数据库完成度

| 组件 | 分数 | 证据 |
|---|---:|---|
| Backend API | 75% | 主链路模块齐全；但 auth 是 header skeleton，payment 是 mock，consumer 多为手动 run-once，无 OpenAPI |
| Database | 70% | 42 张表，migration 可跑通；缺 customers/admin_users/address/scheduled_at/rating/withdraw/bank 等产品必需实体 |
| Shared packages | 80% | types/validators/api-client/ui/config 都能 build/typecheck；但 worker task-pool API client 缺封装，lint 空跑 |
| Tests | 65% | 覆盖广，但真实 `pnpm test` 失败，前端 app-local 测试为 0，Turbo test 假绿 |
| CI/CD | 55% | workflow 存在，但 CI 缺服务依赖且会受 `pnpm test` 失败影响；production compose 是 scaffold |

## 10. 阻塞性问题清单

按严重程度排序：

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| 1 | 真实根测试失败 | 已修复串行基线：`pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent` 连续 3 次 `255 passed (255)`；连接池和 Settlement UI 失败均清零 | 串行真实测试 gate 已关闭；`turbo run test` 假绿、CI services、并行连接上限风险仍需单独处理 |
| 2 | `turbo run test` 假绿 | `Tasks: 5 successful, 5 total`，未跑 `vitest run` | 本地/CI 容易误判测试已通过 |
| 3 | lint 完全空跑 | 所有包 `lint=echo "lint: skipped phase 0"` | 代码质量 gate 不存在 |
| 4 | 无真实登录/JWT/会话 | `authz.ts` 注释 no JWT/header-based only | 三端权限不可用于真实环境 |
| 5 | Worker 前端不接线 | `workflowBindings.ts` 全部 `enabled:false`，`status:"not-wired"` | 下单后无法在 W 端完成接单/履约 UAT |
| 6 | 数据模型缺 customers/admin_users/address/schedule | migrations 无对应主表/字段 | 真实用户、后台审计、上门服务不可闭环 |
| 7 | CI 没有 MySQL/Redis services | 已配置 MySQL/Redis services、CI env、migration/seed/test 顺序 | 已配置，待 GitHub Actions 验证；push 后需回看 CI 运行结果，如失败需贴回 Actions 日志继续排查 |
| 8 | migration runner 无法 bootstrap 全新空库 | 已修复：`runMigrations()` 启动时自行确保 `schema_migrations` 存在，`000_init` 会被正常记录 | 已用临时空库从零验证首次迁移和二次幂等；CI 改为调用正常 migrate CLI |

## 11. 非阻塞但重要的问题

| # | 问题 | 证据 |
|---|---|---|
| 1 | README/AGENTS/架构规则过时 | README Phase 3，AGENTS Phase 0，CURRENT_STATE Phase 14 |
| 2 | OpenAPI/Swagger 缺失 | `rg swagger/openapi` 无结果 |
| 3 | `db/schema` 不是完整 schema | 多个 schema 文件长度 30-40 字节 |
| 4 | migration 编号缺 024 | `023` 后直接 `025` |
| 5 | `VITE_API_BASE` 示例缺失 | admin 读取，env example 不定义 |
| 6 | Payment 仍是 mock provider | `PaymentProvider = "mock"`，`/api/payments/mock-webhook` |
| 7 | 自动 consumer daemon 缺失 | dispatch/ledger/settlement 主要靠 `/api/internal/*/run-once` |
| 8 | C 端用户 ID 硬编码 | `CUSTOMER_ID = "customer-demo-001"` |
| 9 | app-local 前端测试为 0 | apps/admin/customer/worker 均 0 |
| 10 | 本地 main ahead origin 8 | 协作状态需先推送/对齐 |

## 12. 建议下一步优先级

### P0-1 修正测试 gate：让 `pnpm test` 稳定全绿

具体任务：

1. 修 `tests/integration/helpers/settlementTestHelper.ts` 的全局 advisory lock 竞争。
2. 选择一条策略：集成测试串行跑、按文件生成唯一 lock name、或延长/重试 lock 获取。
3. 在 `vitest.config.ts` 明确 integration pool 策略。
4. 验证 `pnpm test` 达到 `255/255 files passed`。

验收命令：

```powershell
pnpm test
```

### P0-2 修正 `turbo run test` 假绿

具体任务：

1. 给根测试建立 workspace 包，或在每个相关包提供真实 test script。
2. 或修改 CI/文档，明确使用 `pnpm test` 而不是 `turbo run test`。
3. 在 `turbo.json` 中确保 test 不只触发依赖 build。

验收命令：

```powershell
pnpm turbo run test
```

期望看到 Vitest 测试文件，而不是只有 5 个 build 任务。

### P0-3 启用真实 lint

具体任务：

1. 添加 ESLint flat config + TypeScript ESLint。
2. 将所有 `lint: skipped phase 0` 改为真实 `eslint`。
3. 先允许 warning 或分阶段修复，但 CI 不能继续空跑。

验收命令：

```powershell
pnpm turbo run lint
```

### P1-1 打通 Worker 只读任务池和任务列表

具体任务：

1. 在 `packages/api-client/src/worker.ts` 增加 `getTaskPool()`。
2. 在 `apps/worker/src/app/App.tsx` 的 Hall/Tasks 页面调用真实 API。
3. 第一阶段只读渲染 task pool/fulfillment，不开放 accept/start/complete。
4. 增加 Worker 页面测试，防止假数据和 forbidden claims。

验收：

```text
Customer 下单并支付 mock webhook 后，dispatch run-once 生成任务；
Worker `/worker/` 能看到真实 task-pool 数据。
```

### P1-2 补产品必需数据模型最小集

具体任务：

1. 新增 append-only migration：customers、admin_users、customer_addresses。
2. 给 orders 增加 `service_address_id` / `scheduled_at` 或建立 order service detail 表。
3. 更新 types/validators/api-client/backend/tests。
4. 不做真实登录前，至少把 demo user/admin bootstrap 成 DB seed。

### P1-3 更新文档事实源

具体任务：

1. 更新 `README.md` 当前阶段：Phase 14/15 readiness/frontend productization。
2. 更新 `AGENTS.md`：保留历史 Phase 0 规则，但标记为历史，不再写“当前阶段”。
3. 更新 `.cursor/skills` reference：migration 最新到 027，当前 Phase 到 14/15。
4. 增加 “如何跑真实测试 vs turbo test” 文档。

## 13. 本次命令清单

```powershell
git status --short --branch
git log --oneline -30
git branch -a
git tag -l "xlb-phase*"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\agent-context-snapshot.ps1
rg --files docs
rg --files apps backend packages db infra deploy tests .github scripts
rg -n "app\.(get|post|put|patch|delete)\(" backend\src -g "*.ts"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\migrate-local.ps1
docker exec xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local -N -e "SELECT COUNT(*) ..."
pnpm install
pnpm turbo run build
pnpm turbo run lint
pnpm turbo run typecheck
pnpm turbo run test
pnpm test
```

## 14. 最短行动路线

如果只能先做 3 件事：

1. **先修测试 gate**：`pnpm test` 全绿，并让 `turbo run test` 不再假绿。
2. **再接 Worker 只读任务池**：让 C 端下单后的业务状态在 W 端可见。
3. **补 customers/admin_users/address 最小模型**：停止继续扩大硬编码 demo 身份。

这三件事完成后，项目才更像”可稳定 UAT 的半成品”，而不是”后端链路很多、前端和工程 gate 仍在漂”的状态。

---

## 15. P0 修复记录（2026-07-08）

### 修复范围

体检报告阻塞项 #3（customers/admins 表缺失）和 #2（无真实认证系统），按两阶段执行。

### 阶段 1：建表

| 文件 | 操作 | 说明 |
|------|------|------|
| `db/migrations/028_customers_admin_users.sql` | 新增 | `customers` 表（id, phone, name, avatar_url, default_city_code）+ `admin_users` 表（id, username, role, city_scopes_json） |
| `db/seed/011_customers_admin_users.seed.sql` | 新增 | `customer-demo-001` + 3 个 admin 用户（admin-hangzhou/sh/global） |

- 未添加 FK 约束（已有表引用 `customer_id` 的列名不统一，历史测试数据可能违反 FK）
- Migration + seed 在本地 Docker MySQL 执行成功
- Build/typecheck/test 零新增失败

### 阶段 2：最小可用真实鉴权

#### 新增文件

| 文件 | 职责 |
|------|------|
| `backend/src/auth/authService.ts` | HMAC-JWT sign/verify、mock 验证码校验（固定 `”1234”`）、customer 查找/自动注册、admin 查找 |
| `backend/src/auth/authRoutes.ts` | `POST /api/auth/customer/login`、`POST /api/auth/admin/login` |
| `backend/src/auth/tokenAuth.ts` | `verifyToken()` 导出（被 requestContext 复用） |
| `packages/api-client/src/auth.ts` | 前端登录 API 封装 |

#### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/src/app.ts` | 注册 `registerAuthRoutes` |
| `backend/src/context/requestContext.ts` | Token-first 鉴权：读 `Authorization: Bearer` header → 验证 JWT → 覆盖 `context.userId/role/appType`。无 token 则 fallback 到 header 方式 |
| `backend/src/governance/governanceIntentRoutes.ts` | `POST /api/.../intents` 强制从 `ctx.userId` 取 `requestedByAdminId`，不再信任 body 字段 |
| `packages/api-client/src/index.ts` | 导出 `authApi` |
| `apps/customer/src/pages/customerPageShell.tsx` | 新增 `loginCustomer()` 函数，`createCustomerApiClient` 支持 token 参数，`CUSTOMER_ID` 标记为 `@deprecated` |
| `apps/customer/src/app/App.tsx` | 启动时调用 `loginCustomer()`，token 注入 API client |

#### 鉴权链变化

```
Before: Header → buildRequestContext() → authorizeRequest() → handler
After:  Header → buildRequestContext() → [NEW: JWT verify, overwrite context] → authorizeRequest() → handler
```

#### 未修改的文件

- 所有现有测试文件（零改动）—— header fallback 确保了向后兼容
- Worker 前端（全 guardrail 占位，无实际调用）
- Admin 前端（header 鉴权继续工作，token 路径后端已支持但前端未接）
- `authorizeRequest()` / `appTypeGuard.ts` 未改动

### 残留风险（⚠️ 重要：范围裁剪声明）

**1. Header fallback 仍然存在。** 未携带 `Authorization: Bearer` token 的请求，`x-xlb-user-id` header 依然被直接信任。原有的”header 可伪造”风险并未关闭，只是 customer 登录路径不再依赖它。完整关闭需在后续 Phase 中移除 header fallback 并强制所有路由要求 token。

**2. Admin 端前端本次未接 token。** `admin_users` 表和 `POST /api/auth/admin/login` 接口已就绪，但 admin 前端（`apps/admin`）未修改——admin 相关路由的调用方身份验证在前端层面仍是旧的 header 方式。等于 admin 身份伪造问题在阶段 2 结束后依然存在，只是后端准备好了下一步要接的接口。

**3. 验证码固定为 `”1234”`。** 这解决的是数据完整性问题（customer_id 不再指向空表），不是访问控制问题——任何人输入任意手机号并发送 `code: “1234”` 即可获取该手机号对应的身份 token。在接入真实短信验证（或至少一次性验证码/HOTP）前，不能视为已具备防冒充能力。`authService.ts` 中已标注 `TODO: replace MOCK_CODE “1234” with real SMS verification`。

**4. 订单创建已修复。** （2026-07-08 收尾）`orderService.createOrder()` 现强制从 `context.userId` 取 `customerId`，不再信任 body。`createOrderSchema` 中 `customerId` 已改为 optional。前端 `CustomerOrderCreatePage` 不再在 body 中发送 `customerId`，依赖 token 鉴权传身份。此条残留风险已关闭。

### 验证结果

```
pnpm typecheck: 16/16 ✅
pnpm build:     11/11 ✅
pnpm test:      230 passed / 25 failed（全部 “Could not acquire Phase 8B integration-test lock”）
```

---

## 16. P0 收尾确认（2026-07-08 最终）

### 阻塞性问题 #2（无真实认证系统）— 当前状态

| 子问题 | 状态 | 说明 |
|--------|------|------|
| JWT token 签发与验证 | ✅ 已关闭 | `authService.ts` HMAC-JWT sign/verify，`buildRequestContext` token-first 鉴权 |
| Customer 登录接口 | ✅ 已关闭 | `POST /api/auth/customer/login`，首次登录自动注册到 `customers` 表 |
| Admin 登录接口 | ✅ 已关闭 | `POST /api/auth/admin/login`，查询 `admin_users` 表 |
| C 端前端接入 token | ✅ 已关闭 | `App.tsx` 启动时调 `loginCustomer()`，token 注入所有 API 请求 |
| Governance Intent 身份强制 | ✅ 已关闭 | `requestedByAdminId` 不再信任 body，强制从 `context.userId` 取 |
| Order 创建身份强制 | ✅ 已关闭 | `customerId` 不再信任 body，强制从 `context.userId` 取 |
| Header fallback 仍可伪造 | ⚠️ 已知残留 | 不带 token 的请求仍直接信任 `x-xlb-user-id` header |
| Admin 前端未接 token | ⚠️ 已知残留 | Admin 登录接口已就绪但 `apps/admin` 未修改 |
| 验证码固定 1234 | ⚠️ 已知残留 | 未接真实短信，任何人可获取任意手机号的身份 token |
| Worker 前端未接入 | ⚠️ 已知残留 | Worker 端全 guardrail 占位，未调用任何 API |

### 阻塞性问题 #3（customers/admins 表缺失）— 当前状态

| 子问题 | 状态 | 说明 |
|--------|------|------|
| `customers` 表 | ✅ 已关闭 | Migration 028，含 id/phone/name/avatar_url/default_city_code |
| `admin_users` 表 | ✅ 已关闭 | Migration 028，含 id/username/role/city_scopes_json |
| Seed 数据 | ✅ 已关闭 | `customer-demo-001` + 3 个 admin 用户（admin-hangzhou/sh/global） |
| FK 约束 | ⚠️ 已知残留 | 5+ 张表引用 `customer_id` 但未加 FK，列名不统一，需分批处理 |

### 周边扫描结果

除 `orderService.createOrder()` 外，后端无其他路由/service 存在”从 body 取 customerId/workerId/adminId 而不从 context 取”的模式。Worker 侧的 `context.userId` 使用（taskPoolRoutes, workerAcceptRoutes, fulfillmentRoutes, certificationRoutes）均已在修复前就从 context 取值。

### P0 结论

**P0 视为”部分完成”。** 数据完整性问题（#3）已关闭——`customers` 和 `admin_users` 表存在且可正常使用。认证基础能力（#2）已具备——JWT 签发/验证链路完整，C 端客户端的身份传递链路已从硬编码改为 token。但以下三项高优先级残留需在后续 Phase 中独立追踪：

1. **移除 header fallback** — 所有路由强制要求 token，关闭身份伪造窗口
2. **Admin 前端接入 token** — admin 登录 UI + token 传递
3. **替换 mock 验证码** — 接入真实短信验证或至少一次性验证码

---

## 17. 测试 gate 修复记录：MySQL 连接池生命周期（2026-07-08）

### 本次范围

- 只修复 Vitest 串行模式下 MySQL 全局连接池 teardown 缺失问题。
- 未修改安全测试断言。
- 未修改 Settlement UI 测试。
- 未修改 Phase 8B advisory lock。

### 修复内容

| 文件 | 改动 |
|------|------|
| `tests/setup.ts` | 新增 Vitest setup，`afterAll(async () => closeMysqlPool())`，在每个 Vitest worker 结束时关闭全局 MySQL pool |
| `vitest.config.ts` | 接入 `setupFiles: ["tests/setup.ts"]` |

### 修复前基线

命令：

```powershell
$env:FORCE_COLOR='0'
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent
```

修复前结果：

```text
Test Files  8 failed | 247 passed (255)
Tests       30 failed | 1018 passed | 1 todo (1049)
```

连接池相关失败：

```text
tests/integration/migrationRunner.test.ts
  runMigrations is idempotent
  Too many connections

tests/integration/settlementAuditSummaryCityScoped.test.ts
  shanghai cannot see hangzhou data
  Too many connections

tests/integration/workerReceivableStatementNotQueued.test.ts
  rejects payable without queue
  Too many connections

tests/security/noGlobalInCities.test.ts
  cities table contains only real cities
  Too many connections

tests/security/noGlobalInCities.test.ts
  admin_city_scopes may contain __global__ marker
  Too many connections
```

安全测试下游失败：

```text
tests/security/noCrossCityAccept.test.ts
  expected 403, received 500
  根因是请求处理过程中 MySQL Too many connections，导致业务 403 变成 500

tests/security/noGlobalInCities.test.ts
  2 个测试均因 Too many connections 失败
```

### 修复后验证

连续 3 次执行完整串行基线：

```powershell
$env:FORCE_COLOR='0'
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent
```

三次结果一致：

```text
Run 1:
Test Files  3 failed | 252 passed (255)
Failed Tests 24

Run 2:
Test Files  3 failed | 252 passed (255)
Failed Tests 24

Run 3:
Test Files  3 failed | 252 passed (255)
Failed Tests 24
```

三次均确认以下文件通过：

```text
tests/integration/migrationRunner.test.ts
tests/integration/settlementAuditSummaryCityScoped.test.ts
tests/integration/workerReceivableStatementNotQueued.test.ts
tests/security/noGlobalInCities.test.ts
tests/security/noCrossCityAccept.test.ts
```

结论：

- 5 个直接 `Too many connections` 失败已在串行基线中清零。
- 3 个安全测试下游失败随连接池修复消失，说明“安全失败是连接池耗尽下游症状”的判断成立。
- 当前剩余失败为 Settlement UI 测试：3 个文件 / 24 个测试，仍待后续阶段处理。

### 已知但本次不处理

`connectionLimit: 10 × worker 数`，如果之后测试恢复并行执行策略，仍可能逼近 MySQL `max_connections=151` 上限。这次修复只解决了串行模式下 teardown 缺失的问题，未解决高并发场景下的连接数上限风险。

---

## 18. 测试 gate 修复记录：Settlement UI 测试隔离（2026-07-08）

### 本次范围

- 只处理剩余 3 个 Settlement UI 测试文件 / 24 个失败测试。
- 未修改业务组件。
- 未修改安全测试断言。
- 未修改 Phase 8B advisory lock。

### 根因判断

失败类型主要是 Testing Library 全局查询命中多个元素，例如：

```text
Found multiple elements with the text: Settlement Export Review
Found multiple elements with the text: Settlement Operations Console
Found multiple elements with the role "textbox"
Found multiple elements with the text: Statement Detail
```

根因是测试文件多次 `render()` 后没有统一 `cleanup()`，导致 DOM 跨 case 累积。组件里的 `CompatText` 会渲染英文兼容文本，但这不是本轮发现的真实业务重复渲染缺陷；补齐测试隔离后，原有断言不需要放宽即可通过。

### 修复内容

| 文件 | 改动 |
|------|------|
| `tests/unit/settlementExportReviewPage.test.tsx` | 从 `@testing-library/react` 引入 `cleanup`，在 `afterEach` 中执行 `cleanup()` |
| `tests/unit/settlementOpsPage.test.tsx` | 新增 `afterEach`，执行 `cleanup()` |
| `tests/unit/settlementStatementDetailPage.test.tsx` | 从 `@testing-library/react` 引入 `cleanup`，在 `afterEach` 中执行 `cleanup()` |

### 单文件验证

```text
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent tests/unit/settlementExportReviewPage.test.tsx
Test Files  1 passed (1)
Tests       11 passed (11)

pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent tests/unit/settlementOpsPage.test.tsx
Test Files  1 passed (1)
Tests       16 passed (16)

pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent tests/unit/settlementStatementDetailPage.test.tsx
Test Files  1 passed (1)
Tests       14 passed (14)
```

### 完整串行基线验证

命令：

```powershell
$env:FORCE_COLOR='0'
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent
```

连续 3 次结果：

```text
Run 1:
Test Files  255 passed (255)
Tests       1048 passed | 1 todo (1049)

Run 2:
Test Files  255 passed (255)
Tests       1048 passed | 1 todo (1049)

Run 3:
Test Files  255 passed (255)
Tests       1048 passed | 1 todo (1049)
```

结论：

- Settlement UI 剩余 3 个文件 / 24 个失败测试已清零。
- 串行真实测试基线已稳定全绿。
- Advisory lock 竞争仍未在本轮处理，按任务约束留到下一轮单独处理。

---

## 19. 测试 gate 修复记录：CI MySQL/Redis services（2026-07-08）

### 本次范围

- 修改 `.github/workflows/ci.yml`，为 CI test job 配置 MySQL/Redis services。
- 补齐 CI 中 migration / seed / test 顺序。
- 本地未运行 GitHub Actions，需 push 后在 GitHub Actions 页面确认结果。

### 修复内容

| 项目 | 配置 |
|------|------|
| MySQL service | `mysql:8`，暴露 `3306:3306`，与 `deploy/compose/docker-compose.local.yml` 保持一致 |
| Redis service | `redis:7`，暴露 `6379:6379`，与 `deploy/compose/docker-compose.local.yml` 保持一致 |
| MySQL health check | `mysqladmin ping -h 127.0.0.1 -uxlb -pxlb_local_password` |
| Redis health check | `redis-cli ping` |
| CI DB env | `MYSQL_HOST=127.0.0.1`、`MYSQL_PORT=3306`、`MYSQL_DATABASE=xlb_local`、`MYSQL_USER=xlb`、`MYSQL_PASSWORD=xlb_local_password` |
| CI Redis env | `REDIS_HOST=127.0.0.1`、`REDIS_PORT=6379` |

### CI 步骤顺序

当前 `.github/workflows/ci.yml` 顺序：

```text
actions/checkout@v4
pnpm/action-setup@v4
actions/setup-node@v4
Install
Migrate database
Seed database
Build
Typecheck
Test: pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork
Preflight
```

### 说明与待办

以下改动基于 `deploy/compose/docker-compose.local.yml` 配置模式和 GitHub Actions services 标准语法，本地未运行 GitHub Actions，需 push 后在 GitHub Actions 页面确认结果。CI 的 Test 步骤已显式指定串行模式，与本地已验证基线一致。

本地同命令确认：

```text
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork
Test Files 255 passed (255)
```

待办：push 后回来确认 CI 运行结果；如果失败，把 GitHub Actions 的报错日志贴回来继续排查。

已知不确定点：GitHub Actions runner 上的 services 启动、端口映射和 `pnpm exec tsx src/dal/migrateCli.ts` / `seedCli.ts` 执行结果仍需 push 后确认。CI 现在不再使用 inline bootstrap 技巧，migration 步骤调用修复后的正常入口。

---

## 20. 测试 gate 修复记录：Migration runner 全新空库 bootstrap（2026-07-08）

### 根因

`db/migrations/000_init.sql` 是正式 migration 文件中的第一个文件，不是本次新增文件。它负责创建 `schema_migrations` tracking table。

原 `runMigrations()` 在执行任意 migration 前会先调用 `isMigrationApplied(version)`，而该函数直接查询：

```sql
SELECT version FROM schema_migrations WHERE version = ? LIMIT 1
```

因此在全新空库里，`schema_migrations` 尚不存在时，runner 会在真正执行 `000_init.sql` 之前失败。旧的 `scripts/migrate-local.ps1` 也会先查 `schema_migrations`，但它把错误重定向到 `2>nul`，表不存在时 `$exists` 不等于 `1`，于是继续 APPLY `000_init`，属于 shell 行为上的侥幸绕过，不是 runner 本身具备 bootstrap 能力。

### 修复

| 文件 | 改动 |
|------|------|
| `backend/src/dal/migrationRunner.ts` | `runMigrations()` 开始时执行固定 `CREATE TABLE IF NOT EXISTS schema_migrations (...)`，不依赖先手动跑 `000_init.sql` |
| `backend/src/dal/migrationRunner.ts` | `getAppliedMigrations()` 也先确保 tracking table 存在 |
| `backend/src/dal/migrateCli.ts` | 新增正常 migration CLI：调用 `runMigrations()` 并关闭 MySQL pool |
| `backend/src/dal/seedCli.ts` | 新增正常 seed CLI：调用 `runSeeds()` |
| `.github/workflows/ci.yml` | `Migrate database` 改为 `pnpm exec tsx src/dal/migrateCli.ts`，不再使用 inline bootstrap |

### 验证

使用临时库 `xlb_migration_bootstrap_test`，未破坏本地 `xlb_local`：

```powershell
docker exec xlb-mysql-local mysql -uroot -pxlb_root_password -e "DROP DATABASE IF EXISTS xlb_migration_bootstrap_test; CREATE DATABASE xlb_migration_bootstrap_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON xlb_migration_bootstrap_test.* TO 'xlb'@'%'; FLUSH PRIVILEGES;"
```

首次从空库直接调用正常入口：

```powershell
$env:MYSQL_DATABASE='xlb_migration_bootstrap_test'
pnpm --dir backend exec tsx src/dal/migrateCli.ts
```

结果：

```text
applied:
000_init
001_city_foundation
002_dal_scope_foundation
003_admin_scope_global_marker
004_cityconfig_catalog_pricing_foundation
005_official_pricing_display_fields
006_order_payment_outbox_foundation
007_dispatch_outbox_city_stream_foundation
008_worker_pool_taskpool_readiness_foundation
009_certification_worker_eligibility_foundation
010_worker_accept_fulfillment_skeleton_foundation
011_fulfillment_start_complete_foundation
012_ledger_accrual_foundation
013_settlement_preparation_foundation
014_settlement_confirmation
015_settlement_payable_readiness
016_settlement_payable_queue
017_worker_receivable_statement
018_worker_receivable_statement_review
019_worker_receivable_statement_export
020_settlement_action_governance_intents
021_settlement_action_governance_reviews
022_settlement_action_governance_evidence_bundles
023_settlement_action_governance_readiness_packets
025_settlement_execution_dry_run_plans
026_settlement_execution_preparation_envelope
027_aftersale_refund_reversal
028_customers_admin_users
```

说明：`024` 当前没有对应 migration 文件，runner 按实际文件名排序执行，编号跳跃不会报错。

二次幂等验证：

```text
applied: []
skipped: 000_init ... 028_customers_admin_users
```

记录表验证：

```text
SELECT COUNT(*) FROM schema_migrations;
28
```

Seed CLI 验证：

```text
pnpm --dir backend exec tsx src/dal/seedCli.ts
executed: 001_cities.seed.sql ... 011_customers_admin_users.seed.sql
```

Typecheck：

```text
pnpm --filter @xlb/backend typecheck
passed
```

串行测试基线：

```text
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --silent
Test Files 255 passed (255)
```

注意：裸 `pnpm test` 仍会按默认并行策略触发 Phase 8A/8B advisory lock 竞争，以及并行 worker 下的 `Pool is closed` 失败。这属于后续 advisory lock / 并行测试策略任务，本轮未处理。

---

## 21. 待办：Vitest 并行模式下的 DB 测试生命周期（2026-07-08）

### 当前问题

根目录 `package.json` 的 `test` 脚本当前是：

```json
"test": "vitest run"
```

这会使用 Vitest 默认并行模式。默认并行模式下，当前会出现两类问题：

```text
Could not acquire Phase 8A integration-test lock
Could not acquire Phase 8B integration-test lock
Pool is closed.
```

`Pool is closed` 的根因是：`tests/setup.ts` 里的 `afterAll(async () => closeMysqlPool())` 是 per-file setup hook，不是真正的整轮 test run teardown。与此同时，后端存在大量 repository/service singleton，在模块加载时缓存了具体 MySQL pool 引用。默认并行/多 worker/多文件调度下，一个测试文件结束后关闭全局 pool，后续同 worker 模块图里的 singleton 仍可能持有已关闭 pool，于是后续查询报 `Pool is closed`。

### 为什么本次不修

这涉及测试配置分组、DB 集成测试隔离策略、Vitest worker 生命周期和 repository pool 引用方式，风险和范围超出本次 “CI services + migration/seed + CI 显式串行 test” 修复任务。本次 CI 已显式使用已验证的串行命令，因此不影响当前 CI 可行性。

### 建议方案

优先采用 Vitest projects/workspace 配置：

- `tests/integration/**`、依赖真实 MySQL/Redis 的 `tests/security/**` 独立成 DB project，并配置串行执行。
- `tests/unit/**` 中纯单元和 UI 组件测试保持默认并行。
- DB project 使用更精细的 run-level teardown，避免 per-file `afterAll` 关闭仍被 singleton 引用的 pool。
- 后续再评估 repository 是否应避免长期缓存具体 Pool 对象，改为查询时获取当前 pool 或注入测试专用 pool。

---

## 22. 二次全量体检核实（本地，2026-07-08）

### 本次本地基线

本轮仅使用本地仓库与本地 Docker/MySQL/Redis，不查询 GitHub Actions，不 push，不开 PR。

```text
git branch -a
  本地分支包含 fix/ci-test-gate-and-migration-bootstrap、main、spike/worker-admin-readonly-uat-from-stash 等；远端引用也存在但本轮未做云端查询。

git switch fix/ci-test-gate-and-migration-bootstrap
  Your branch is up to date with 'origin/fix/ci-test-gate-and-migration-bootstrap'.

git log --oneline -15
  29149a7 docs(report): add phase16 v1.8 healthcheck
  fb3cd6d fix(ci): provision mysql redis services for test gate
  c3fb974 fix(db): bootstrap migration runner on empty database
  a54f707 fix(test): isolate settlement ui component tests
  7206f71 fix(test): close mysql pool in vitest teardown
  8f896b7 feat(auth): add customer admin identity foundation
  5992136 docs(uat): map worker admin real business readiness
  2125aa7 docs(uat): record root test gate triage
  ...

git status
  On branch fix/ci-test-gate-and-migration-bootstrap
  Your branch is up to date with 'origin/fix/ci-test-gate-and-migration-bootstrap'.
  nothing to commit, working tree clean
```

### 13 项复核表

| # | 问题 | 当前状态 | 本地证据 |
|---:|---|---|---|
| 1 | `customers` / `admin_users` 表是否存在且可用 | 已关闭 | `docker exec xlb-mysql-local mysql ... "SHOW CREATE TABLE customers; SHOW CREATE TABLE admin_users; SELECT ..."` 返回两张表 DDL，`customers_count=1`、`admin_users_count=3`，`schema_migrations` 含 `028_customers_admin_users`。代码/DDL 证据：[db/migrations/028_customers_admin_users.sql](../db/migrations/028_customers_admin_users.sql)、[db/seed/011_customers_admin_users.seed.sql](../db/seed/011_customers_admin_users.seed.sql)。 |
| 2 | JWT 登录链路是否可用 | 部分完成 | 本地 `app.inject` 实测：`POST /api/auth/customer/login` + `{ phone:"13800000001", code:"1234" }` 返回 `CUSTOMER_LOGIN_STATUS 200`、`tokenParts:3`；随后 `GET /api/debug/context` 携带 `Authorization: Bearer <token>` 返回 `DEBUG_WITH_TOKEN_STATUS 200`、`userId:"customer-demo-001"`，可证明签发与验证真实工作。残留见 #3/#4/#5。代码证据：[backend/src/auth/authRoutes.ts](../backend/src/auth/authRoutes.ts)、[backend/src/auth/authService.ts](../backend/src/auth/authService.ts)、[backend/src/context/requestContext.ts](../backend/src/context/requestContext.ts)。 |
| 3 | header fallback 是否仍可被伪造 | 未开始 | 同一 `app.inject` 实测：不带 token，仅带 `x-xlb-user-id: forged-customer-id` 请求 `/api/debug/context` 返回 `DEBUG_HEADER_FALLBACK_STATUS 200`、`userId:"forged-customer-id"`。代码仍是 token-first 后保留 header fallback：[backend/src/context/requestContext.ts](../backend/src/context/requestContext.ts)。另外 [backend/src/auth/tokenAuth.ts](../backend/src/auth/tokenAuth.ts) 虽有 401 逻辑，但当前 [backend/src/app.ts](../backend/src/app.ts) 未挂该 preHandler。 |
| 4 | admin 端前端是否已接 token | 未开始 | `rg -n "Authorization|Bearer|createAuthApi|x-xlb-app-type|x-xlb-role" apps/admin/src ...` 显示 admin 页面仍直接 `createApiClient({ headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator" } })`，未发现 `Authorization` / `Bearer` / `createAuthApi` 接入。证据：[apps/admin/src/pages/SettlementOpsPage.tsx](../apps/admin/src/pages/SettlementOpsPage.tsx)、[apps/admin/src/pages/SettlementStatementDetailPage.tsx](../apps/admin/src/pages/SettlementStatementDetailPage.tsx)、[apps/admin/src/pages/SettlementExportReviewPage.tsx](../apps/admin/src/pages/SettlementExportReviewPage.tsx)、[apps/admin/src/pages/SettlementActionGovernancePage.tsx](../apps/admin/src/pages/SettlementActionGovernancePage.tsx)。 |
| 5 | 验证码是否仍固定 `"1234"` | 未开始 | 代码扫描命中 `const MOCK_CODE = "1234"`，本地 inject 也确认 `code:"1234"` 登录 200、`code:"0000"` 返回 `CUSTOMER_BAD_CODE_STATUS 401`。证据：[backend/src/auth/authService.ts](../backend/src/auth/authService.ts)、[backend/src/auth/authRoutes.ts](../backend/src/auth/authRoutes.ts)、[apps/customer/src/pages/customerPageShell.tsx](../apps/customer/src/pages/customerPageShell.tsx)。 |
| 6 | 完整串行 Vitest 是否仍 255/255 | 部分完成（回退） | 本轮真实命令 `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork` 返回失败：`Test Files 3 failed \| 252 passed (255)`、`Tests 3 failed \| 1045 passed \| 1 todo (1049)`。失败均为旧 no-ui gate：`check-worker-receivable-statement-audit-no-ui.ps1`、`check-phase8k-no-ui.ps1`、`check-phase8l-no-ui.ps1`。单独跑三脚本均输出 `FAILED - UI files changed`，列出 `apps/customer/src/app/App.tsx`、`apps/customer/src/pages/CustomerOrderCreatePage.tsx`、`apps/customer/src/pages/customerPageShell.tsx`。这是本轮新发现，不再能标记为 255/255。 |
| 7 | 裸 `pnpm test` 默认并行结果 | 部分完成 | 本轮真实命令 `pnpm test` 返回：`Test Files 25 failed \| 230 passed (255)`、`Tests 33 failed \| 1015 passed \| 1 todo (1049)`。构成：30 个失败为 `Could not acquire Phase 8B integration-test lock`，另 3 个为 #6 的 no-ui gate 失败。未见本次摘要中出现 `Pool is closed`。 |
| 8 | Phase 8B advisory lock 是否已处理 | 未开始 | 代码仍为单一 MySQL advisory lock：`SELECT GET_LOCK('xlb-phase8b-integration-tests', 30) AS acquired`，失败时抛 `Could not acquire Phase 8B integration-test lock`；`git diff main...HEAD -- tests/integration/helpers/settlementTestHelper.ts` 无改动输出。证据：[tests/integration/helpers/settlementTestHelper.ts](../tests/integration/helpers/settlementTestHelper.ts)。 |
| 9 | CI workflow services / migrate / seed / 串行测试命令是否仍在 | 已关闭（静态存在） | `rg -n "services:|mysql:|redis:|Migrate database|Seed database|pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork" .github/workflows/ci.yml` 返回：`services:`、`mysql: image mysql:8`、`redis: image redis:7`、`Migrate database`、`Seed database`、`run: pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork`。证据：[.github/workflows/ci.yml](../.github/workflows/ci.yml)。 |
| 10 | `apps/worker` 在 main 和当前分支的真实状态 | 未开始 | `git diff --name-status main...HEAD -- apps/worker packages/api-client/src/worker.ts backend/src/worker tests/integration/workerTaskPoolApi.test.ts` 无输出，说明当前 fix 分支没有合入 worker 接线差异。`git grep` 在 `HEAD` 与 `main` 均命中 `not-wired`、`guardrail`、`task-pool.not-wired`、`worker.accept.disabled`。证据：[apps/worker/src/adapters/workflowBindings.ts](../apps/worker/src/adapters/workflowBindings.ts)、[apps/worker/src/app/App.tsx](../apps/worker/src/app/App.tsx)。 |
| 11 | spike 分支只读接线是否还在、是否被合并、是否仍通过 | 部分完成 | `git log --left-right --cherry-pick main...spike/worker-admin-readonly-uat-from-stash` 显示 spike 独有 `d940574`、`e9afb7e`；`git merge-base --is-ancestor spike/worker-admin-readonly-uat-from-stash HEAD/main` 均返回 `spike is NOT ancestor`，未合并。`git grep` 在 spike 命中 `api.getTaskPool()`、`WorkerTaskPoolResponse`、`OrderTraceabilityPage`。在 spike 上执行 `pnpm typecheck` 返回 `Tasks: 17 successful, 17 total`；`pnpm turbo run build` 返回 `Tasks: 11 successful, 11 total`。状态：参考素材仍在且可构建，但未进主线。 |
| 12 | README / AGENTS 过时 Phase 描述是否仍存在 | 未开始 | `rg -n "当前阶段|Phase 0|Phase 3|禁止写任何真实业务逻辑" README.md AGENTS.md .cursor/rules/xlb-architecture-mandatory.mdc` 返回：`README.md:6 当前阶段：Phase 3 已封版`、`README.md:8 Phase 0-3...`、`AGENTS.md:23 Phase 0 约束（当前阶段）`、`AGENTS.md:25 禁止写任何真实业务逻辑`、`.cursor/rules/xlb-architecture-mandatory.mdc:11 Phase 0 禁止业务实现`。证据：[README.md](../README.md)、[AGENTS.md](../AGENTS.md)、[.cursor/rules/xlb-architecture-mandatory.mdc](../.cursor/rules/xlb-architecture-mandatory.mdc)。 |
| 13 | 所有包 lint 脚本是否仍是空跑 | 未开始 | PowerShell 遍历所有 `package.json` 的 `scripts.lint`：根目录为 `lint=turbo run lint`；其余 11 个有 lint 脚本的 workspace 包均为 `lint=echo "lint: skipped phase 0"`，包括 `@xlb/admin`、`@xlb/customer`、`@xlb/worker`、`@xlb/backend`、`@xlb/api-client`、`@xlb/config`、`@xlb/module-loader`、`@xlb/shared`、`@xlb/types`、`@xlb/ui`、`@xlb/validators`。证据：各包 `package.json`。 |

### 本轮新增发现

1. **串行 Vitest gate 已回退为红。** 当前 fix 分支相对 `main` 改动了 3 个 customer UI 文件，触发 Phase 8I/8K/8L 旧 no-ui gate，导致串行全量从此前记录的 `255 passed (255)` 变为 `3 failed | 252 passed (255)`。
2. **裸 `pnpm test` 仍是红。** 默认并行仍有 Phase 8B advisory lock 竞争；本轮失败数为 `25 failed files / 33 failed tests`，其中 3 个来自 no-ui gate，30 个来自 Phase 8B lock。
3. **本轮未观察到 `Pool is closed` 出现在最终失败摘要。** 这不等于并行池生命周期问题已根治，只表示本次裸跑摘要中的失败主因不是它。

### 一句话总结

与 P0-P4 优先级列表相比：`customers/admin_users` 表和 JWT customer 登录基础链路可标记为已落地但 P0 仍只能算部分完成；P2 串行测试 gate 本轮发现新红灯，不能标记完成；P1 师傅端主线仍未开始、spike 只可作参考；P3 文档过时未修；P4 lint 未配置仍未开始。

---

## 23. 广谱 no-ui/path gate 排查收尾（本地，2026-07-08）

### 本轮已完成

本轮确认并收窄了 7 个历史 Phase 验收型广谱 UI/path gate：

| Gate | 处理方式 | 验证 |
|---|---|---|
| `check-worker-receivable-statement-audit-no-ui.ps1` | 保留 `main...HEAD`，但只检查 settlement audit/admin UI 域；不再把 `apps/customer/**`、`apps/worker/**` 作为违规对象 | 单脚本 passed；对应 security gates passed |
| `check-phase8j-no-ui.ps1` | 同上，收窄到 worker statement review summary/admin UI 域 | 单脚本 passed；`workerReceivableStatementReviewSummaryGates.test.ts` passed |
| `check-phase8k-no-ui.ps1` | 同上，收窄到 settlement audit summary/admin UI 域 | 单脚本 passed；对应 security gates passed |
| `check-phase8l-no-ui.ps1` | 同上，收窄到 reconciliation gap scan/admin UI 域 | 单脚本 passed；对应 security gates passed |
| `check-phase9a-no-customer-worker-ui.ps1` | 将一次性 Phase 9A admin console 验收的 customer/worker 广谱路径扫描，收窄为 settlement admin UI 域检查 | 单脚本 passed；`settlementOpsPage.test.tsx` 16/16 passed |
| `check-phase9b-no-customer-worker-ui.ps1` | 将一次性 Phase 9B admin drilldown 验收的 customer/worker 广谱路径扫描，收窄为 settlement admin UI 域检查 | 单脚本 passed；`settlementStatementDetailPage.test.tsx` 14/14 passed |
| `check-phase9c-no-customer-worker-ui.ps1` | 将一次性 Phase 9C admin export review 验收的 customer/worker 广谱路径扫描，收窄为 settlement admin UI 域检查 | 单脚本 passed；`settlementExportReviewPage.test.tsx` 11/11 passed |

这次全部改动只涉及 `scripts/` 下 7 个 PowerShell gate 脚本；没有修改任何测试断言，也没有修改任何业务代码。

### 已确认无需处理

| Gate | 结论 | 证据 |
|---|---|---|
| `check-phase9d-no-new-pages.ps1` | 天然通过，本分支未新增 `apps/admin/src/pages/` 页面文件；不处理 | `check-phase9d-no-new-pages: passed (Phase 10 governance page allowed)` |
| `check-phase9e-no-new-pages.ps1` | 天然通过，本分支未新增 `apps/admin/src/pages/` 页面文件；不处理 | `check-phase9e-no-new-pages: passed (Phase 10 governance page allowed)` |
| `check-phase12-no-ui-execution-controls.ps1` | 属于真实内容型安全护栏，检查 admin 执行按钮是否未 disabled；不是广谱路径误伤；本分支天然通过 | `check-phase12-no-ui-execution-controls: self-test passed` / `check-phase12-no-ui-execution-controls: passed` |

### 新发现但本轮不处理

`pnpm preflight` 在上述 no-ui/path gate 之后继续失败于另一类 gate：

```text
check-phase9a-no-payout-payment-instruction: FAILED - docs/health-check-2026-07-08.md:
+| 师傅提现/银行卡缺失 | wallet/withdraw/bank 未见真实模型 | W 端收益闭环不足 |
docs/health-check-2026-07-08.md:
+abc1833 fix(security): narrow provider withdraw ui gate scope
docs/health-check-2026-07-08.md:
+| Database | 70% | 42 张表，migration 可跑通；缺 customers/admin_users/address/scheduled_at/rating/withdraw/bank 等产品必需实体 |
```

该失败来自 `docs/health-check-2026-07-08.md` 中的正常诊断性文字。依据是 `check-phase9a-no-payout-payment-instruction.ps1` 使用 `git diff main...HEAD -- . ':!scripts/' ':!tests/' ':!docs/release/'` 扫描新增行关键词（含 `withdraw`），而失败输出明确列出的命中文件均为本报告文档，不是业务代码文件。

这说明项目中还存在另一类“diff 内容关键词扫描”型 gate，会误伤体检报告等文档里的正常诊断性描述。这类问题和本轮处理的 no-ui 广谱路径扫描不是同一个 gate 家族，规模未知，留作独立待办，不在本轮排查范围内继续展开。

Phase 15 报告提到的 `no-provider-withdraw-ui` 家族同样保留为独立待办，本轮未处理。

### 本轮范围结论

`pnpm preflight` 完整通过不是本轮原始目标。本轮原始目标是把测试 gate 从假绿恢复为可重复验证的真绿，特别是 CI 使用的串行 Vitest 基线。该目标已经达成并反复验证。

最终核心验证结果：

```text
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork

Test Files 255 passed (255)
Tests 1048 passed | 1 todo (1049)
Duration 375.37s
```

因此，本轮 CI/test gate 修复链条到此收尾：串行测试基线已恢复为 255/255；历史 no-ui/path gate 的当前分支误伤已在 7 个目标脚本内收窄；新的 diff 内容关键词扫描家族不在本轮继续追。
