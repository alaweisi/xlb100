# PHASE8F_WORKER_RECEIVABLE_STATEMENT_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**路径：** `E:\xlb100`  
**阶段：** Phase 8F — Worker Receivable Statement Foundation  
**报告日期：** 2026-07-04  

---

## 1. 阶段基本信息

| 项 | 值 |
|----|-----|
| Phase 名称 | Phase 8F — Worker Receivable Statement Foundation |
| 当前分支 | `phase8f-worker-receivable-statement-foundation` |
| 基线 main commit | `9a0e7ae05f67068e96fcc3e6cad3f85326078481` — docs(phase8e): record settlement payable queue post-lock state |
| 上一阶段稳定 tag | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |
| 本 Phase commit | `66b6419c2211856a9f5c0ac83cc6b421b13e9c77` — feat(phase8f): establish worker receivable statement foundation |
| 是否 merge main | **否** |
| 是否打 tag | **否** |
| 下一 Phase 是否启动 | **Phase 8G 未启动** |

---

## 2. 本阶段工程目标

### 2.1 要解决的问题

在 Phase 8E 已将 payable 行写入内部队列（`settlement_payable_queue`，status=`queued`）之后，按 `settlement_items.worker_id` 聚合生成**师傅维度应收对账快照**，供运营/财务审计使用。

### 2.2 业务链路位置

```
ledger_accruals
→ prepare-once (8B)
→ confirm (8C)
→ mark-payable (8D)
→ enqueue-once (8E)
→ generate-worker-statements-once (8F)   ← 本 Phase
→ worker_receivable_statements
→ worker_receivable_statement_lines
→ worker.receivable.statement.created outbox
```

### 2.3 与上一 Phase 的关系

- **输入：** Phase 8E 的 `settlement_payable_queue`（必须 `status=queued`）及同 batch 的 `settlement_items`（只读）
- **不修改：** 8E queue 行、8D payable、8C batch、8B items 快照、8A ledger、上游 order/payment/fulfillment/accrual

### 2.4 本 Phase 明确不做什么

- 不是 payout / paid settlement / mock payout / 提现 / 银行卡打款
- 不是 payment instruction / provider / payment channel / 微信·支付宝分账
- 不是 refund / aftersale / reversal
- 不写 `ledger_entries`
- 不修改 `settlement_payable_queue.status` / `settlement_payables.status` / `settlement_batches.status`
- 不修改 order / payment / fulfillment / ledger_accruals
- 不改三端 UI（`apps/customer` / `apps/worker` / `apps/admin`）

---

## 3. 本阶段实际完成的工程内容

### 3.1 DB migration

| 文件 | 说明 |
|------|------|
| **新增** `db/migrations/017_worker_receivable_statement.sql` | Phase 8F 唯一 migration，append-only |

### 3.2 新增表

**`worker_receivable_statements`**

| 字段 | 类型/约束 |
|------|-----------|
| `statement_id` | PK |
| `city_code` | FK → cities，CHECK ≠ `__global__` |
| `queue_id` | FK → `settlement_payable_queue` |
| `settlement_payable_id` | FK → `settlement_payables` |
| `settlement_batch_id` + `city_code` | FK → `settlement_batches` |
| `worker_id` | 师傅维度聚合键 |
| `currency` | CHECK = `CNY` |
| `gross_amount` / `platform_fee_amount` / `worker_receivable_amount` | DECIMAL(10,2)，≥ 0 |
| `item_count` | INT ≥ 1 |
| `status` | CHECK = `created` only |
| `generated_at` / `generated_by` | 审计字段 |
| `created_at` / `updated_at` | 时间戳 |
| UNIQUE | `(queue_id, worker_id)` |

**`worker_receivable_statement_lines`**

| 字段 | 类型/约束 |
|------|-----------|
| `line_id` | PK |
| `statement_id` | FK → statements |
| `city_code` | FK → cities |
| `settlement_item_id` | FK → `settlement_items` |
| `settlement_batch_id` + `city_code` | FK → batches |
| `worker_id` / `order_id` / `fulfillment_id` / `sku_id` | 自 item 快照复制 |
| `currency` | CHECK = `CNY` |
| `gross_amount` / `platform_fee_amount` / `worker_receivable_amount` | 自 item 快照复制 |
| `created_at` | 时间戳 |
| UNIQUE | `(statement_id, settlement_item_id)` |

**未修改表：** `settlement_payable_queue`、`settlement_payables`、`settlement_batches`、`settlement_items`、`ledger_*`、`orders`、`payment_orders`、`fulfillments`

### 3.3 Types（`packages/types`）

