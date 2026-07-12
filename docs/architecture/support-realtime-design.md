# Phase 24D 实时会话详细设计

> 状态：开工探测设计，尚未实施。事实基线为 Phase 24C Phase 3 提交 `4374597`。
> 本文不代表 Phase 24D 已进入或已 Lock；实施前仍须完成 Phase 24C Lock。

## 1. 范围与结论

Phase 24D 只建设 Customer、Worker、Admin 坐席之间的自建实时会话：会话、参与者、文本/图片消息、一次性连接票据、Fastify WebSocket、Redis fanout/presence、MySQL 断线补偿，以及会话转工单的只读关联。它不包含机器人、知识库、电话/微信渠道、CSAT、质检、排班，也不写订单、支付、履约、售后、账本或结算状态。

探测结论：该方案可以在现有单体内增量落地，但必须同时补齐依赖和生命周期，不能把现状描述成已支持实时通信。

- 后端是 Fastify 5，当前没有 WebSocket 依赖。实施时固定评审并安装与 Fastify 5 兼容的 `@fastify/websocket` 11.x、其 `ws` 运行时及 TypeScript 类型；插件必须在业务路由之前注册。版本写入 lockfile 后由依赖审计 Gate 固定，不使用已废弃的 `fastify-websocket` 包。
- 当前 `ioredis` 单例是命令连接。Redis Pub/Sub 的 subscriber 进入订阅态后不能承担普通命令，因此 24D 必须引入三个有明确所有权的连接：command、publisher、subscriber；不得复用一个连接冒充三种角色。
- 当前 Nginx `/api/` 没有 `Upgrade`/`Connection` 转发。24D 必须为精确路径 `/api/support/realtime` 增加 WebSocket location、HTTP/1.1 Upgrade、合理的读超时和禁用代理缓冲。
- 当前 `media_assets` 是 Phase 18 履约证据模型，含 order/fulfillment 约束，不能供客服消息旁路复用。24D 使用同一 local/mock `ObjectStorageProvider` 能力，但建立 Support 自有媒体元数据和授权下载接口；仍不宣称真实 OSS。
- 长期 JWT 不进入 URL。已认证 REST 先签发短期、单次、随机 opaque 票据，Redis 原子消费后才允许升级。

## 2. 模块边界

```text
backend/src/support/conversation/
  supportConversationRepository.ts
  supportConversationService.ts
  supportConversationRoutes.ts
  supportRealtimeGateway.ts
  supportRealtimeProtocol.ts
  supportPresenceService.ts
  supportRealtimeRedis.ts

backend/src/providers/im/
  imProvider.ts                 # self_hosted provider envelope only

packages/types/src/support.ts
packages/validators/src/supportSchema.ts
packages/api-client/src/{customer,worker,admin}.ts
apps/{customer,worker,admin}/src/...SupportConversation...
```

所有持久化事实进入 MySQL；Redis 只承载短生命周期票据、在线状态和通知 fanout。Redis 丢失不得造成消息事实丢失，客户端一律用 MySQL `serverSeq` 补偿。

## 3. Migration 051（append-only）

文件名固定为 `051_phase24d_support_realtime_conversations.sql`。禁止修改 000–050；migration 024 永久空号。

### 3.1 `support_conversations`

| 字段 | 设计 |
|---|---|
| `conversation_id` | `VARCHAR(64)` PK |
| `city_code` | `VARCHAR(64)`，同城 FK，禁止 `__global__` |
| `source` | `customer/worker/enterprise`；24D UI 只开放前两者，enterprise 保留契约但无渠道入口 |
| `requester_id` | 既有身份 ID，服务层按 source 校验 |
| `business_client_id` | nullable；仅 enterprise 可用，复合 city FK |
| `status` | `queueing/active/transferred/closed`；不提前加入 24E 的 `bot_waiting` |
| `assigned_agent_id` | nullable，仍为 `admin_users.id`；非空时要求同城 active Support profile |
| `linked_ticket_id` | nullable，复合 `(city_code,ticket_id)` FK；只读关联，不改变工单状态 |
| `create_idempotency_key/fingerprint` | 同 requester、同 city 创建重试保护 |
| `last_server_seq` | `BIGINT UNSIGNED NOT NULL DEFAULT 0`，会话行锁内递增 |
| `version` | CAS，初始 1 |
| 时间 | `started_at`、`accepted_at`、`transferred_at`、`closed_at`、`created_at`、`updated_at` |

