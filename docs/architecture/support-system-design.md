# XLB / 喜乐帮客服系统设计（Phase 24）

## 1. 文档状态与决策边界

- 状态：**DRAFT — 等待人工确认**。
- 分支：`codex/phase24-support-system-design`。
- 基线：`main` at `04f1c43`，Phase 23D 已锁定。
- 本阶段允许：仓库探测、架构设计、字段级数据草案、分期计划和验收定义。
- 本阶段禁止：新增客服业务代码、迁移、API、WebSocket、Provider、页面或运行时依赖。
- 历史迁移 `000`–`046`、既有 Tag、订单/支付/派单/履约/账本/结算/售后语义均保持不变。

架构图见 `docs/diagrams/support-system-architecture.md`。

## 2. 当前技术栈探测

| 领域 | 当前事实 | Phase 24 设计影响 |
|---|---|---|
| Monorepo | pnpm 9 workspace + Turborepo；Node.js ≥20；TypeScript 5.7 ESM | 新包不是必需，优先扩展现有 workspace |
| 后端 | Fastify 5 单体，`backend/src/app.ts` 集中注册模块 | `registerSupportModule(app)` 在既有 App 注册，不建旁路服务 |
| 数据访问 | MySQL 8 + `mysql2/promise` 手写 Repository/SQL，无 ORM | 客服 Repository 延续显式 SQL、事务和行锁范式 |
| 城市隔离 | RequestContext → CityCode → Contract → Guard；Repository 使用 `ScopedExecutor` | 所有客服业务表必须有 `city_code`，跨表引用采用城市复合外键 |
| 鉴权 | 自有 HS256 Bearer JWT；角色为 customer/worker/admin/operator/auditor | 初期坐席复用 admin/operator，另建坐席档案；不贸然扩展全局 Role |
| 异步事件 | MySQL Transactional Outbox，支持 claim、lease、renew、retry、dead letter | 所有 `support.*` 异步事件复用现有 Outbox，不另建消息总线 |
| Redis | ioredis 命令客户端；现用于城市派单 Stream | IM 阶段增加独立 Pub/Sub 连接、Presence TTL 和一次性 WS 票据 |
| 实时通信 | 当前无 WebSocket/Socket.IO 依赖，Nginx 也没有 Upgrade 配置 | 24D 才引入；先在 Fastify 单体内扩展，生产多实例需额外验证 |
| 媒体 | `ObjectStorageProvider` 只有 local/mock，私有读取，支持 jpg/png/webp | IM 图片复用媒体资产与 Provider 边界，不能声称真实 OSS |
| 前端 | React 18 + Vite；三端已采用 `app/pages/features/adapters/routes` | 页面放 `pages`，领域状态与组件逐步进入 `features/support`，API 只走 `@xlb/api-client` |
| 测试 | Vitest workspace + Playwright；unit/contract/integration/security/performance/e2e | 每个 24x 阶段建立独立测试集合和硬阻断 Gate |

### 2.1 当前前端组织事实

- Customer/Admin 的 `features/` 仍主要是边界目录，页面集中于 `pages/`；不能假设已有完整 feature 内部分层。
- Worker 已有 `features/auth|tasks|fulfillment|finance`，以 store/reducer 维护领域状态，页面仍在 `pages/`。
- Phase 24 前端沿用 Phase 23C 的渐进式拆分：页面级懒加载、Error Boundary、API Adapter、feature reducer/store；不为“理想目录”做大规模无关重构。

## 3. 现有能力与关键冲突

### 3.1 Phase 17 已经拥有投诉 Case

`backend/src/aftersale/case` 已实现：

- 客户投诉创建、查询和留言；
- Admin 分诊、处理、解决、关闭和留言；
- 维修单、责任认定、赔偿意图；
- 售后状态机和 append-only 时间线；
- 事务内 Outbox 事件；
- 城市、订单归属、角色和幂等校验。

因此不能把通用 `support_ticket` 设计成第二套投诉 Case。最终决策：

