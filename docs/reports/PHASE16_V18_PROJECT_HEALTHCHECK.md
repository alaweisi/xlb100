# PHASE16 v1.8 项目体检报告

- 生成时间：2026-07-08
- 任务分支：`main`
- 报告范围：`apps/customer`, `apps/worker`, `apps/admin`, `packages/types`, `packages/api-client`, `packages/validators`, `backend/src`, `db/migrations`, `tests`, `scripts`
- 操作前状态：已执行 `git status --short` / `git diff --stat`，工作区为空
- 清理动作：执行 `git stash push -u -m "phase16-pre-healthcheck-dirty-worktree-order-traceability-worker-api"`
- 结果：`No local changes to save`（未产生实际 stash 条目）

## 1) 总体结论
**PARTIAL**

- Customer 前端链路与部分核心后端能力已可支撑，但 Worker 与 Admin 的关键链路仍为“页面存在/接口不齐/服务串联不完整”。
- 关键高风险链路（支付→账本、退款→对账/回退）没有形成“生产级闭环”。
- 三端 UI 可继续做“界面与体验层实现”，但 Worker 的履约动作与 Admin 的资质/售后/账本审核链路仍需依赖后端补齐。

## 2) 三端页面可施工清单

### Customer（可真实施工）
1. `home`：服务入口与目录列表
2. `services`：服务详情/类目筛选（依赖 catalog/pricing API）
3. `order/create`：下单页（下单请求、价格回显）
4. `orders`：订单列表与订单详情
5. `profile`：用户信息页

### Worker（仅 mock / UAT）
1. `hall`：任务池列表 UI（可展示）
2. `tasks`：任务流转页（当前动作未完全接后端）
3. `wallet`：展示页（不涉及关键核心交易闭环）
4. `certification`：展示/提交流程页面（部分可提交后端，但后续审核路径前端可视化未成套）

### Worker（必须等后端补齐后再真实施工）
1. `accept` 动作链（后端路由有接口，但前端适配层 `workflowBindings` 标注 disabled/not-wired）
2. `fulfillment.start/complete`（同上）
3. `dispatch 实时分配`（依赖 dispatch stream 消费与任务分配 workerId）

### Admin（当前只能做部分 Mock/UAT）
1. `settlement/*`：页面展示链可继续
2. `city / scope / worker certification review / aftersale review`：缺少完整前端页面映射或 API 组合层，建议先补齐 API 与页面路由
3. `ledger readonly`：后端 ledger 视图/查询能力存在，但与支付/履约/退款事件联动不完整，当前不宜上生产流程

### 三端建议施工状态汇总
- **Customer**：**可以真实施工**（含下单链路前端）
- **Worker**：**只做 mock/UAT**（关键动作必须后台补齐）
- **Admin**：**部分 mock/UAT**（settlement 可继续，运营审核链路不完整）

## 3) 后端接口缺口清单

### 已有但前端链路不易驱动
1. `POST /api/worker/tasks/:id/accept`、`POST /api/worker/fulfillments/:id/start`、`POST /api/worker/fulfillments/:id/complete` 存在，但 Worker 适配未打通
2. `POST /api/internal/dispatch/run-once` 仅供内部触发，不等于自动后台 dispatch worker 调度器
3. `POST /api/admin/certifications/{id}/approve`（审核）存在，但 Admin 客户端未统一封装相关入口；`api-client` 页面映射缺口导致前端开发阻塞
4. `refund.approve` / aftersale 审批有后端基础路径，但 Admin 前端与 API Client 覆盖不足

### 明显缺口
1. Worker 侧缺少“可订阅任务更新/领取成功实时订阅接口（或流消费回传）”的前端友好 API 层
2. Admin 缺少 `city scope`/`worker certification review`/`aftersale review` 完整接口契约的统一入口层（尤其 packages/api-client 与 apps/admin）
3. Provider 侧退款发起/回执接口未在当前链路见到（仅 event/ledger reversal 阶段）
4. 账本/settlement 与支付订单的事件桥接接口未形成标准外部消费闭环（更多是手工 run-once）

## 4) 状态机缺口清单

### Customer 链路
- `catalog -> pricing -> order -> payment -> order detail` 中主路径状态可见，但订单支付后的后续事件驱动状态切换依赖 webhook/outbox 与多步消费器，未形成统一可观测状态视图
- 支付侧状态与订单状态同步仍偏事件化，缺少“状态幂等对账视图”的稳定边界

### Worker 链路
- `certification`：认证提交后审核状态可更新，但 worker 侧页面缺少状态联动与历史追踪统一展示
- `dispatch eligibility`：dispatch 资格检查逻辑存在，但端到端从“队列 -> 可接单 -> 接单成功 -> 履约开始 -> 完成”未在 UI/consumer 完整映射
- `accept/fulfillment`：后端有命令式接口；前端绑定标注为 disabled/not-wired；流式分配状态机缺口大

### Admin 链路
- `worker certification review`：状态变更存在，但缺少城市/审核域视图的统一状态机落地页
- `aftersale review`：审批流存在但 UI 与管理员页面动作不成套
- `ledger readonly`：只读账本视图可做，但“交易导致账本变化的状态来源”不可追踪到统一状态机

