# AGENTS.md — 喜乐帮 / XLB

> **所有 AI Agent（Cursor / Codex / Claude Code 等）进入本项目必须先阅读本文件。**

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

## 本地仓库路径

- **唯一有效本地仓库根目录：** `G:\xlb100`
- 迁移前旧盘仓库地址已废弃，禁止后续 Agent、脚本或施工命令引用或切换到旧仓库
- 所有项目命令必须以 `G:\xlb100` 为工作目录执行

## Phase 0 约束（当前阶段）

- **禁止写任何真实业务逻辑**
- 禁止：登录、JWT、city_code 路由、ScopedExecutor、订单、支付、派单、账本、资质、退款、真实 Provider
- 禁止：迁移或复制旧 SDJ99 半成品代码
- 禁止：新建未批准的一级目录
- 禁止：把 `@xlb/types` 复制到三端 `apps/*` 内部
- 三端未来必须通过 `@xlb/api-client` 访问后端

## 工程目录规则

1. 不得绕过 `packages/types` 和 `packages/validators` 定义契约
2. 业务模块必须进入 `backend/src/` 对应目录，不得旁路
3. 后续 Phase 必须先走 **RequestContext → CityCode → Contract → Guard**
4. CI 守门脚本失败 = 不得合并

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

## Agent Skills（`.cursor/skills/`）

**开工顺序（必须）：**

1. `xlb-session-sync` — git 状态 + `docs/CURRENT_STATE.md`，禁止依赖旧记忆
2. `xlb-context-map` — 按领域读 3–5 个文件（含 `reference.md` 模块树）
3. `xlb-current-vs-target` — 蓝图 vs 当前实现 vs 差距 vs 禁止项
4. `xlb-phase-boundary` — 当前 Phase 允许/禁止 + gate 索引

**Lock 任务额外执行：** `xlb-phase-lock`

**事实优先级：** git + `CURRENT_STATE` + `reference.md` + 实际代码 > 会话记忆 > 外部 prompt。若 prompt 与上述文件冲突，**停止并汇报**，不得擅自施工。

| Skill | 用途 |
|-------|------|
| `xlb-session-sync` | git + CURRENT_STATE 同步，禁止依赖旧会话记忆 |
| `xlb-context-map` | 按领域导航该读哪些文件，避免全库搜索 |
| `xlb-current-vs-target` | SDJ99 蓝图 ≠ 当前实现 |
| `xlb-phase-boundary` | 当前 Phase 允许 / 禁止做什么 |
| `xlb-phase-lock` | Phase Lock 复验、合并 main、打 tag |

快捷脚本：`powershell -File scripts/agent-context-snapshot.ps1`