索引/唯一约束：`(city_code,conversation_id)`、`(city_code,source,requester_id,status,updated_at,conversation_id)`、`(city_code,assigned_agent_id,status,updated_at,conversation_id)`、创建幂等唯一键。状态时间由 CHECK 保证：active 必须 accepted；closed 必须 closed；未关闭不得有 closed_at。

### 3.2 `support_conversation_participants`

字段：`city_code`、`conversation_id`、`participant_type(customer/worker/agent)`、`participant_id`、`joined_at`、`left_at`、`last_read_server_seq BIGINT UNSIGNED DEFAULT 0`、`version`、审计时间。PK `(city_code,conversation_id,participant_type,participant_id)`，复合 FK 指向会话；active membership 索引 `(city_code,participant_type,participant_id,left_at,conversation_id)`。

参与者读取/发送前必须再次查 active membership；连接建立时的授权快照不能替代逐消息授权。Agent participant ID 使用 `admin_users.id`，不使用 Support profile key。

### 3.3 `support_messages`

字段：`message_id`、`city_code`、`conversation_id`、`sender_type(customer/worker/agent/system)`、`sender_id`（system 时为 NULL）、`client_message_id VARCHAR(128)`、`server_seq BIGINT UNSIGNED`、`message_type(text/image/system)`、`text_content`、`media_asset_id`、`metadata_json`、`created_at`。

- UNIQUE `(city_code,conversation_id,client_message_id)`：重发返回原消息。
- UNIQUE `(city_code,conversation_id,server_seq)`：权威顺序。
- `text` 必须有 1–4000 字符文本且无媒体；`image` 必须有媒体且无文本；`system` 仅服务端产生。
- 发送事务：锁会话并验证 participant/status → 幂等检查 → `last_server_seq+1` → 插消息 → Outbox `support.message.created` → commit → Redis publish。Redis publish 失败只影响即时通知，不回滚已提交事实。

### 3.4 `support_message_media_assets`

字段：`media_asset_id`、`city_code`、`conversation_id`、`uploaded_by_type/id`、`original_file_name`、`content_type(image/jpeg|png|webp)`、`size_bytes`（最大 5 MiB）、`checksum_sha256`、`object_key`、`provider(local|mock)`、`provider_status(stored_local|stored_mock)`、`external_provider_executed=0`、`security_scan_status(pending|clean|rejected)`、`created_at`。同城复合 FK 指向会话；`object_key`、checksum 均唯一/索引。

复用 Phase 18 的签名、MIME、空文件、文件名和路径穿越校验思想以及 `ObjectStorageProvider`，但不引用或写入 Phase 18 `media_assets`/`fulfillment_evidence`。只有 active participant 可上传/下载；消息只能引用同会话、`clean` 的媒体。

### 3.5 Outbox 闭集

新增 `support.conversation.started`、`support.conversation.transferred`、`support.conversation.closed`、`support.message.created`。事件只含 city、conversation/message ID、serverSeq、类型和必要路由信息，不含消息正文、媒体字节或长期凭据；不加入企业 webhook allowlist。

## 4. REST 契约

所有接口要求 Bearer JWT、`x-xlb-city-code`、RequestContext、身份/城市/ownership guard，采用现有 `{ok:true,...}` / 结构化错误风格。

| 方法与路径 | 用途 |
|---|---|
| `POST /api/support/conversations` | Customer/Worker 幂等创建；返回会话 |
| `GET /api/support/conversations?cursor&limit` | 请求人自己的会话，keyset 分页 |
| `GET /api/support/conversations/:id` | active/历史 participant 读取摘要 |
| `GET /api/support/conversations/:id/messages?afterSeq&limit` | 断线补偿；`afterSeq` 默认 0，limit 1–100 |
| `POST /api/support/conversations/:id/messages` | HTTP 降级发送，与 WS 共用同一 service/idempotency |
| `POST /api/support/conversations/:id/read` | CAS/单调更新 `lastReadServerSeq` |
| `POST /api/support/conversations/:id/media` | 私有图片上传，返回 clean asset ID |
| `GET /api/support/conversation-media/:mediaAssetId/content` | participant 鉴权后私有下载 |
| `POST /api/support/realtime-ticket` | 为当前身份和当前 city 签发一次性 WS ticket |
| `GET /api/internal/support/conversations` | Admin 队列/我的会话，cursor 分页 |
| `POST /api/internal/support/conversations/:id/accept` | online active 坐席 CAS 接入 |
| `POST /api/internal/support/conversations/:id/transfer` | 转给同城 active 技能组坐席；不改工单 |
| `POST /api/internal/support/conversations/:id/close` | CAS 关闭并写 system message/outbox |