| 文件 | 新增内容 |
|------|----------|
| `settlement.ts` | `WorkerReceivableStatementStatus`（`created`）、`WorkerReceivableStatement`、`WorkerReceivableStatementLine`、`WorkerReceivableStatementCreatedEventPayload` |
| `eventOutbox.ts` | `OutboxEventType` 增加 `worker.receivable.statement.created` |
| `index.ts` | 导出上述类型 |

### 3.4 Validators（`packages/validators`）

| 文件 | 新增内容 |
|------|----------|
| `settlementSchema.ts` | `workerReceivableStatementSchema`、`workerReceivableStatementLineSchema`、`generateWorkerReceivableStatementsRequestSchema`、`generateWorkerReceivableStatementsResponseSchema`、`listWorkerReceivableStatementsResponseSchema`、`getWorkerReceivableStatementResponseSchema`、`workerReceivableStatementCreatedEventPayloadSchema` |
| `eventOutboxSchema.ts` | outbox enum 增加 `worker.receivable.statement.created` |
| `index.ts` | 导出上述 schema 与类型 |

### 3.5 Service

| 文件 | 说明 |
|------|------|
| **新增** `backend/src/settlement/workerReceivableStatementService.ts` | `generateWorkerReceivableStatements`、`listWorkerReceivableStatementsByPayable`、`getWorkerReceivableStatement`；queued-only；按 worker 聚合；幂等 |

### 3.6 Repository

| 文件 | 说明 |
|------|------|
| **新增** `backend/src/settlement/workerReceivableStatementRepository.ts` | `findStatementsByQueue`、`insertStatement`、`insertStatementLine`、`listStatementsByPayable`、`getStatementById`、`listStatementLines`；city scoped |

### 3.7 修改的 settlement 模块文件

| 文件 | 变更 |
|------|------|
| `settlementRoutes.ts` | 注册 3 条 internal API |
| `settlementStateMachine.ts` | `canGenerateWorkerReceivableStatements` / `assertWorkerReceivableStatementGeneratable` |
| `settlementIds.ts` | `generateWorkerReceivableStatementId`（`wrs_*`）、`generateWorkerReceivableStatementLineId`（`wrl_*`） |
| `README.md` | Phase 8F 边界说明 |

### 3.8 API（internal，admin operator + city scope）

| Method | Path |
|--------|------|
| POST | `/api/internal/settlement/payables/:payableId/generate-worker-statements-once` |
| GET | `/api/internal/settlement/payables/:payableId/worker-statements` |
| GET | `/api/internal/settlement/worker-statements/:statementId` |

**未返回字段：** payoutId、paidAt、provider、channel、transferId、account、withdraw、payment instruction

### 3.9 Outbox event

| event_type | aggregate_type | 规则 |
|------------|----------------|------|
| `worker.receivable.statement.created` | `worker_receivable_statement` | 每个 worker statement 唯一 1 条；payload 含 statementId、queueId、payableId、batchId、workerId、金额快照、generatedAt/By |

### 3.10 测试

| 层 | 新增文件 |
|----|----------|
| unit | `tests/unit/workerReceivableStatementService.test.ts` |
| unit（修改） | `settlementIds.test.ts`、`settlementStateMachine.test.ts` |
| integration | `workerReceivableStatement.test.ts`、`workerReceivableStatementIdempotency.test.ts`、`workerReceivableStatementCityScoped.test.ts`、`workerReceivableStatementNotQueued.test.ts`、`workerReceivableStatementNoUpstreamMutation.test.ts` |
| integration（修改） | `helpers/settlementTestHelper.ts` — `createQueuedSettlement`、`generateWorkerReceivableStatements` 等 |
| contract | `workerReceivableStatement.contract.test.ts` |
| security | `workerReceivableStatementGates.test.ts` |

### 3.11 守门脚本（新增 8 个）

- `check-worker-receivable-statement-queued-only.ps1`
- `check-worker-receivable-statement-city-scoped.ps1`
- `check-worker-receivable-statement-outbox-idempotent.ps1`
- `check-worker-receivable-statement-no-ledger-entries.ps1`
- `check-worker-receivable-statement-no-upstream-mutation.ps1`
- `check-worker-receivable-statement-no-payout-paid.ps1`
- `check-worker-receivable-statement-no-provider-withdraw-ui.ps1`
- `check-worker-receivable-statement-no-refund-aftersale-reversal.ps1`

**preflight：** `scripts/preflight-architecture.ps1` 纳入 Phase 8F 文件清单与通过日志

### 3.12 架构 / 契约 / 字典文档

| 文件 | 说明 |
|------|------|
| **新增** `docs/architecture/17_XLB_WORKER_RECEIVABLE_STATEMENT_FOUNDATION.md` | Phase 8F 架构基线 |
| **新增** `docs/contracts/CONTRACT_WORKER_RECEIVABLE_STATEMENT.md` | API/幂等/城市隔离契约 |
| **修改** `db/dictionary/TABLES.md` | Phase 8F 表说明 |
| **修改** `db/schema/settlement.sql` | schema 引用注释 |

