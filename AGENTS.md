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

- `docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md`
- `docs/architecture/02_XLB_ENGINEERING_FOUNDATION.md`
- `.cursor/rules/xlb-architecture-mandatory.mdc`