1. Support Ticket 负责渠道接入、排队、路由、分配、SLA、坐席沟通和跨域关联。
2. Aftersale 继续独占投诉、维修、责任、赔偿意图和售后结果。
3. `support_tickets.linked_aftersale_complaint_id` 只关联，不复制售后字段和状态机。
4. 售后动作通过应用服务调用或可靠编排完成，Support Repository 禁止写 `aftersale_*` 表。
5. `support.ticket.resolved` 与 `aftersale.complaint.resolved` 是不同事实；前者必须记录 resolution code，并在有关联案件时验证领域状态。

### 3.2 Phase 17 是否是独立客服系统

结论：**不是**。

Phase 17 的正式范围和 Tag 是 `order reverse flow + aftersale complaints`。它已经形成独立的售后业务域，但不具备完整客服平台所需的以下能力：

- 跨 customer/worker/enterprise 的通用问题工单；
- 技能组、坐席档案、排队、领取、转接和排班/Presence；
- 按身份、问题类型、城市和紧急度的路由；
- 首响/解决 SLA、超时升级和运营考核；
- 实时会话、消息幂等、断线补偿和多实例 fanout；
- 知识库、Bot/NLU 编排和敏感场景转人工；
- CSAT、客服质检、坐席绩效和客服运营看板。

同时，Phase 17 已于 `xlb-phase17-order-reverse-aftersale` 锁定，迁移 `034` 和历史 Tag 不可修改。因此 Phase 24 不回填、不重写、不“移植进” Phase 17；两者采用清晰的上游编排/下游业务处理关系：Phase 24 拥有客服交互与运营状态，Phase 17 拥有售后业务状态。

### 3.3 资金、派单和 Worker 边界

- 提现异常工单只能查询、记录、路由和升级；不能直接执行提现、支付、退款、结算或账本写入。
- 改派/退款/赔偿通过现有 Reverse/Aftersale/Refund 服务委托；Support 不写对应表。
- CSAT 回流 Worker 必须发布事件，由 Worker 域决定是否以及如何影响评分；Support 不直接写 Worker 表。
- 企业客户工单必须额外携带 `business_client_id`，所有查询同时校验 city + enterprise tenant；support 事件默认不进入企业 webhook 白名单。

### 3.4 当前领域接口缺口

设计不能用跨域 Repository 或直读表来掩盖当前缺口：

- Payment 当前没有面向客服的只读查询 facade；实际支付成功生产 `payment.paid`，虽然类型中存在 `order.paid`，但当前找不到该事件的真实 producer。
- Review 只有客户创建订单评价的写接口，没有客服只读 facade 或评价事件；CSAT 必须是 Support 自有概念，不能复用 `order_reviews`。
- Compliance 没有 certification submitted/approved/rejected Outbox 事件。
- Worker Finance 没有 withdrawal 状态 Outbox 事件；坐席默认也无财务审批或打款权限。
- Dispatch 的 no-match/timeout/manual-review 当前是模块内事件，不是 Outbox 事件。

需要这些事实时，由对应业务域新增明确的只读 facade 或正式领域事件，并单独通过边界审查；Support 不直接 import 其 Repository。

### 3.5 Phase 17 客服能力纳管到 Phase 24 的策略

可以建立独立 Phase 24 客服工程，但采用**增量纳管**而不是物理搬迁或删除 Phase 17。独立客服工程的判定标准是拥有统一接入、工单、会话、路由、SLA、坐席运营、知识和质检能力，而不是把所有被客服操作的业务状态收归 Support。

| Phase 17 现有能力 | Phase 24 处理方式 | 最终事实所有者 |
|---|---|---|
| Customer 售后/投诉入口 | 入口与导航逐步收口到 Support；投诉提交仍委托 Aftersale | Support 拥有接入；Aftersale 拥有投诉 |
| Admin `AftersaleOpsPage` | 逐步嵌入/跳转至 Support Workbench 的售后面板；保留兼容路由直到验收 | Support 拥有工作台；Aftersale 拥有动作 |
| `assigned_admin_id` | 作为历史/领域经办人；新工单分配使用 `support_agents`，通过 link 显示映射 | Support 拥有客服分配 |
| `customer_service.note` | 在 Support Ticket 中写通用留言；售后必要审计仍通过 Aftersale Service 追加领域时间线 | 各自拥有自己的审计记录 |
| `aftersale_timeline_events` | 只读投影到工单统一时间线，不迁表、不改历史记录 | Aftersale |
| complaint 状态机 | Support 只跟踪客服受理状态并关联 complaint，不复制、不替代 | Aftersale |
| repair/liability/compensation | Workbench 发起受控委托并展示结果，不在 Support 实现 | Aftersale |
| reverse/refund | Workbench deep link 或调用受控 facade；Support 不执行资金/订单变更 | Reverse / Refund |

