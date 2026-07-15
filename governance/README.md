# XLB 工程治理权威索引

> 生效日期：2026-07-15（Asia/Shanghai）
> 授权：Human Owner 已要求降低治理负担，普通开发改为直接执行。
> 现行政策：`LEAN_EXECUTION`

## 1. 权威层级

1. [`00_LEAN_EXECUTION_POLICY.md`](./00_LEAN_EXECUTION_POLICY.md) 与根目录 `AGENTS.md` 是当前最高执行规则。
2. `01`、`04`、`06` 是历史设计；旧执行系统已经归档到 [`archive/`](./archive/)，不再生效或被调用。
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

普通开发直接从相关源文件和测试开始。高风险改动由 `scripts/check-lean-risk.ps1` 展示摘要并记录一次 Human 自然语言批准；migration 额外运行 `scripts/check-migration-integrity.ps1`。不再使用治理台账、Queue 或状态机。

旧 registry、Queue、Lease、Transition、Work Unit、managed-worktree Gate 与相关 Agent Skills 统一保存在 [`archive/execution-system/`](./archive/execution-system/)；归档内容不产生权限、不参与 hook/CI，也不作为当前施工入口。