### 3.13 CURRENT_STATE 修改内容

| 文件 | 变更摘要 |
|------|----------|
| `docs/CURRENT_STATE.md` | 标明 main @ `9a0e7ae`（8E locked）；active branch 为 8F feature branch；8F in progress / not Lock；8G NOT started；事件链延伸至 `worker.receivable.statement.created`；8F 边界三条 |

---

## 4. 本阶段施工清单

### 4.1 改动目录（相对基线 `9a0e7ae`，39 files，+1584 / −17 lines）

| 目录 | 变更 |
|------|------|
| `backend/src/settlement/` | +2 新文件，+4 修改 |
| `db/migrations/` | +1 |
| `db/dictionary/`、`db/schema/` | 文档 |
| `packages/types/`、`packages/validators/` | 契约扩展 |
| `scripts/` | +8 gate，preflight 更新 |
| `docs/architecture/`、`docs/contracts/`、`docs/reports/`、`docs/CURRENT_STATE.md` | 文档 |
| `tests/unit/`、`tests/integration/`、`tests/contract/`、`tests/security/` | 测试 |

### 4.2 核心文件清单

- `workerReceivableStatementService.ts` — 业务主逻辑
- `workerReceivableStatementRepository.ts` — 持久化
- `017_worker_receivable_statement.sql` — 表结构
- `settlementRoutes.ts` — API 入口

### 4.3 未改动的禁止目录

| 目录 | 状态 |
|------|------|
| `apps/customer/`、`apps/worker/`、`apps/admin/` | **未改**（gate + git diff 确认） |
| `backend/src/providers/` | 未改（仍为 placeholder） |
| `backend/src/payment/`、`order/`、`fulfillment/`、`ledger/` 业务逻辑 | 未改（8F 仅 settlement 模块扩展） |
| `db/migrations/001`–`016` | 未改（append-only） |

### 4.4 变更类型汇总

| 类型 | 是否有 |
|------|--------|
| 业务代码改动 | **是** — settlement 模块（符合 Phase 8F 范围） |
| DB 改动 | **是** — migration `017` 新增 2 表 |
| 测试改动 | **是** — 新增 8 个测试文件 + 2 个修改 |
| UI 改动 | **否** |

---

## 5. 本阶段验证结果

**复验时间：** 2026-07-04（分支 `phase8f-worker-receivable-statement-foundation` @ `66b6419`）

### 5.1 工程命令

| 命令 | 结果 |
|------|------|
| build | **10/10 passed** |
| typecheck | **14/14 passed** |
| test | **201 files / 381 passed / 1 todo**（基线 8E：193 / 358 / 1 todo） |
| preflight | **passed**（Phase 0–8F） |

### 5.2 Phase 历史守门脚本

| Phase | 结果 |
|-------|------|
| Phase 8B（6） | 6/6 passed |
| Phase 8C（8） | 8/8 passed |
| Phase 8D（8） | 8/8 passed |
| Phase 8E（8） | 8/8 passed |

### 5.3 本 Phase 新增守门脚本

| Phase 8F（8） | 8/8 passed |

### 5.4 基础设施

| 项 | 结果 |
|----|------|
| Docker MySQL (`xlb-mysql-local`) | healthy |
| Docker Redis (`xlb-redis-local`) | healthy |
| migrate-local | passed；`017_worker_receivable_statement` applied |
| seed-local | passed |

### 5.5 Live API 验证

完整链路（integration + DB spot-check）：

```
ledger_accruals → prepare-once → confirm → mark-payable → enqueue-once
→ generate-worker-statements-once
→ worker_receivable_statements + worker_receivable_statement_lines
→ worker.receivable.statement.created outbox
```

| 步骤 | 结果 / ID |
|------|-----------|
| prepare-once | processed=1 |
| confirm | batch status=`confirmed` |
| mark-payable | payable status=`payable` |
| enqueue-once | queue status=`queued` |
| generate 1st | statements created，`idempotent=false` |
| generate 2nd | `idempotent=true` |
| Statement | `wrs_mr5sbovy_4b20a75c` |
| Line | `wrl_mr5sbow1_18a15e5d` |
| Outbox | `evt_mr5sbow3_3967d36c` |
| Worker | `worker-demo-hangzhou` |
| 金额 | 89.00 / 8.90 / 80.10 CNY |

### 5.6 幂等验证