连接票据响应 `{ticket, expiresAt}`。ticket 由 32-byte CSPRNG 产生，只返回一次；Redis key 保存 SHA-256(ticket) 对应的 `userId/appType/role/cityCode/issuedAt`，TTL 60 秒。升级端用 Redis 7 `GETDEL` 原子消费；不存在、过期、city 不一致或 Redis 不可用均拒绝。票据不得写日志、Outbox、数据库或浏览器持久存储。

## 5. WebSocket 协议

升级路径：`GET /api/support/realtime?ticket=<opaque>`。URL 中只有 60 秒单次票据，不含 JWT。服务器成功升级后发送：

```json
{"type":"ready","protocolVersion":1,"connectionId":"...","serverTime":"..."}
```

客户端帧闭集：

- `subscribe {requestId,conversationId,afterSeq}`：校验 active participant，先从 MySQL返回 `catchup`，再订阅本地连接集合。
- `send_message {requestId,conversationId,clientMessageId,messageType,textContent?,mediaAssetId?}`：调用与 REST 相同 service；返回 `message_ack`。
- `mark_read {requestId,conversationId,lastReadServerSeq}`：单调更新。
- `ping {requestId}`：返回 `pong`。

服务端帧：`ready`、`catchup`、`message_created`、`conversation_updated`、`message_ack`、`error`、`pong`。每帧含 `protocolVersion:1`；最大 JSON 帧 64 KiB，图片只走 REST 上传。未知类型/无效 JSON返回协议错误；连续违规或超限用 1008/1009 关闭。每连接订阅上限 20、发送限流 30 条/分钟、心跳 25 秒、75 秒无 pong 关闭。所有 message handler 在 WS handler 内同步绑定，再等待异步鉴权，避免握手后丢首帧。

## 6. 顺序、断线补偿与 Redis fanout

MySQL 是唯一消息事实与排序源。`serverSeq` 只保证单会话严格递增，不承诺跨会话全局顺序。

1. 客户端保存每个会话最后确认的 `serverSeq`。
2. 重连取得新 ticket，连接后发送 `subscribe(afterSeq)`。
3. 服务端分页读取 `server_seq > afterSeq ORDER BY server_seq ASC LIMIT 100`；若还有数据，响应 `hasMore=true`，客户端继续补偿。
4. Redis channel `xlb:support:conversation:<city>:<conversationId>` 只发布 `{conversationId,serverSeq,messageId}`。接收实例必须从 MySQL按 ID/seq 读取并重新做本地订阅授权，不信任 Pub/Sub payload 中的消息正文。
5. publish 失败、订阅断开或跨实例瞬时丢包均由上述补偿恢复；因此不宣称 Redis Pub/Sub 是 durable queue 或 exactly-once。

本地连接表只记录 socket → identity/subscriptions。Redis subscriber 按实例统一 pattern subscribe，避免每 socket 新建 Redis 连接。publisher/subscriber 用 `duplicate()` 创建并显式 `connect()`；`app.onClose` 依次停止接收、发送 1001、等待短暂 drain、unsubscribe、quit 三类连接。当前 `server.ts` 没有调用 `closeRedisClient()`，24D 必须把 command client 也纳入 Fastify shutdown hook。

## 7. Presence 事实边界

Presence 是提示，不是分配、在线考勤或消息送达证明。

- `support:presence:<city>:<appType>:<userId>:<connectionId>` TTL 75 秒，心跳续期；聚合 presence 为任一 key 存在。
- Admin 坐席还必须满足 24C `support_agents.lifecycle_status=active`；WS presence 不自动修改 `work_status`，也不绕过技能组/分配规则。
- Redis 不可用时 presence 返回 `unknown`，消息 REST/补偿仍可用；不得显示虚假的 offline 事实。
- 不持久化逐次上下线历史，不作为 OA 排班或质检输入。

