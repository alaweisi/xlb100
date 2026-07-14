# AGENTS.md — 喜乐帮 / XLB

> **所有 AI Agent（Cursor / Codex / Claude Code 等）进入本项目必须先阅读本文件。**

> **最高工程治理依据：** `governance/01_PROJECT_CONSTITUTION_DRAFT.md` 是本项目正式工程施工宪法；`governance/04_ADR_DECISION_ENGINE_DESIGN.md` 与 `governance/06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md` 是其强制执行模型。任何 Agent、Skill、脚本、Train Charter 或 Phase Prompt 与宪法冲突时必须 fail closed，并提交 Human Owner 裁决。

## 项目概述

**喜乐帮 / XLB** 是一个从 0 开始的三端 App Monorepo：

- **apps/customer** — C 端：用户下单服务入口
- **apps/worker** — W 端：师傅接单履约入口
- **apps/admin** — A 端：运营审核管理入口
- **backend** — 后端 API 服务
- **packages/** — 共享类型、校验、配置、API Client、UI、模块加载器
- **db/** — 数据库 schema、migrations、seed
- **infra/** — Nginx、Docker、MySQL、Redis、OSS
- **deploy/** — 部署脚本与 compose
- **tests/** — 单元、集成、契约、E2E、安全测试
- **docs/** — 架构、契约、模块文档

**包名前缀：** `@xlb/*`  
**禁止：** `@sdj99`、`sdj99` 作为新项目命名（旧项目已废弃）

## Canonical Root 与受管 Worktree Pool

- **唯一 canonical control / integration / main / Lock 根目录：** `G:\xlb100`
- **唯一获批的并行施工工棚池：** `G:\xlb100-worktrees\<train-id>\<work-unit-id>`
- 受管 worktree 必须连接 `G:\xlb100` 的同一 Git common directory，并与已登记的 Train Charter、Work Unit Manifest、branch、base commit、lease、migration reservation 和隔离环境完全一致
- 未登记目录、自由创建的第二仓库、共享 branch、共享数据库并发写一律禁止；历史目录 `G:\xlb100-p0-architecture-foundation` 不自动纳入受管池，也不构成授权先例
- 迁移前旧盘仓库地址已废弃，禁止后续 Agent、脚本或施工命令引用或切换到旧仓库
- control、integration、main、Lock、治理台账与串行队列命令必须在 `G:\xlb100` 执行；获批 Work Unit 的施工/局部验证命令只能在其 Manifest 指定的受管 worktree 执行

## Phase 事实与基础禁区

- 当前 Phase、tag、branch、Lock 的唯一事实源是 `docs/CURRENT_STATE.md`；本节保留的是 Phase 0 建基规则，不代表当前仍处于 Phase 0
- 未获得当前 Phase/Train 明确授权时，禁止写任何真实业务逻辑
- 未经对应 Phase 与 Authority 明确批准，禁止新增或扩大登录、JWT、city_code 路由、ScopedExecutor、订单、支付、派单、账本、资质、退款和真实 Provider
- 禁止：迁移或复制旧 SDJ99 半成品代码
- 禁止：新建未批准的一级目录
- 禁止：把 `@xlb/types` 复制到三端 `apps/*` 内部
- 三端未来必须通过 `@xlb/api-client` 访问后端

## 工程目录规则

1. 不得绕过 `packages/types` 和 `packages/validators` 定义契约
2. 业务模块必须进入 `backend/src/` 对应目录，不得旁路
3. 后续 Phase 必须先走 **RequestContext → CityCode → Contract → Guard**
4. CI 守门脚本失败 = 不得合并

## 多工程队并行施工硬规则

1. Human Owner 是唯一 Human / Architecture / Financial / Security / Lock Authority；Agent 不得代替 Human 批准 L2–L4、main merge、Lock、push、production 或 Provider activation
2. 每个 Release Train 必须先有 Human 明确批准的 Train Charter；批准只覆盖章程内 local construction，不自动授权 main、Lock、push、deploy 或 production
3. 每个 WRITE Work Unit 必须绑定唯一 owner、branch、managed worktree、immutable base、allowed/forbidden paths、semantic ownership、contract revision、migration reservation、隔离环境和 evidence plan
4. 同一 Train 最多三个并行 WRITE Work Unit；shared contract finalization、canonical writer、migration ledger、integration queue、shared full replay、global gates、main、治理状态与 Lock 必须串行
5. 实际 diff 必须是 path lease 子集；文件不同但改变同一金额、状态机、事件版本、数据库表或 canonical workflow 仍视为 semantic lease 冲突
6. migration 必须先在 `governance/execution/migration-reservations.json` 预约；编号全局唯一，`ABANDONED` 永久留空，不得复用；已 Lock migration 永不修改
7. 每个 WRITE 工棚必须使用独立 Compose project、MySQL database/volume/port 与独立 Redis instance/volume/port；禁止共享 local DB/Redis 并发写
8. Work Unit candidate 只进入串行 Integration Queue；不得从 Work Unit branch 直接进入 main。base/contract/candidate 变化时旧 evidence 自动 `STALE`
9. Package Audit 与 Integration/Phase Audit 都是独立只读审查；P0/P1/P2 必须修复并复审，Audit PASS 不产生 Human/merge/Lock authority
10. 任何字段缺失、影响未知、lease/reservation 冲突、越 scope、环境不隔离或 evidence 过期，都必须 fail closed

## Human Owner 交互式裁决

- 需要 Human 裁决时，Agent 必须先提供通俗、互斥、可比较的选择题，推荐项排第一并说明影响；不得只抛出专业术语要求 Human 猜测
- L0 可由 Agent 自决；L1 可先执行后报告；L2 必须事先获得 Human 明确批准；L3 必须事先批准并附完整测试/审计 evidence；L4 必须取得“同意执行”或“同意上线”等显式书面确认
- 沉默、默认、历史批准和推断同意均不构成新的授权

## Phase 3A 约束（正式类目导入协议）

- **禁止 Cursor 凭空生成正式 16 大类**
- 正式类目必须用户在 `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md` 确认后导入
- Phase 4 开工前必须运行 `scripts/check-official-catalog-ready.ps1` 并通过
- `demo_cleaning_*` 仅用于 Phase 3 验证，不得作为订单 SKU 基础

## 后续 Phase 预告

- **Phase 3A-1：** 用户确认后导入正式 catalog / pricing seed
- **Phase 4+：** Order、Payment、Dispatch、Ledger 等业务模块（须先完成正式 SKU 导入）

## 必读文档

- `docs/CURRENT_STATE.md` — **当前 Phase / tag / 分支唯一事实源（每次 Lock 更新）**
- `docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md`
- `docs/architecture/02_XLB_ENGINEERING_FOUNDATION.md`
- `.cursor/rules/xlb-architecture-mandatory.mdc`
- `governance/01_PROJECT_CONSTITUTION_DRAFT.md` — **正式工程施工宪法**
- `governance/04_ADR_DECISION_ENGINE_DESIGN.md` — ADR Level、Authority、Evidence 与 Permission Engine
- `governance/06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md` — Release Train、Work Unit、Lease、Queue 与 Lock closure
- `governance/execution/README.md` — canonical 执行台账、状态和人工队列入口

## Agent Skills（`.cursor/skills/`）

**开工顺序（必须）：**

1. `xlb-session-sync` — git 状态 + `docs/CURRENT_STATE.md`，禁止依赖旧记忆
2. `xlb-managed-worktree` — 核对 Charter、Manifest、Lease、base、reservation、隔离环境与 evidence freshness
3. `xlb-context-map` — 按领域读 3–5 个文件（含 `reference.md` 模块树）
4. `xlb-current-vs-target` — 蓝图 vs 当前实现 vs 差距 vs 禁止项
5. `xlb-phase-boundary` — 当前 Phase 允许/禁止 + gate 索引

**Lock 任务额外执行：** `xlb-phase-lock`

**事实优先级：** git + `CURRENT_STATE` + `reference.md` + 实际代码 > 会话记忆 > 外部 prompt。若 prompt 与上述文件冲突，**停止并汇报**，不得擅自施工。

| Skill | 用途 |
|-------|------|
| `xlb-session-sync` | git + CURRENT_STATE 同步，禁止依赖旧会话记忆 |
| `xlb-managed-worktree` | 受管 Worktree / Work Unit 边界核验；缺失或冲突时 fail closed |
| `xlb-context-map` | 按领域导航该读哪些文件，避免全库搜索 |
| `xlb-current-vs-target` | SDJ99 蓝图 ≠ 当前实现 |
| `xlb-phase-boundary` | 当前 Phase 允许 / 禁止做什么 |
| `xlb-phase-lock` | Phase Lock 复验、合并 main、打 tag |

快捷脚本：`powershell -File scripts/agent-context-snapshot.ps1`