#### 迁移阶段

1. **24B 双轨兼容**：创建独立 `support_tickets` 和 domain link。既有投诉 API/页面保持可用；新客服入口创建 Ticket，投诉类再幂等关联 Aftersale Complaint。
2. **历史纳管**：为现有 complaint 建立幂等 Support link/read projection；不 UPDATE/DELETE `aftersale_*`，不修改迁移 `034`。是否为全部历史投诉生成 Ticket 必须先评估数据量、保留期和运营价值。
3. **工作台收口**：Support Workbench 聚合 Ticket、Complaint 和领域动作；原 Aftersale 页面转为兼容入口，并保留回滚开关。
4. **写入口收敛**：新版本 C/W/A 导航优先进入 Support；旧 API 在契约兼容期内仍由 Aftersale 处理，不做静默语义切换。
5. **退役评审**：只有在数据对账、权限、E2E、监控和回滚证据通过后，才考虑废弃旧 UI 入口；底层 Aftersale 业务域和历史表不退役。

#### 禁止的“转移”方式

- 不把迁移 `034` 的表重新命名或复制后删除；
- 不把 Aftersale Service/Repository/StateMachine 移入 `backend/src/support`；
- 不让 `support_ticket.status` 取代 complaint/repair/refund/reverse 状态；
- 不在一个大提交中改写既有 API、页面、迁移和历史数据；
- 不把双写当成一致性方案；跨域协作使用幂等 facade、Outbox 和 receipt/inbox。

## 4. 目标模块划分

```text
backend/src/support/
├─ supportModule.ts
├─ ticket/              # TicketService/Repository/Routes/StateMachine/SLA
├─ routing/             # 技能组匹配、队列、领取和升级
├─ conversation/        # 会话、消息、参与者、Presence、转接、转工单
├─ bot/                 # Bot 编排、意图结果、转人工策略
├─ knowledgeBase/       # 文章、版本、发布、检索
├─ quality/             # CSAT、质检、指标聚合
└─ agentWorkbench/      # 坐席档案、在线状态、队列视图
```

模块之间只通过应用服务或事件交互，Repository 不跨域写表。所有 HTTP/WS 入口先经过 RequestContext、城市校验、角色/归属 Guard 和 Zod Contract。

## 5. 数据模型草案

### 5.1 全局约束

- 新迁移从 `047_...sql` 开始，只追加，不修改 `000`–`046`。
- 所有下表均包含 `city_code VARCHAR(64) NOT NULL`，FK 至 `cities(city_code)`，并 `CHECK (city_code <> '__global__')`。
- ID 使用现有字符串 ID 生成范式；时间使用 `TIMESTAMP(3)`；金额继续使用 `DECIMAL`，禁止浮点。
- 同城引用优先建立唯一 `(city_code, entity_id)`，下游使用复合外键，DB 层拒绝跨城拼接。
- 可变记录保留 `created_at/updated_at`；审计事件 append-only，无 UPDATE/DELETE API。

### 5.2 Phase 24B：工单 MVP

