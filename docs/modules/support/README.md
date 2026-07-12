# Support / 客服系统

## 当前状态

Phase 24A 设计已获人工批准；Phase 24B 工单 MVP 已完成施工、验证并 Lock，tag 为 `xlb-phase24b-support-ticket-mvp`。实时会话、路由/SLA、机器人、知识库、质检和 CSAT 仍未进入范围，不能据此声称这些能力已经上线。

设计事实源：

- `docs/architecture/support-system-design.md`
- `docs/diagrams/support-system-architecture.md`
- `docs/reports/PHASE24_SUPPORT_SYSTEM_DESIGN_REPORT.md`

## 目标子模块

| 子模块 | 责任 | 禁止事项 |
|---|---|---|
| `ticket` | 通用工单、工单事件、参与者权限、SLA 状态和领域关联 | 不实现退款、改派、维修、责任、赔偿或资金动作 |
| `routing` | 按城市、身份、问题类型、技能组、紧急度路由 | 不绕过 Admin 城市权限或直接改变业务域状态 |
| `conversation` | 会话、消息、参与者、转接、Presence、转工单 | Redis 不作为消息事实源；不公开私有媒体 URL |
| `bot` | 意图识别编排、置信度策略、敏感问题转人工 | 不把模型输出当作业务执行授权 |
| `knowledgeBase` | 城市/品类知识文章、版本、发布与检索 | 不绕过审核直接发布外部内容 |
| `quality` | CSAT、质检、SLA 与坐席指标 | 不直接写 Worker 评分表 |
| `agentWorkbench` | 坐席队列、领取、工作状态和工作台查询 | 不新建旁路身份体系；使用现有 Admin 鉴权并叠加业务档案 |

## 与 Phase 17 售后的边界

Phase 17 的 `aftersale` 已拥有投诉、维修、责任认定、赔偿意图和售后时间线。Support Ticket 是跨渠道接入、路由和 SLA 编排外壳：

- 投诉类工单通过 `linked_aftersale_complaint_id` 关联既有投诉；
- 客服域只能调用已存在的 Aftersale/Reverse/Refund 应用服务；
- 客服域不能复制售后状态机或直接更新售后表；
- Support 状态描述“客服是否受理和跟进”，Aftersale 状态描述“售后案件处理结果”；
- 工单解决前必须校验关联领域案件处于允许的终态或记录明确的非业务处理结论。

Phase 17 不是完整客服系统：它没有通用工单、SLA、坐席技能组、实时 IM、知识库、机器人、质检或 CSAT。该 Phase 及迁移 `034` 已锁定，Phase 24 不把新增客服工程回填或移植到 Phase 17。

Phase 24 会逐步**纳管** Phase 17 的客服入口、坐席工作台、通用分配/留言和统一时间线展示，但不会搬迁售后表或状态机。投诉、维修、责任、赔偿、退款和订单逆向继续由原领域负责，Support 通过同城 domain link、公开应用服务和可靠事件协作。

## 实施节奏

Phase 24A 仅设计；Phase 24B 工单 MVP 已 Lock。Phase 24C 路由/SLA 尚未进入；后续依次为 24D 实时 IM、24E 机器人/知识库、24F 质检/满意度。每一阶段必须独立迁移、契约、测试、Gate、报告与人工验收。
