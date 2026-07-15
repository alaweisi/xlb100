# XLB 工程治理权威索引

> 生效日期：2026-07-15（Asia/Shanghai）
> 授权：Human Owner 已要求降低治理负担，普通开发改为直接执行。
> 现行政策：`LEAN_EXECUTION`

## 1. 权威层级

1. [`00_LEAN_EXECUTION_POLICY.md`](./00_LEAN_EXECUTION_POLICY.md) 与根目录 `AGENTS.md` 是当前最高执行规则。
2. `01`、`04`、`06` 和 [`execution/`](./execution/) 降级为高风险工程、生产专项与历史参考。
3. `02`、`03`、`05` 是事实调查与差距分析记录。

旧规则与精简政策冲突时，以精简政策为准；只有真实高风险、外部或生产操作才停止并请求 Human。

## 2. 当前执行状态

- 普通开发不使用 Train/WU/Lease/Queue/Transition 或固定确认句式。
- 单人任务可直接在当前分支施工；确实并行时才使用独立 branch/worktree。
- 不访问数据库或 Redis 的任务不登记运行环境。
- 默认只运行相关测试；全量回归在最终 Phase 候选或高风险跨域变更时运行一次。
- schema/migration、认证权限、支付账本、金额规则等高风险工程需要一次明确同意。
- push、deploy、生产数据和真实 Provider 仍需执行前单独同意。

## 3. Human 与 Agent 权限

- 普通开发由 Agent 直接完成，不把技术细节交给 Human 逐项选择。
- 高风险工程在开始写入前取得一次自然语言明确同意；批准覆盖说明范围内的本地施工、测试和本地集成。
- 外部和生产操作在执行前单独取得明确同意。
- 普通任务不要求审计；高风险或最终 Phase 候选最多一次独立审查。

## 4. 执行入口

普通开发直接从相关源文件和测试开始，不使用治理台账。以下入口仅供高风险专项或历史追溯：

- [`execution/train-registry.json`](./execution/train-registry.json)
- [`execution/integration-queue.json`](./execution/integration-queue.json)
- [`execution/leases.json`](./execution/leases.json)
- [`execution/migration-reservations.json`](./execution/migration-reservations.json)
- [`execution/work-units/`](./execution/work-units/)

`docs/governance/phase-registry.json` 与 `governance/execution/train-registry.json` 相互独立：前者只记录 Phase/Lock 事实，后者只记录 Train/Work Unit 施工状态。任何 package、queue 或 train 状态都不得冒充或自动更新 Phase `LOCKED`。