#### `support_tickets`

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `ticket_id` | VARCHAR(64) | PK |
| `city_code` | VARCHAR(64) | 必填、城市 FK |
| `source` | ENUM | customer/worker/enterprise/admin/system |
| `requester_id` | VARCHAR(64) | customer/worker/admin 主体 ID；企业联系人见下一字段 |
| `business_client_id` | VARCHAR(64) NULL | enterprise 来源必填，复合租户 FK |
| `type` | ENUM | order_question/order_dispute/service_complaint/withdrawal_issue/account_issue/safety/other |
| `priority` | ENUM | low/normal/high/urgent/critical |
| `status` | ENUM | open/processing/waiting_requester/escalated/resolved/closed |
| `subject` | VARCHAR(160) | 工单摘要 |
| `description` | TEXT | 首次问题描述；限制长度 |
| `related_order_id` | VARCHAR(64) NULL | 同城订单复合 FK |
| `related_worker_id` | VARCHAR(64) NULL | 同城 worker binding 约束 |
| `linked_aftersale_complaint_id` | VARCHAR(64) NULL | 同城投诉复合 FK；只关联不复制状态 |
| `assigned_agent_id` | VARCHAR(64) NULL | 指向 support_agents |
| `assigned_skill_group_id` | VARCHAR(64) NULL | 指向 support_skill_groups（24C 前可空） |
| `sla_first_response_due_at` | TIMESTAMP(3) NULL | SLA 快照 |
| `sla_resolution_due_at` | TIMESTAMP(3) NULL | SLA 快照 |
| `first_responded_at` | TIMESTAMP(3) NULL | 首响事实 |
| `resolved_at` / `closed_at` | TIMESTAMP(3) NULL | 状态时间 |
| `resolution_code` | VARCHAR(64) NULL | resolved 时必填 |
| `idempotency_key` | VARCHAR(128) | 创建方幂等键 |
| `version` | BIGINT UNSIGNED | CAS，避免并发覆盖 |
| `created_at/updated_at` | TIMESTAMP(3) | 审计时间 |

关键索引：

- UNIQUE `(city_code, source, requester_id, idempotency_key)`；企业来源另含 `business_client_id`。
- UNIQUE `(city_code, ticket_id)`，供复合 FK。
- INDEX `(city_code, status, priority, created_at, ticket_id)`，坐席队列稳定分页。
- INDEX `(city_code, assigned_agent_id, status, updated_at, ticket_id)`。
- INDEX `(city_code, assigned_skill_group_id, status, priority, created_at)`。
- INDEX `(city_code, related_order_id, created_at)`、`(city_code, linked_aftersale_complaint_id)`。
- INDEX `(city_code, status, sla_resolution_due_at)`，供 SLA 扫描。

#### `support_ticket_events`

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `ticket_event_id` | VARCHAR(64) | PK |
| `city_code` / `ticket_id` | VARCHAR(64) | 同城复合 FK |
| `event_type` | ENUM | created/assigned/claimed/commented/status_changed/escalated/resolved/reopened/closed/domain_linked/sla_breached |
| `actor_type` | ENUM | customer/worker/admin/operator/system/bot |
| `actor_id` | VARCHAR(64) NULL | system/bot 可空 |
| `visibility` | ENUM | requester/internal/all |
| `content` | TEXT NULL | 留言或原因；长度限制 |
| `payload_json` | JSON | 最小审计快照，不保存秘密/完整 Token |
| `idempotency_key` | VARCHAR(128) NULL | 写事件去重 |
| `created_at` | TIMESTAMP(3) | append-only |

索引：UNIQUE `(city_code,ticket_event_id)`、UNIQUE `(city_code,ticket_id,idempotency_key)`、INDEX `(city_code,ticket_id,created_at,ticket_event_id)`。

#### `support_event_receipts`

现有 `event_outbox` 的 claim/status 是单一交付状态，不是多订阅者 fan-out：Dispatch、Ledger 或其他消费者抢占并发布后，Support 不能再竞争 claim 同一事件。Support 若需要领域事件投影，应保留 Outbox 为事实源，并使用独立 receipt/inbox 去重：

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `receipt_id` | VARCHAR(64) | PK |
| `city_code` | VARCHAR(64) | 城市 FK |
| `consumer_name` | VARCHAR(128) | 固定内部消费者名 |
| `event_id` | VARCHAR(64) | 指向 Outbox 事实 ID |
| `event_type` | VARCHAR(128) | 接收时快照 |
| `status` | ENUM | pending/processed/failed/dead_letter |
| `attempt_count` | INT UNSIGNED | 有界重试 |
| `last_error_code` | VARCHAR(64) NULL | 脱敏错误码 |
| `processed_at/created_at/updated_at` | TIMESTAMP(3) | 审计时间 |