### 支付与退款链路
- `payment order -> webhook -> OrderPaidEvent -> ledger`：`OrderPaidEvent` 有链路发起与消费动作，但 ledger 侧监听未覆盖完整订单支付闭环，存在状态断点
- `RefundApprovedEvent -> ledger reversal -> provider refund`：事件与 reversal 在框架上存在，但 provider refund 发起链路缺口，未见生产级完成态回写

## 5) 事件流缺口清单

### 关键缺口
1. `dispatch`：存在 `order.paid` -> `dispatch_tasks` 写入 outbox -> city stream；但 `dispatchStreamConsumer` 为骨架（未见消费/分派/ack 完整逻辑）
2. `OrderPaidEvent`：事件触发点有，但 ledger 监听链路与后续财务记账未形成持续消费路径
3. `dispatch:stream:{city_code}`：城市分片命名实现存在且无全国统一队列；全国单队列风险已通过 schema 和 scripts 有约束；但消费者实现不完整
4. `RefundApprovedEvent`：事件链路存在，但 provider refund 回执事件未闭环
5. `aftersale`：审批事件到 ledger reversal 有通道，但后续外部退款回告链路缺少完结事件

## 6) 数据库/迁移缺口清单

### 已有（可复用）
- 市域与 RLS：`cities`、`admin_city_scopes`、city scope marker/约束
- Dispatch：`dispatch_tasks`、`stream_name`、事件 outbox 基础
- 订单/支付：`orders`、`payment_orders`、`event_outbox`
- 认证/履约：证书、accept/fulfillment 等实体与审计表
- 账本：`ledger_accounts`、`ledger_entries`、`accruals`
- 退款：aftersale/refund 相关基础表

### 缺口项
1. `dispatch` 缺少消费者进度/分配结果的可追溯持久化字段（例如 worker 领取快照、分配幂等 key）
2. `ledger` 缺少支付渠道/交易明细对账索引用于 payment->ledger 追踪（当前以事件驱动为主，缺少生产级审计聚合）
3. `provider refund` 持久化链路的明细表/状态表未形成（目前偏事件与反记账）
4. Refund / aftersale 与运营审核的查询索引覆盖不足（高并发下审计查询可能退化）

## 7) 测试缺口清单

### 已有基础覆盖
- 国家级无全国队列约束、city stream 命名
- dispatch task / worker accept / fulfillment lifecycle / order payment outbox 等测试文件存在
- ledger run-once、fulfillment 完成入账、refund 反向入账有集成用例

### 测试缺口
1. Worker 前端 `workflowBindings` 与真实接口联调 E2E 缺失（mock/UAT 与生产行为未对齐）
2. Admin city scope + certification/aftersale 页面链路缺少端到端测试覆盖
3. 支付 webhook 到 ledger 追踪的端到端契约缺失（仅存在局部单元/集成）
4. dispatch stream consumer 的并发、幂等、回退行为未有消费端 E2E 验证
5. provider refund 外部回执链路缺少故障注入和超时重试验证

## 8) 风险分级（P0/P1/P2）

### P0（上线阻断）
1. OrderPaidEvent 与 ledger 的生产级闭环不完整（支付后财务一致性风险）
2. refund.approved 到 provider refund 断链（退款可撤销风险）

### P1（高风险）
1. dispatch stream consumer 未完整消费分配，导致 worker 无法持续拿单
2. Worker 核心动作虽有接口但前端绑定 disabled，真实施工作风险高
3. Admin 审核链路（worker certification/aftersale）前端缺失导致运营闭环失效

### P2（中风险）
1. 状态机可观测性不足，难以统一观测订单/履约/账本状态来源
2. 事件重放与补偿机制缺口，出现脏数据时恢复慢
3. API Client 与 UI 页面分层不一致导致开发成本上升

## 9) 下一阶段建议施工顺序
1. 先补齐 Worker 生产链：dispatch consumer -> worker 领取 -> 履约 start/complete 的完整事件与幂等能力
2. 打通 Admin 运营链路：city scope 下 worker certification / aftersale review / ledger readonly 的前后端契约落地
3. 完整支付闭环：支付 webhook -> OrderPaidEvent -> ledger 入账自动消费与审计日志统一
4. 完成退款闭环：RefundApprovedEvent -> ledger reversal -> provider refund 接口与回执回写
5. 对照修正状态机与页面绑定：补齐 `api-client` 与三端页面适配，推进前端从 mock 到真实动作
6. 收口后补充 E2E：重点覆盖 dispatch 领取、履约、支付+账本、退款+回退


## 附录：验证命令执行结果

- `pnpm test`：**失败**，共 28 个测试文件失败（33 个用例失败）。
  - 主要模式：大量 settlement/integration 用例报错 `Could not acquire Phase 8B integration-test lock`，属于测试锁竞争导致的不可重入失败；少量用例同时出现业务断言失败提示（与锁竞争导致后续链路未按预期返回）。
  - 示例失败：`tests/integration/workerReceivableStatementAudit.test.ts` 的部分用例、`tests/integration/workerReceivableStatement.test.ts`、`tests/integration/reconciliationGapScan*.test.ts` 等。
- `pnpm --filter @xlb/customer typecheck`：通过。
- `pnpm --filter @xlb/worker typecheck`：通过。
- `pnpm --filter @xlb/admin typecheck`：通过。
- `git diff --check`：无异常。
- 最终 `git status --short`：仅 `?? docs/reports/PHASE16_V18_PROJECT_HEALTHCHECK.md`。
