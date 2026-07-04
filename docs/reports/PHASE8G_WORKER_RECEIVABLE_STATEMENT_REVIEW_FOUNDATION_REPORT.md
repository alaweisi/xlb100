# PHASE8G_WORKER_RECEIVABLE_STATEMENT_REVIEW_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**路径：** `E:\xlb100`  
**阶段：** Phase 8G — Worker Receivable Statement Review Foundation  
**报告日期：** 2026-07-04  

## Lock status — **LOCKED**

| Item | Value |
|------|-------|
| **Merged to main** | yes |
| **main merge commit** | `dbe3824253035b9bca2b77a69dfa92d9ae6b1d33` |
| **Phase 8G body commit** | `2b34a381008da36d370e6258dca1e291586dcc50` |
| **docs finalize commit** | `2ff8a4d19e9b4295bc93a9924b5de9709f0b3f17` |
| **Tag** | `xlb-phase8g-worker-receivable-statement-review` → post-lock main HEAD |
| **Phase 8F tag (retained)** | `xlb-phase8f-worker-receivable-statement` → `214da7c` |
| **Current branch** | `main` |
| **Phase 8H** | **NOT started** |

---

## 1. 阶段基本信息

| 项 | 值 |
|----|-----|
| Phase 名称 | Phase 8G — Worker Receivable Statement Review Foundation |
| 当前分支 | `phase8g-worker-receivable-statement-review-foundation` |
| 基线 main commit | `214da7c` — docs(phase8f): record worker receivable statement post-lock state |
| 上一阶段稳定 tag | `xlb-phase8f-worker-receivable-statement` → `214da7c` |
| 本 Phase commit | `2b34a381008da36d370e6258dca1e291586dcc50` — feat(phase8g): establish worker receivable statement review foundation |
| 是否 merge main | **否** |
| 是否打 tag | **否** |
| Phase 8H 是否启动 | **否** |

---

## 2. 本阶段工程目标

### 2.1 要解决的问题

对 Phase 8F 已生成的 `worker_receivable_statements`（status=`created`）做一次性 internal 审核记录，decision 为 `approved` 或 `rejected`，并写入 `worker.receivable.statement.reviewed` outbox。

### 2.2 业务链路位置

```
worker_receivable_statements(status=created)
→ review-once (8G)
→ worker_receivable_statement_reviews
→ worker.receivable.statement.reviewed outbox
```

完整链路：

```
ledger_accruals → prepare → confirm → mark-payable → enqueue
→ generate-worker-statements-once → review-once
```

### 2.3 与 Phase 8F 的关系

- **输入：** 8F 的 `worker_receivable_statements`（必须 `status=created`）及关联 queue/payable/batch（只读校验）
- **不修改：** statement.status、statement lines、queue/payable/batch 状态、ledger、上游 order/payment/fulfillment/accrual

### 2.4 本 Phase 明确不做什么

- 不是 payout / paid settlement / mock payout / 提现
- 不是 payment instruction / provider / payment channel / 微信·支付宝分账
- 不是 refund / aftersale / reversal
- 不写 `ledger_entries`
- 不修改 `worker_receivable_statements.status`
- 不修改 `settlement_payable_queue` / `settlement_payables` / `settlement_batches` 状态
- 不改三端 UI

---

## 3. 本阶段实际完成的工程内容

### 3.1 DB migration

| 文件 | 说明 |
|------|------|
| **新增** `db/migrations/018_worker_receivable_statement_review.sql` | Phase 8G 唯一 migration |

### 3.2 新增表 `worker_receivable_statement_reviews`

| 字段 | 类型/约束 |
|------|-----------|
| `review_id` | PK |
| `city_code` | FK → cities，CHECK ≠ `__global__` |
| `statement_id` | FK → `worker_receivable_statements`，**UNIQUE** |
| `queue_id` | FK → `settlement_payable_queue` |
| `settlement_payable_id` | FK → `settlement_payables` |
| `settlement_batch_id` + `city_code` | FK → `settlement_batches` |
| `worker_id` | 自 statement 快照 |
| `decision` | CHECK IN (`approved`, `rejected`) |
| `review_note` | VARCHAR(512) NULL |
| `reviewed_at` / `reviewed_by` | 审计字段 |
| `created_at` / `updated_at` | 时间戳 |

**无** paid / payout / withdraw / provider / channel / account / payment_instruction 字段。

### 3.3 Types / Validators / Outbox

- `WorkerReceivableStatementReviewDecision`: `approved` | `rejected`
- `WorkerReceivableStatementReview` / `WorkerReceivableStatementReviewedEventPayload`
- `reviewWorkerReceivableStatementRequestSchema` / response schemas
- Outbox event: `worker.receivable.statement.reviewed`