## 8. Nginx 与部署

在通用 `/api/` 之前加入精确 location（实施时由配置测试验证）：

```nginx
location = /api/support/realtime {
  proxy_pass http://backend:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 90s;
  proxy_send_timeout 30s;
  proxy_buffering off;
}
```

首版无需 sticky session：每个 socket 生命周期固定在一个实例，跨实例通知由 Redis fanout，事实由 MySQL补偿。部署健康检查要分别报告 MySQL、Redis command 和实时 subscriber 状态；Redis 故障时 readiness 可降级，但 ticket 签发/升级必须 fail closed。

## 9. 状态与权限

状态机：`queueing -> active -> transferred -> active -> closed`；queueing 也可 requester 主动关闭。所有转移使用 expectedVersion CAS。Customer/Worker 只能访问自己作为 participant 的会话；Admin/Operator 必须有显式 real-city scope 和 active Support profile，accept 还要求 work_status=online。Auditor 仅 REST 只读，不可建立坐席实时订阅、发送、接入、转移或关闭。跨 city、伪造 participant、离会后发送、closed 后普通发送均拒绝。

会话“转工单”只允许在同 city 创建/关联 `support_tickets`，调用既有 ticket service 并分别保持幂等；不复制聊天正文到工单描述，不改变 Phase 17 complaint 或任何受保护领域状态。

## 10. 实施顺序与 Gate

1. 契约与 migration 051：types → validators → DB → contract/migration tests。
2. MySQL conversation/message service 与 REST 降级路径；先证明幂等、顺序、权限。
3. 一次性 ticket 与 Redis 三连接生命周期。
4. WebSocket gateway、fanout、断线补偿、graceful shutdown、Nginx。
5. 三端 UI 与浏览器证据；网络中断时明确显示重连/补偿状态。

新增 `scripts/check-phase24d-boundaries.ps1` 和 aggregate gate，并接入 package scripts/CI。Gate 至少包括：

- Contract：类型、validator、REST/WS frame、Outbox 闭集一致。
- Migration：fresh/replay、同城复合 FK、CHECK/唯一键、024 未出现、000–050 checksum 不变。
- Integration：创建/accept/send/close；同 client ID 幂等；并发发送 serverSeq 唯一单调；HTTP/WS 共用幂等；转工单只读边界。
- Security：跨城/跨 requester/跨角色/离会参与者/过期票据/票据重放/媒体越权全部拒绝；日志不含 ticket/JWT/正文。
- Realtime：断线补偿、Redis publish 丢失、subscriber 重连、慢消费者、无效帧、最大帧、心跳、优雅关停。
- Multi-instance：启动两个 backend 实例共享 MySQL/Redis，A 实例发送、B 实例接收；明确该测试证明 fanout，不宣称 Pub/Sub 持久化。
- Nginx：真实 Upgrade smoke，非 Upgrade HTTP 不能误进 WS；部署配置语法检查。
- Performance：基线至少 200 并发连接、每连接 2 个会话，消息 fanout p95 < 500 ms（本地 CI 资源不足时使用独立性能 job，不降低功能 Gate）；事件循环/内存阈值记录在报告。
- Provider：仅 local/mock，图片内容签名/大小/路径/私有下载；禁止真实 OSS 成功状态。
- 最终串联 typecheck、build、全量 regression、三端 Playwright 和 `pnpm preflight`。

## 11. 已确认决策与未决生产条件

设计阶段没有发现阻止编码的仓库硬冲突。已确认：迁移编号应为 051；现有 Redis/Nginx/媒体实现都需增量扩展；一次性 Redis ticket 可行。

但以下是生产启用条件，不得被单进程测试掩盖：依赖审计后固定 `@fastify/websocket` 版本；Redis 必须可用且配置连接/内存上限；Nginx Upgrade smoke 必须通过；隐私留存/删除策略须在 24D Lock 报告明确（首版建议消息与 Support 工单同保留策略，禁止对外导出，删除仅由后续治理流程实施）；多实例 fanout 与断线补偿必须有真实双实例证据。

Phase 24D 完成后仍不得整理 Phase 0–23、创建 Phase 25 或使用 migration 024。24E/24F 必须继续使用原编号与独立迁移、测试、报告，最终统一做 Phase 24 竣工验收。
