# XLB 工程治理权威索引

> 生效日期：2026-07-14（Asia/Shanghai）
> 授权：Human Owner 已授权将治理宪法植入项目执行系统并纳入正式版本控制。
> 执行系统状态：`BOOTSTRAP / NOT_ENABLED`

## 1. 权威层级

1. [`01_PROJECT_CONSTITUTION_DRAFT.md`](./01_PROJECT_CONSTITUTION_DRAFT.md) 是项目工程施工的最高治理宪法；其中已确认的 Human 决策、权限边界、数据治理、前后端边界和 Quality Gates 对所有 Agent 生效。
2. [`04_ADR_DECISION_ENGINE_DESIGN.md`](./04_ADR_DECISION_ENGINE_DESIGN.md) 是变更分级、权限和证据判定规则。
3. [`06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md`](./06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md) 是 Release Train、Work Unit、Lease、Migration Reservation、Integration Queue 与 Lock closure 的执行规则。
4. [`execution/`](./execution/) 是上述规则的 canonical 执行台账；台账只能表达已获得的权限，不能创造权限。
5. `02`、`03`、`05` 是事实调查与差距分析记录；其历史快照不得覆盖 Git、`docs/CURRENT_STATE.md`、phase registry 或已更新的规范性决定。

若治理规范与当前事实源冲突，Agent 必须停止受影响写入、记录冲突并交由 Human Owner 裁决。治理文件不得改写既有 Git/tag/Lock 历史。

## 2. 当前执行状态

- P-01～P-18 的治理决定已获准植入人工可审计执行系统，但“获准植入”不等于“执行系统已经启用”。
- 初始状态固定为 `BOOTSTRAP / NOT_ENABLED`。只有治理候选 commit 已形成、独立只读审计通过且 Human Owner 明确确认启用后，状态才可转换为 `ENABLED`。
- 在 `ENABLED` 前，不得创建或使用受管业务施工 worktree，不得把任何 Work Unit 判断为 `WORK_UNIT_PARALLEL_ELIGIBLE`，不得执行 Integration Queue item。
- `G:\xlb100` 是唯一 canonical control/integration/main/Lock root。
- 受管施工池固定为 `G:\xlb100-worktrees\<train-id>\<work-unit-id>`。
- 未登记 worktree、共享数据库并发写、越 lease、无 reservation 的 migration、章程外动作一律 fail closed。
- Phase 30/31 首个业务 Release Train 仍是 `DRAFT / WAITING_HUMAN_APPROVAL`；当前文件不授权其业务施工。
- 三个 `VALIDATION_ONLY` Work Unit 是 BOOTSTRAP 配置记录；只有在验证动作另有有效授权且执行系统满足相应前置条件时，才可用于证明工棚环境隔离。它们不允许 runtime、migration、Phase、main、tag、Lock、push、Provider 或 production 写入。
- P-17 保持有效：先使用人工、可审计的 Integration Queue；是否修改 CI/Gates 必须另行裁决。

## 3. Human 与 Agent 权限

- 唯一 Human Owner 承担 Human、Architecture、Financial、Security Review 与 Lock Authority，不设代理或多人会签。
- L0 由 Agent 自决；L1 可直接执行并在完成报告中告知；L2 必须事先获得 Human 明确批准；L3 必须事先批准且验证阶段附完整测试与两级审计证据；L4 必须取得 Human 显式书面“同意执行”或“同意上线”。
- Train Charter 只覆盖其明确列出的 local construction scope，不包含 main merge、Lock、push/deploy、production、Provider、replay、backfill 或 purge。
- Audit Agent 只读；Audit PASS 是证据，不是执行、merge 或 Lock 权限。

## 4. 执行入口

所有 Release Train/Work Unit 操作必须先阅读 [`execution/README.md`](./execution/README.md)，并以以下台账为唯一执行记录：

- [`execution/train-registry.json`](./execution/train-registry.json)
- [`execution/integration-queue.json`](./execution/integration-queue.json)
- [`execution/leases.json`](./execution/leases.json)
- [`execution/migration-reservations.json`](./execution/migration-reservations.json)
- [`execution/work-units/`](./execution/work-units/)

`docs/governance/phase-registry.json` 与 `governance/execution/train-registry.json` 相互独立：前者只记录 Phase/Lock 事实，后者只记录 Train/Work Unit 施工状态。任何 package、queue 或 train 状态都不得冒充或自动更新 Phase `LOCKED`。