### 3.4 Service / Repository

| 文件 | 职责 |
|------|------|
| `workerReceivableStatementReviewRepository.ts` | statement FOR UPDATE、review CRUD |
| `workerReceivableStatementReviewService.ts` | `reviewWorkerReceivableStatementOnce`、`getWorkerReceivableStatementReview` |

**语义：**

- created statement only；queue=queued；payable=payable；batch=confirmed
- review-once 幂等：同 decision → `idempotent=true`；不同 decision → 409
- reviewed_at / reviewed_by / decision / review_note 不被重复覆盖
- 每 statement 一条 review；每 review 一条 outbox

### 3.5 API（internal / admin / operator）

| Method | Path |
|--------|------|
| POST | `/api/internal/settlement/worker-statements/:statementId/review-once` |
| GET | `/api/internal/settlement/worker-statements/:statementId/review` |

跨城 404；响应不含 payout/paid/provider/withdraw/payment instruction 字段。

### 3.6 Tests

| 类型 | 文件 |
|------|------|
| Unit | `tests/unit/workerReceivableStatementReviewService.test.ts` |
| Integration | `workerReceivableStatementReview.test.ts`、`workerReceivableStatementReviewIdempotency.test.ts` |
| Contract | `workerReceivableStatementReview.contract.test.ts` |
| Security | `workerReceivableStatementReviewGates.test.ts` |

### 3.7 Phase 8G 守门脚本（8 个）

- `check-worker-receivable-statement-review-created-only.ps1`
- `check-worker-receivable-statement-review-city-scoped.ps1`
- `check-worker-receivable-statement-review-outbox-idempotent.ps1`
- `check-worker-receivable-statement-review-no-ledger-entries.ps1`
- `check-worker-receivable-statement-review-no-upstream-mutation.ps1`
- `check-worker-receivable-statement-review-no-payout-paid.ps1`
- `check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`
- `check-worker-receivable-statement-review-no-refund-aftersale-reversal.ps1`

`scripts/preflight-architecture.ps1` 已纳入 Phase 8G 文件与 gate 集合。

---

## 4. 本阶段施工清单

### 4.1 改动目录

- `db/migrations/`、`db/schema/settlement.sql`
- `packages/types/`、`packages/validators/`
- `backend/src/settlement/`（review service/repo、routes、state machine、ids）
- `scripts/`（8 gate + preflight）
- `tests/unit/`、`tests/integration/`、`tests/contract/`、`tests/security/`
- `docs/CURRENT_STATE.md`、`docs/reports/PHASE8G_*.md`

### 4.2 未改动（禁止范围）

- `apps/customer`、`apps/worker`、`apps/admin`（无 UI 改动）
- `backend/src/payment/`、`backend/src/providers/`（无 provider 实现）
- 无 payout / payment_instruction 表或 API
- 无 ledger_entries 写入
- 未修改 8F statement 表 CHECK 或 status 语义

---

## 5. 本阶段验证结果

| 项 | 结果 |
|----|------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | **206 files / 406 passed / 1 todo** |
| preflight | Phase 0–8G passed |
| Phase 8B–8G gates | all PASS |
| Docker MySQL | healthy (`xlb-mysql-local`) |
| Docker Redis | healthy (`xlb-redis-local`) |
| migrate-local | APPLY `018_worker_receivable_statement_review` |
| seed-local | passed |

### 5.1 Live API 验证（integration + DB）

| 步骤 | 结果 |
|------|------|
| prepare-once | processed=1 |
| confirm | status=confirmed |
| mark-payable | status=payable |
| enqueue | status=queued |
| generate statements | status=created |
| review approved 首次 | idempotent=false |
| review approved 第二次 | idempotent=true，review 字段不覆盖 |
| review different decision | 409 conflict |
| worker_receivable_statement_reviews | 每 statement 一条 |
| worker.receivable.statement.reviewed outbox | 每 review 一条 |
| worker_receivable_statements.status | 仍 `created` |
| settlement_payable_queue.status | 仍 `queued` |
| settlement_payables.status | 仍 `payable` |
| settlement_batches.status | 仍 `confirmed` |
| 跨城 review / GET | 404 |
| 金额快照 | 89.00 / 8.90 / 80.10 不变 |

---

## 6. 本阶段边界结论

- **无** payout / settlement paid / mock payout / payout table / payout API
- **无** provider / payment channel / payment instruction
- **无** refund / aftersale / reversal / 微信·支付宝分账 / 提现
- **无** UI 改动
- **未**新增或修改 `ledger_entries`
- **未**修改 order / payment / fulfillment / ledger_accruals
- **未**修改 `worker_receivable_statements.status`
- **未**修改 queue / payable / batch status