- 第二次 `generate-worker-statements-once` 返回 `idempotent=true`
- `generated_at` / `generated_by` 不被覆盖
- DB：`worker_receivable_statements` 每 `(queue_id, worker_id)` 仍 1 行
- DB：`worker_receivable_statement_lines` 每 `(statement_id, settlement_item_id)` 仍 1 行
- DB：`worker.receivable.statement.created` outbox 每 statement 仍 1 条

### 5.7 跨城市隔离验证

- 杭州 payable 在上海 context 下 generate → **HTTP 404**
- 上海 list / GET statement detail → **HTTP 404**

### 5.8 未 queued 不可 generate

- 仅有 payable、无 queue → **HTTP 404**

### 5.9 上游状态不变验证

- `orders.status` = paid
- `payment_orders.status` = paid
- `fulfillments.status` = completed
- `ledger_accruals.status` = accrued

### 5.10 ledger_entries 不变验证

- 源 fulfillment 仍 **3 条** ledger_entries（customer debit / platform credit / worker credit）
- 无新增 ledger 写入

### 5.11 金额快照不变验证

- `settlement_items`：89.00 / 8.90 / 80.10 不变
- statement 汇总与 queue/payable/batch 快照一致

### 5.12 settlement 快照 status 不变验证

| 实体 | generate 后 status |
|------|-------------------|
| `settlement_payable_queue` | `queued` |
| `settlement_payables` | `payable` |
| `settlement_batches` | `confirmed` |

---

## 6. 本阶段边界结论

| 边界项 | 是否存在 |
|--------|----------|
| payout | **否** |
| settlement paid | **否** |
| mock payout | **否** |
| payout table/API | **否** |
| provider/payment channel | **否** |
| payment instruction | **否** |
| refund | **否** |
| aftersale | **否** |
| reversal | **否** |
| 微信/支付宝分账 | **否** |
| 提现 | **否** |
| UI 改动 | **否** |
| 新增 ledger_entries | **否** |
| 修改 order/payment/fulfillment/ledger_accruals | **否** |

---

## 7. 本阶段结论

| 项 | 结论 |
|----|------|
| 本 Phase 主体是否完成 | **是** |
| 是否已 Lock | **Lock 进行中**（本节以下为 Lock 复验） |
| 是否已 merge main | **否**（Lock 前） |
| 是否已打 tag | **否**（Lock 前） |
| 是否可以进入下一步 Lock | **是** — 正在执行 Phase 8F-Lock |
| 下一 Phase 是否未启动 | **是** — Phase 8G 未启动 |

---

## 8. Phase 8F-Lock 复验（2026-07-04，Lock 前）

### 8.1 基线

| 项 | 值 |
|----|-----|
| 分支 | `phase8f-worker-receivable-statement-foundation` |
| Phase 8F 主体 commit | `66b6419` |
| 过程报告 commit | `6d519d7` |
| 基线 main | `9a0e7ae` |
| Phase 8E tag | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |

### 8.2 工程验证

| Check | Result |
|-------|--------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | **201 files / 381 passed / 1 todo** |
| preflight | passed (Phase 0–8F) |

### 8.3 守门脚本

| Phase | Result |
|-------|--------|
| Phase 8B (6) | 6/6 passed |
| Phase 8C (8) | 8/8 passed |
| Phase 8D (8) | 8/8 passed |
| Phase 8E (8) | 8/8 passed |
| Phase 8F (8) | 8/8 passed |

### 8.4 基础设施

| Check | Result |
|-------|--------|
| Docker MySQL | healthy |
| Docker Redis | healthy |
| migrate-local | passed (017 applied) |
| seed-local | passed |

### 8.5 Live API 复验（Lock run）

| Step | ID / result |
|------|-------------|
| prepare-once | processed=1 |
| confirm | status=confirmed |
| mark-payable | status=payable |
| enqueue | status=queued |
| generate 1st | status=created, idempotent=false |
| generate 2nd | idempotent=true; generatedAt / generatedBy unchanged |
| Statement | `wrs_mr5splu8_1aa20208` |
| Line | `wrl_mr5splu9_4a51640a` |
| worker.receivable.statement.created | `evt_mr5splua_a594e207` |
| queue / payable / batch | queued / payable / confirmed |
| Amount snapshot | 89.00 / 8.90 / 80.10 |
| Not queued generate | HTTP 404 |
| Cross-city | HTTP 404 |
| ledger_entries | 3 per fulfillment (unchanged) |

### 8.6 越界检查

无 payout / paid / payment instruction / provider / withdraw / refund / aftersale / reversal / UI / ledger 写入 / 上游 mutation / queue·payable·batch status 变更。

**Phase 8F Lock 准备完成 — 待 merge main。Phase 8G 未启动。**

**声明：** Worker receivable statement 是**对账单快照层**，不是付款、不是打款、不是 paid settlement、不是 payout、不是提现、不是分账、不是支付平台、不是 payment instruction。
