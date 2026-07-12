# Phase 24A — 客服系统探测与设计报告

## 状态

- Branch: `codex/phase24-support-system-design`
- Base: `main` at `04f1c43`
- Status: **DESIGN COMPLETE — AWAITING HUMAN APPROVAL**
- Runtime change: none
- Migration: none

## 本阶段完成

1. 核对 Fastify、MySQL/mysql2、Redis、Transactional Outbox、JWT/RequestContext、Turborepo 和三端 React/Vite 事实。
2. 核对三端当前 `app/pages/features/adapters/routes` 组织，并确定采用渐进式 feature 拆分。
3. 深入核对 Phase 17 Aftersale，识别“通用工单不可复制投诉 Case”的核心边界。
4. 设计 conversation/ticket/routing/bot/knowledgeBase/quality/agentWorkbench 子模块。
5. 产出分层架构、领域调用和实时消息三张 Mermaid 图。
6. 产出字段级数据模型、索引、复合城市外键、幂等与并发策略草案。
7. 将附件 Phase 0–5 映射为 XLB Phase 24A–24F，并定义每阶段 Gate 和人工确认点。

## 设计调整

原始需求假设工单可覆盖订单纠纷和服务投诉，但仓库已有完整 `aftersale_complaints` 业务 Case。Phase 24 采用：

- Support Ticket：渠道、路由、SLA、坐席和跨域编排；
- Aftersale Complaint：投诉、维修、责任、赔偿和售后业务结果；
- 两者通过同城复合关联和应用服务/事件协作；
- Support 禁止直接更新 Aftersale、Order、Payment、Dispatch、Worker、Ledger、Settlement 表。

审查同时确认 Phase 17 不是独立完整客服系统，不能承载实时会话、坐席路由/SLA、知识库、Bot、质检和 CSAT。Phase 17 已锁定，Phase 24 不修改其历史迁移或 Tag。

针对“是否把 Phase 17 客服工程全部转入 Phase 24”的评审，设计采用增量纳管：客服入口、通用工单、坐席分配、队列/SLA、工作台与统一时间线视图进入 Phase 24；投诉、维修、责任、赔偿、退款和逆向的业务内核继续留在原领域。24B 先双轨兼容和幂等关联，经过数据对账、权限、E2E、监控与回滚验证后再评审旧 UI 入口退役。

此外，现有 Outbox claim 是单一交付状态而非 fan-out；Phase 24 的跨域投影需要独立 receipt/inbox 去重，不能与 Dispatch/Ledger 竞争消费。Payment、Review、Compliance、Worker Finance 和 Dispatch 异常事件的客服只读/事件接口缺口已列为后续领域前置工作。

## 交付文件

- `docs/architecture/support-system-design.md`
- `docs/diagrams/support-system-architecture.md`
- `docs/modules/support/README.md`
- `docs/reports/PHASE24_SUPPORT_SYSTEM_DESIGN_REPORT.md`
- `docs/CURRENT_STATE.md`（Phase 24A 设计状态）

## 验证范围

本阶段仅包含 Markdown 设计成果，因此不运行数据库迁移或业务测试。交付前执行：

- 文档路径和引用完整性检查；
- Mermaid 代码块结构检查；
- `pnpm preflight`，确保设计文档没有破坏架构守门；
- `git diff --check`。

## 本轮验证结果

- `git diff --check`: passed。
- 四份 Phase 24A 文档存在性与关键决策 marker 检查：passed。
- Mermaid：3 个代码块，均集中在 `docs/diagrams/support-system-architecture.md`。
- Architecture preflight：Phase 0–9C 检查通过；在既有 Phase 9D 运行时读模型检查中因本机 MySQL `127.0.0.1:3306` 未启动而失败。失败请求属于既有 Dispatch/Ledger/Settlement API，本阶段没有运行时代码或数据库变更。待数据库启动后必须重新执行并通过，当前不得宣称完整 preflight 通过。

## 未实现与下一阶段依赖

以下均未实现，不能对外宣称可用：客服表、Ticket API、坐席队列、三端客服页面、WebSocket、Redis Pub/Sub/Presence、IM/NLU/电话 Provider、知识库、CSAT、质检和运营看板。

进入 Phase 24B 前必须由人工确认设计文档第 13 节的决策，尤其是工单/投诉双对象边界、坐席身份策略、API 路径和数据留存要求。