UNIQUE `(city_code,consumer_name,event_id)` 防止重复投影。具体扫描/投递机制在 24B 契约阶段设计并验证，禁止修改 Outbox 的全局 published 语义来伪造 fan-out。

### 5.3 Phase 24C：坐席、技能组和 SLA

#### `support_agents`

`agent_id`、`city_code`、`admin_user_id`、`display_name`、`status(active/suspended)`、`presence(offline/online/busy/away)`、`max_concurrent_conversations`、`last_presence_at`、`version`、审计时间。唯一 `(city_code,admin_user_id)`；只允许已认证 admin/operator 绑定。

#### `support_skill_groups`

`skill_group_id`、`city_code`、`name`、`source_scope JSON`、`ticket_type_scope JSON`、`language_scope JSON`、`priority_weight`、`is_active`、审计时间。实际匹配前把 JSON 规范化为受控枚举，不能执行用户提供的表达式。

#### `support_agent_skill_groups`

`city_code`、`agent_id`、`skill_group_id`、`proficiency`、`is_primary`、`created_at`；复合 PK，所有引用同城。

#### `support_sla_policies`

`sla_policy_id`、`city_code`、`ticket_type`、`source`、`priority`、`first_response_minutes`、`resolution_minutes`、`escalation_priority`、`effective_from/to`、`is_active`、`version`。唯一有效策略冲突由服务和 Gate 检查。

SLA Job 使用 DB claim/lease 或 `FOR UPDATE SKIP LOCKED`，不能复用当前仅进程内 `isRunning` 防重来宣称多实例安全。

### 5.4 Phase 24D：实时会话

#### `support_conversations`

`conversation_id`、`city_code`、`source`、`requester_id`、`business_client_id`、`status(bot_waiting/queueing/active/transferred/closed)`、`assigned_agent_id`、`linked_ticket_id`、`last_server_seq`、`started_at/accepted_at/closed_at`、`version`、审计时间。

#### `support_conversation_participants`

`city_code`、`conversation_id`、`participant_type`、`participant_id`、`joined_at/left_at`、`last_read_server_seq`；复合 PK，读取消息前校验有效 membership。

#### `support_messages`

`message_id`、`city_code`、`conversation_id`、`sender_type`、`sender_id`、`client_message_id`、`server_seq BIGINT`、`message_type(text/image/system)`、`text_content`、`media_asset_id`、`metadata_json`、`created_at`。

关键唯一约束：`(city_code,conversation_id,client_message_id)` 保证重试幂等，`(city_code,conversation_id,server_seq)` 保证权威顺序。Redis Pub/Sub 只负责 fanout；断线补偿按 `server_seq` 从 MySQL 拉取。

### 5.5 Phase 24E：机器人和知识库

#### `support_kb_articles` / `support_kb_article_versions`

文章保存 `article_id`、`city_code`、可空 `category_id/sku_id`、标题、状态(draft/published/archived)、语言、当前版本、审核人和发布时间；正文进入不可变 version 表。发布必须经 admin/operator 审核。

NLU Provider 返回 `provider`、`provider_status`、`external_provider_executed`、`intent`、`confidence`、`matched_article_ids` 和可审计原因。初始只允许 deterministic/mock，未真实调用时不能标记外部成功。

### 5.6 Phase 24F：满意度与质检

#### `support_csat_records`

`csat_id`、`city_code`、`ticket_id/conversation_id`、`requester_type/id`、`score(1-5)`、`comment`、`idempotency_key`、`submitted_at`。一个结束对象只能有一条有效评价。

#### `support_quality_reviews`

`quality_review_id`、`city_code`、`ticket_id/conversation_id`、`reviewer_admin_id`、`score`、`rubric_json`、`finding`、`status`、`reviewed_at`。Rubric 版本必须固化，避免历史分数随模板变化。

## 6. 状态与权限模型

### 6.1 Ticket 状态机