---

## 7. 本阶段结论

| 项 | 值 |
|----|-----|
| Phase 8G 主体是否完成 | **是** |
| 是否已 Lock | **Lock 进行中**（本节以下为 Lock 复验） |
| 是否已 merge main | **否**（Lock 前） |
| 是否已打 tag | **否**（Lock 前） |
| 是否可进入下一步 Lock | **是** — 正在执行 Phase 8G-Lock |
| Phase 8H 是否未启动 | **是** |

---

## 8. Phase 8G-Lock 复验（2026-07-04，Lock 前）

### 8.1 基线

| 项 | 值 |
|----|-----|
| 分支 | `phase8g-worker-receivable-statement-review-foundation` |
| Phase 8G 主体 commit | `2b34a38` |
| 基线 main | `214da7c` |
| Phase 8F tag | `xlb-phase8f-worker-receivable-statement` → `214da7c` |
| Phase 8E tag | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |

### 8.2 工程验证

| Check | Result |
|-------|--------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | **206 files / 406 passed / 1 todo** |
| preflight | passed (Phase 0–8G) |

### 8.3 守门脚本

| Phase | Result |
|-------|--------|
| Phase 8B (6) | 6/6 passed |
| Phase 8C (8) | 8/8 passed |
| Phase 8D (8) | 8/8 passed |
| Phase 8E (8) | 8/8 passed |
| Phase 8F (8) | 8/8 passed |
| Phase 8G (8) | 8/8 passed |

### 8.4 基础设施

| Check | Result |
|-------|--------|
| Docker MySQL | healthy (`xlb-mysql-local`) |
| Docker Redis | healthy (`xlb-redis-local`) |
| migrate-local | passed (018 applied) |
| seed-local | passed |

### 8.5 Live API 复验（Lock run）

| Step | ID / result |
|------|-------------|
| prepare-once | processed=1 |
| confirm | status=confirmed |
| mark-payable | status=payable |
| enqueue | status=queued |
| generate statements | status=created |
| review approved 1st | idempotent=false |
| review approved 2nd | idempotent=true; reviewedAt / reviewedBy / reviewNote 不变 |
| review different decision | HTTP 409 |
| Statement (sample) | `wrs_mr5tgoxd_3a407662` |
| worker.receivable.statement.reviewed | 每 review 一条 outbox |
| worker_receivable_statements.status | 仍 `created` |
| queue / payable / batch | queued / payable / confirmed |
| Amount snapshot | 89.00 / 8.90 / 80.10 |
| Cross-city review / GET | HTTP 404 |
| ledger_entries | 不变（integration 断言通过） |

### 8.6 越界检查

无 payout / paid / payment instruction / provider / withdraw / refund / aftersale / reversal / UI / ledger 写入 / 上游 mutation / statement·queue·payable·batch status 变更。

**Phase 8G Lock 准备完成 — 待 merge main。Phase 8H 未启动。**

---

## 9. Phase 8G Post-Lock（2026-07-04，main）

### 9.1 Git

| 项 | 值 |
|----|-----|
| main merge commit | `dbe3824253035b9bca2b77a69dfa92d9ae6b1d33` |
| Phase 8G body commit | `2b34a38` |
| docs finalize commit | `2ff8a4d` |
| Tag | `xlb-phase8g-worker-receivable-statement-review` → post-lock main HEAD |
| Phase 8F tag | retained @ `214da7c` |
| Phase 8E tag | retained @ `9a0e7ae` |

### 9.2 Post-lock 复验（main）

| Check | Result |
|-------|--------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | 206 files / 406 passed / 1 todo |
| preflight | passed (Phase 0–8G) |
| Phase 8B–8G gates | 6/6 + 8/8 + 8/8 + 8/8 + 8/8 + 8/8 passed |
| Docker MySQL / Redis | healthy |
| migrate-local / seed-local | passed |

### 9.3 Post-lock Live API

| Step | ID / result |
|------|-------------|
| Full chain | accrual → prepare → confirm → mark-payable → enqueue → generate → review |
| review approved 1st / 2nd | idempotent=false / idempotent=true |
| review conflict | HTTP 409 |
| Cross-city | HTTP 404 |
| queue / payable / batch / statement | queued / payable / confirmed / created |
| Amounts | 89.00 / 8.90 / 80.10 |

### 9.4 最终结论

**Phase 8G Worker Receivable Statement Review Foundation 已 Lock 并成为稳定商用主线。Phase 8H 未启动。**

**声明：** Statement review 是**对账单审核/治理层**，不是付款、不是打款、不是 paid settlement、不是 payout、不是提现、不是分账、不是支付平台、不是 payment instruction。