```text
open -> processing -> waiting_requester -> processing
open|processing|waiting_requester -> escalated -> processing
processing|escalated -> resolved -> closed
resolved -> processing            # reopen
```

- 任何非法跳转返回 409；所有成功跳转与 `support_ticket_events` 同事务。
- 客户/师傅只能创建、查看自己的工单、追加 requester 可见留言和 reopen 自己的 resolved 工单。
- 坐席只能操作所在城市、技能组或已分配工单；Admin 可在自身城市 scope 内监管。
- 企业主体同时校验 city、business_client、credential scope。
- Auditor 仅只读 internal audit view，不能分配或改变状态。

### 6.2 敏感与紧急策略

资金、安全、人身伤害、账号盗用类问题直接 escalated，禁止机器人自动解决。机器人只能给出信息性回复或转人工，不能触发退款、改派、提现、赔偿或其他业务动作。

## 7. API 与契约方向（待 24B 定稿）

所有类型按 `packages/types → packages/validators → backend → packages/api-client → apps` 顺序落地。

- Customer：`POST/GET /api/support/tickets`、`GET/POST /api/support/tickets/:id[/events|reopen]`。
- Worker：同一路由前缀或 `/api/worker/support/*`，由 appType/role + ownership 明确隔离；最终在契约评审中二选一，不能同时维护重复 API。
- Admin：`/api/internal/support/tickets`，包含过滤、领取、分配、留言、状态和领域委托动作。
- IM：先用已认证 REST 获取一次性连接票据，再升级 `/api/support/realtime`；禁止 URL 携带长期 JWT。
- 列表统一 cursor/keyset 分页，排序键包含唯一 ID；不接受无界 limit。

## 8. Outbox 事件计划

候选闭集：

- `support.ticket.created|assigned|escalated|resolved|reopened`
- `support.sla.breached`
- `support.conversation.started|transferred|closed`
- `support.message.created`
- `support.csat.submitted`
- `support.quality.reviewed`

实现时必须同时更新 `packages/types/src/eventOutbox.ts`、validator schema 和契约测试。事件默认内部可见，不自动加入企业 webhook allowlist；对外暴露须单独做租户和隐私评审。

已有事件必须以实际 producer 为准，不能只根据类型联合声明推断存在。例如当前支付成功实际生产 `payment.paid`，不能把未发现 producer 的 `order.paid` 当作可靠订阅事实。Support 对其他领域事件的投影使用独立 receipt/inbox，不能与既有 claim 消费者争抢同一 Outbox 行。

## 9. Provider 与实时基础设施设计

### 9.1 IM Provider

`backend/src/providers/im` 定义连接/发布/关闭能力，首个实现是自建 Fastify WebSocket + Redis fanout。Provider envelope 必须真实描述 local/self-hosted 状态，不伪装第三方成功。

### 9.2 NLU Provider

`backend/src/providers/nlu` 定义 intent/classification/retrieval 接口。24E 初始 deterministic/mock；任何外部模型必须经过密钥、出境/隐私、超时、限流、降级和成本评审。

### 9.3 电话/微信渠道

只保留 adapter contract，不在 24B–24D 宣称已实现。接入时必须校验签名、防重放、映射 tenant/city/identity，并保存 Provider 真实状态。

## 10. 三端集成点

### Customer

- 订单详情、个人中心和售后页面提供客服入口；自动带入 orderId，但提交前展示关联信息。
- 24B：提交问题、我的工单、详情/留言；投诉类明确展示其售后案件关联。
- 24D：入口优先进入 IM，可在失败或转接时创建工单。

### Worker

- 任务详情、维修任务、财务/提现详情、个人中心提供入口。
- 提现异常只提交问题和查看进展，不提供客服侧“执行提现”按钮。

### Admin

- 新增懒加载 Support Workbench 页面：我的工单、技能组公海、全部（受城市 scope 限制）。
- 工单详情将客户/师傅、订单只读快照、售后案件、时间线、内部留言和允许的委托动作分区显示。
- 后续增加会话队列、知识库、质检和指标；每个操作必须 API 回执成功后更新 UI。

## 11. 分阶段施工计划

为避免与仓库既有 Phase 1–23 混淆，附件中的 Phase 0–5 映射为：

| XLB 阶段 | 内容 | 主要交付 | 进入条件 |
|---|---|---|---|
| 24A | 探测与设计 | 本文、架构图、模块 README、报告 | 当前进行；人工确认后结束 |
| 24B | 工单 MVP | 迁移 047、contracts、ticket 后端、API Client、C/W/A 页面、测试/Gate | 24A 人工确认 |
| 24C | 路由/SLA/坐席 | agent/skill/SLA schema、队列、领取、超时升级 | 24B Lock |
| 24D | 实时 IM | conversation/message、WS、Redis fanout/presence、断线补偿 | 24C Lock + WS 依赖确认 |
| 24E | Bot/知识库 | KB、deterministic/mock NLU、敏感转人工 | 24D Lock + 数据/隐私评审 |
| 24F | CSAT/质检闭环 | CSAT、质检、事件回流、运营看板 | 24E Lock |

每一阶段均需：append-only migration、types/validators、API Client、权限矩阵、跨城/跨角色/跨租户拒绝测试、幂等/并发测试、Phase Gate、三端浏览器证据、报告、`--no-ff` Lock 和 Tag。

## 12. 测试与 Gate 设计

### 24B 最低测试矩阵

- Unit：状态机所有允许/禁止跳转、领域关联策略、优先级规则。
- Contract：types/validators/API response/outbox event 闭集一致。
- Integration：customer/worker 创建 → admin 领取/分配 → 留言 → resolve/close；reopen；Outbox 原子写入。
- Security：跨 city、跨 customer、跨 worker、跨 enterprise、错误 appType/role、内部留言泄露全部拒绝。
- Concurrency：相同 idempotency key 只创建一单；两坐席同时领取只有一个成功；CAS 防丢更新。
- Migration：全新建库、重复 replay、复合 FK 跨城拒绝、历史迁移 checksum 不变。
- E2E：C/W/A 三端至少各一条真实 API 流程，不接受 UI-only success。

### 24D 追加测试

- 消息 client ID 幂等、server sequence 单调、断线补偿、未授权会话读取拒绝。
- 多连接/多会话性能阈值；慢消费者、Redis 暂时不可用和 WS 重连。
- Nginx Upgrade 与应用优雅关停验证；不能用单进程测试证明多实例可靠。

### Gate

新增 `gate:phase24b` 等硬阻断脚本，并纳入 `.github/workflows`；Gate 至少串联 boundary、contract、migration、focused integration/security、typecheck/build、E2E 和必要的性能阈值。现有 `pnpm preflight` 继续是合并前置条件。

## 13. 风险与待人工确认决策

1. **工单与投诉**：确认采用“Support 路由/SLA 外壳 + Aftersale 业务 Case”双对象关联，而非迁移或复制 Phase 17。
2. **坐席身份**：建议 24C 先复用 admin/operator JWT，加 `support_agents` 业务档案；暂不新增全局 `support_agent` Role。
3. **Worker API 路径**：确认统一 `/api/support` 还是保留 `/api/worker/support`；设计倾向统一资源路径 + Guard。
4. **24D WebSocket 依赖**：届时评审 Fastify 5 兼容插件、Nginx Upgrade 和 Redis Pub/Sub 生命周期。
5. **真实外部渠道/NLU**：24E 前仍限定 deterministic/mock；任何真实 Provider 单独开范围。
6. **隐私与留存**：24B 前必须确定留言、聊天、图片和录音的脱敏、保留期、导出和删除策略；当前仓库尚无完整数据保留框架。
7. **SLA 多实例**：必须采用 DB lease/claim，不能直接复用进程内定时任务互斥。

## 14. Phase 24A 验收结论

本设计已经完成附件要求的技术栈、三端模式、既有售后边界、目标分层、调用关系、字段级表草案、集成点、分期计划、测试与风险探测。根据附件指令，Phase 24A 到此停止；获得人工确认前不得创建迁移 047 或实现 `backend/src/support`。
