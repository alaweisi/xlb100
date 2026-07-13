# Phase 27 — XLB Notification Design（Accepted Design Only）

> **ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**
>
> 人类接受日期：`2026-07-13`。N2/O2/P2 聚焦复审：`PASS`。本文不是 Phase 27 runtime 入口、实施授权、migration 授权、正式进入或 Lock。

## 0. 接受记录

| Item | Accepted truth |
| --- | --- |
| Human acceptance | `2026-07-13`；**PASS — DESIGN ONLY** |
| N2/O2/P2 focused review | **PASS** |
| Phase 27 implementation | **NOT STARTED / RUNTIME NOT AUTHORIZED** |
| Phase 27 Lock | **NOT ENTERED** |
| Runtime impact | 当前 source Outbox、Order、Support、Customer App 与 Worker App 均未改变 |

本次接受固定以下设计基线：

- MVP 仅为 Customer/Worker 同城本人 in-app inbox；无 Admin/OA inbox。
- 未来施工顺序固定为 `054 Platform delivery -> 055 Notification projection -> API/runtime verification -> Customer/Worker pages`。
- Notification 不直接 claim/ack source Outbox；source 事件保持 `implicit-v0 / source schema version absent`，synthetic compatibility major `0` 仅是 future Platform metadata。
- Durable receipt 使用 `(subscriber_id,event_id)`；template 使用全局不可变 `template_revision_id`；首次 canonical target、revision 与 fingerprint 固化。
- Raw compatibility shape strict fail-closed；delivery `delivered`、recipient `read`、候选 `archive` 与 external delivery 是相互独立的事实。

## 1. 目标、非目标与真实边界

### 1.1 领域目标

Phase 27 的候选目标只有两层，且必须按依赖顺序实施：

1. 在未来单独授权后，实现 Phase 26 Option A 的平台级 per-subscriber delivery 基础能力，为独立订阅者提供不争抢 source Outbox 的 delivery、lease、retry、DLQ、replay audit 与 durable receipt 边界；
2. 在上述能力通过隔离性和完整性 Gate 后，实现 Customer/Worker 的 in-app inbox 投影与本人 mark-read；unread count/archive 只有在人类冻结语义后才可进入 runtime。

Notification 是派生展示域，不是业务事实源。它只保存为收件人展示通知所需的最小数据，不改变 Order、Support 或任何受保护领域的状态。

### 1.2 当前真实事实

- `event_outbox` 是单消费者 source work-claim queue：每个 source row 只有一套共享 status、lease、attempt、retry 与 dead-letter 生命周期；任一时刻最多一个有效 lease，失败后可产生顺序重试 claim。
- Dispatch 当前 claim `order.created`；现有消费者成功后把 source row 置为 `published`。`published` 只表示该 source queue 责任已确认，不表示所有未来订阅者完成。
- Notification 不得调用 `claimEventsByType`，不得 claim、ack、fail、reap 或改写 source `event_outbox`。
- Phase 26 Option A 的 per-subscriber delivery ledger 已被接受为设计决定，但尚未实现。
- 仓库当前不存在 `backend/src/notification`、migration `054/055`、Notification TypeScript types/validators/API client、路由、页面或外部渠道 Provider。
- 当前所有 source events 均为 `implicit-v0`：source envelope 与 producer payload 都没有已实现的 schema-version 字段。Support payload 中的 `version` 是工单聚合版本，不是 event schema major。
- Future Platform 可以在独立批准后，把一个“已批准的已知兼容形状”映射为 synthetic compatibility major `0`，用于 future subscription/materialization/delivery 控制面；synthetic `0` 不是 `event_outbox` 或 producer 当前已实现的字段，也不得回写 source row。

### 1.3 MVP 范围

Phase 27 MVP 候选仅包含：

- Customer 本人的同城 in-app inbox；
- Worker 本人的同城 in-app inbox；
- own list、mark read；unread count/archive 保留为 **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER**；
- 为上述投影所必需的未来 platform delivery 与 durable receipt。

### 1.4 非目标

- Admin inbox、OA inbox、Dashboard inbox 或跨组织收件箱；
- SMS、Push、WeChat、Email 或任何外部发送 Provider；
- 页面先行、假数据、mock 通知成功、假 realtime；
- 历史回填、默认 replay、全量扫描或订阅自动激活；
- `support.ticket.assigned`、`support.message.created` 或其他候选事件进入 MVP；
- 修改 source Outbox、Dispatch、Ledger、Order、Support、Auth 或 Provider runtime；
- 通过通知触发订单、派单、支付、退款、账本、结算、工单或会话状态变化。

## 2. Phase 27 内部施工顺序

```text
Phase 27 design acceptance
  -> future 054 platform delivery foundation authorization and verification
  -> future 055 Notification in-app projection authorization and verification
  -> API contract/runtime verification
  -> Customer/Worker page construction only after API and state evidence
  -> no external channel construction in Phase 27 MVP
```

### 2.1 Future `054` — platform delivery foundation（仅设计）

`054` 的候选职责是 subscriber registry、exact-version subscription、candidate materialization、retained-source anti-join reconciliation、per-subscriber delivery/attempt、lease/reaper/DLQ、manual action 与 bounded replay audit。

- materializer 只读 retained source events，不 claim/ack source row；
- `(created_at,event_id)` cursor 仅是低延迟扫描优化，不是完整性证明；
- long transaction / commit skew 必须由 retained-source anti-join reconciliation 修复；
- 每个订阅者的 canonical delivery 唯一键为 `(subscriber_id,event_id)`；
- source、Dispatch、Ledger 与 Enterprise Webhook 的现有语义保持不变。

### 2.2 Future `055` — Notification in-app projection（仅设计）

`055` 的候选职责是 template/revision、preference、notification record、durable inbox receipt、read/archive/hidden presentation state，以及仅作未来占位的 external channel intent/attempt。

`055` 不得先于 `054` 的隔离性、重复投递、lease、reaper、DLQ、reconciliation 和 protected-domain zero-write Gate。页面不得先于 054/055、契约、API 和真实数据状态完成。外部渠道不得在 Phase 27 MVP 中启用。

## 3. Writer / reader 边界

| 数据或行为 | Canonical writer | Notification 可做 | Notification 禁止做 |
| --- | --- | --- | --- |
| Order、quote、address、contact、amount、lifecycle | Order | 读取已批准的最小事件字段和受守卫 source reference | 直接读写 Order 表、复制地址/电话/姓名/金额、改变订单状态 |
| Support ticket、routing、SLA、conversation、message | Support | 读取已批准的 metadata-only resolved 事件；按 requester 解析收件人 | 写工单/分派/SLA/正文/聊天；复制 resolution note 或 message text |
| Source `event_outbox` | Producer + Events / 现有 typed consumer | future materializer 只读 eligible retained rows | Notification 直接 claim/ack/fail/reap/update source row |
| Platform subscriber/delivery/attempt/replay | Platform delivery | 通过 platform delivery API claim 与 ack 自己的 delivery | 直接改表、改其他 subscriber、把 source `published` 当完成证明 |
| Auth identity / role / admin city scope | Auth + RequestContext + city guards | 用已验证 `userId/role/appType/cityCode` 执行 self/city guard | 自建身份、信任客户端 recipient ID、把 `__global__` 写成业务 city |
| Template / immutable revision | Notification | 创建受审查模板与不可变 revision；读取 active revision | 任意 payload 插值、修改已发布 revision、承载脚本/任意 HTML |
| Preference | Notification | 保存本人偏好或已批准的 policy default | 自行决定 mandatory 类别或默认 opt-in/out |
| Notification record / receipt / read state | Notification | 原子写入最小投影与 durable receipt；本人 list/mark-read；archive 仅在人类冻结语义后才可进入候选 runtime | 作为 source truth、跨用户/跨城读取、伪造已读、在决策前实现 archive/unread |
| External channel result | Future channel adapter | 仅保存真实 Provider envelope | 无 Provider 时写 `delivered` 或生成假 attempt/success |

### 3.1 三端边界

| Surface | Phase 27 MVP 候选能力 | 明确边界 |
| --- | --- | --- |
| Customer | own same-city list、mark read；unread count/archive 暂停 | recipient 固定为认证 Customer；请求不得携带可切换 recipient ID；unread/archive 为 human blocker |
| Worker | own same-city list、mark read；unread count/archive 暂停 | recipient 固定为认证 Worker；请求不得携带可切换 recipient ID；unread/archive 为 human blocker |
| Admin | 仅 future city-scoped delivery diagnostics，需独立权限 | 无 Admin inbox；不得读取任意收件人的 rendered content；不得跨城 |
| OA / Dashboard | 无 | 无 identity、product、API 或 runtime 授权 |

## 4. 最小事件与收件人矩阵

以下两项只是候选初始事件，统一状态为 **CANDIDATE — HUMAN PENDING ACTIVATION**。二者不得因 design acceptance 而注册、激活、live-start、回填或 replay。

### 4.1 版本真相与 synthetic compatibility major `0`

- Current source truth 统一标记为 `implicit-v0 / source schema version absent`。
- Future Platform subscription key 中的 `event_major_version=0` 只能表示：人工批准的 handler revision 对下述完整兼容形状执行了 strict validation，并将该已知形状映射到 synthetic compatibility major `0`。
- Synthetic `0` 只存在于 future Platform control-plane/delivery metadata；它不是 source payload 字段，不是 producer contract 已实现字段，不得被 materializer 写回 `event_outbox`。
- 未知形状、字段漂移或无法证明与已批准形状完全一致时，不得映射为 `0`，必须 fail closed。

| Event | Current source version truth | Future compatibility mapping | Recipient | PII ceiling | 人工批准状态 |
| --- | --- | --- | --- | --- | --- |
| `order.created` | `implicit-v0 / source schema version absent` | 已接受设计中的完整形状；activation 前仍需 synthetic `0` allowlist 决定 | 同城 Customer | P1；只保留解析后的 recipient 与允许的 render params | **CANDIDATE — HUMAN PENDING ACTIVATION** |
| `support.ticket.resolved` | `implicit-v0 / source schema version absent` | 已接受设计中的完整形状；activation 前仍需 synthetic `0` allowlist 决定 | 同城 Customer 或 Worker requester | P1；只保留解析后的 recipient 与允许的 render params | **CANDIDATE — HUMAN PENDING ACTIVATION** |

### 4.2 字段处置分类

每个 current compatibility field 必须且只能落入一个类别：

- **A — 仅收件人解析**：可用于 city/role/self recipient resolution；raw field 不复制为 render parameter。解析后的 canonical recipient identity 可以写入 Notification-owned recipient columns。
- **B — 可持久化 render parameter**：通过 strict validation 后，可按下表名称写入 canonical render parameter；不得额外 enrichment。
- **C — 必须丢弃**：为验证完整 current shape 可以读取，但不得进入 Notification record、durable receipt parameters、render body、日志、错误、DLQ 或审计 payload。Platform delivery 仅可保留整体 source payload hash，不等于复制该字段。

### 4.3 `order.created` 完整当前兼容形状

Current shape 恰好包含以下六个 required fields；source schema version absent。

| Current field | Current type/constraint | Category | Notification rule |
| --- | --- | --- | --- |
| `orderId` | string length 1–64 | **B** | 持久化为 `order_id`；用于固定模板和受守卫 source link |
| `cityCode` | lowercase `[a-z0-9_-]` string length 2–64，且不得为 `__global__` | **A** | 必须等于 envelope/subscription city；raw field 不进入 render params |
| `customerId` | string length 1–64 | **A** | 解析同城 Customer recipient；raw field 不进入 render params |
| `skuId` | string length 1–128 | **C** | strict validation 后丢弃；不得持久化 SKU 或 enrichment SKU 名称 |
| `totalAmount` | finite non-negative number | **C** | strict validation 后丢弃；不得持久化金额/currency/price |
| `createdAt` | non-empty string；producer 当前输出 ISO time，但 shared validator 只保证 length >= 1 | **B** | future adapter 还必须验证 timezone-aware timestamp，否则 fail closed；通过后持久化为 `occurred_at`；不作为 source commit/order guarantee |

地址、姓名、电话等字段不在 current shape 中；若出现即属于 unknown/extra field 并 fail closed，禁止通过 Order enrichment 补取。

### 4.4 `support.ticket.resolved` 完整当前兼容形状

Current shape 恰好包含以下十个 required fields；`actorId` 的值可为 null，但字段本身必须存在；source schema version absent。

| Current field | Current type/constraint | Category | Notification rule |
| --- | --- | --- | --- |
| `ticketId` | trimmed string length 1–64 | **B** | 持久化为 `ticket_id` |
| `cityCode` | lowercase `[a-z0-9_-]` string length 2–64，且不得为 `__global__` | **A** | 必须等于 envelope/subscription city |
| `source` | current union includes customer/worker/enterprise/admin/system | **A** | Notification 只接受 `customer` 或 `worker`；其他 source 即使是 current shared union 的合法值也 fail closed |
| `type` | `order_question` / `order_dispute` / `service_complaint` / `withdrawal_issue` / `account_issue` / `safety` / `other` | **C** | strict validation 后丢弃 |
| `priority` | low/normal/high/urgent/critical | **C** | strict validation 后丢弃 |
| `status` | `open` / `processing` / `waiting_requester` / `escalated` / `resolved` / `closed` | **C** | 必须精确为 `resolved`，验证后丢弃 |
| `requesterId` | trimmed string length 1–64 | **A** | 与 source 共同解析同城、同角色 requester；raw field 不进入 render params |
| `actorId` | trimmed string length 1–64 or null | **C** | 丢弃；不得显示/持久化 agent identity |
| `version` | non-negative integer | **C** | 工单聚合版本，不是 schema major；验证后丢弃 |
| `occurredAt` | timezone-aware timestamp string | **B** | 持久化为 `occurred_at` |

Resolution note、subject、description、comment、聊天文本和证据引用均不在 Outbox current shape；出现即 unknown/extra 并 fail closed，禁止从 Support 表、conversation 或 message enrichment。

### 4.5 可执行 fail-closed 规则

Future compatibility adapter 必须按固定顺序执行：

1. envelope `event_type` 必须精确匹配候选事件，source schema-version field 必须 absent；若 source 将来出现显式 version，不得继续当 implicit-v0；
2. payload 必须是 non-null、non-array object；
3. required field set 必须与对应完整兼容形状完全相等；缺失任一 required field 为 `INVALID_EVENT_PAYLOAD`；
4. 任何 unknown/extra field，包括看似无害的 optional field，均为 `UNAPPROVED_COMPATIBILITY_SHAPE`；不得忽略后继续；
5. 每个字段按当前已知类型/枚举/格式 strict 校验，不做 coercion、default 或 best-effort parse；
6. envelope city、payload city、subscription city 必须相等；`support.ticket.resolved.status` 必须为 `resolved`，source 必须为 customer/worker；
7. 只有全部通过后才可映射 synthetic compatibility major `0`，执行 A/B/C 投影并计算首次 target fingerprint；
8. 任一失败均无 Notification target effect、无 success ack；只进入该 subscriber 的 sanitized bounded failure/DLQ 路径。

当前 `orderCreatedEventPayloadSchema` 未启用 strict object mode，可能在 parse 时剥离 extra keys；future compatibility adapter 必须在任何会剥离字段的 parse 之前检查 raw own-key set，或使用经独立批准的 strict adapter。Support current payload validator 已是 strict object，但 future adapter 仍必须执行上述独立 exact-key check，不能把 library default 当版本证明。

MVP 明确排除：

- `support.ticket.assigned`；
- `support.message.created`；
- 所有未列出的 event type/version/compatibility shape；
- wildcard event type、版本范围、未知 major version 或 best-effort payload parse。

## 5. PII 与内容上限

平台 delivery、durable receipt、Notification record、render parameters、日志、错误、DLQ 与审计均禁止携带或复制：

- 电话；
- 地址或精确位置；
- 姓名；
- 金额、currency、price/quote/payment/refund 明细；
- 工单 subject、description、resolution note、comment 或任何工单正文；
- 聊天文本、Bot transcript 或 KB 正文；
- 证据 URL、public/private storage URI、对象 key、证据 metadata 或字节；
- token、Authorization、OTP、credential、secret；
- Provider request/response body、provider trade number 或外部标识符；
- 任意 unrestricted source payload snapshot。

只允许 event-specific、approved compatibility-shape 的参数 allowlist。校验发生在 materialization、subscriber handler 和持久化三处；任一处发现 missing/unknown/extra field、超出 PII ceiling、payload hash 冲突或非法 recipient 时 fail closed，不产生通知 target effect。

## 6. Notification 数据所有权与状态机

### 6.1 Template 与 immutable revision

- Template 是策略/用途容器；revision 一旦发布即不可变。
- 候选状态：`draft -> reviewed -> active -> retired`。
- 每次发布产生一个全局唯一、永不复用的 `template_revision_id`、所属 template key、human revision label 与 content hash，不原地修改旧 revision。
- 每个 approved compatibility shape 只能引用人工批准的参数 schema 与 PII ceiling。
- template content、语言、fallback、mandatory/optional 分类仍由人类决定。

### 6.2 Preference

- 候选事实：policy default、recipient override、effective value、revision、actor/time。
- policy default 与 mandatory/optional 分类必须由人类批准，不能由模板或代码自行推断。
- preference 只影响 Notification-owned delivery/presentation，不改变 source business event。

### 6.3 Notification record 与 durable receipt

- Notification record 保存 real `city_code`、recipient type/ID、source event ID、全局不可变 `template_revision_id`、最小 render params/hash、首次 target fingerprint、visibility、row version 与时间戳。
- 业务唯一键选择为 `(city_code,recipient_type,recipient_id,source_event_id,template_revision_id)`；`template_revision_id` 永不指向另一个 template/revision。
- Subscriber durable receipt 唯一键为 `(subscriber_id,event_id)`，必须与 target notification effect 在同一事务提交。
- 首次 target 事务固定 `template_revision_id`、canonical render parameters、source payload hash 与 target fingerprint，并将其写入 receipt/notification canonical result。
- Target fingerprint 定义为对 canonical ordered encoding 的 SHA-256：`subscriber_id,source_event_id,event_type,synthetic_compatibility_major,city_code,recipient_type,recipient_id,source_payload_hash,template_revision_id,render_parameters`；这里 `source_event_id` 与 durable receipt key 中的 `event_id` 是同一标识。Canonical key order、UTF-8 encoding 与 null/number representation 必须由 future contract revision 冻结，不能使用当前 active template 参与重算。
- 重复 delivery、lease expiry 后重试或 ordinary replay 必须返回已存在的 canonical receipt/notification；不得查询当前 active template、不得重渲染历史事件、不得改变首次 fingerprint/revision。Candidate fingerprint 不一致时 fail closed 为 idempotency conflict/DLQ，不创建第二个 target。

### 6.4 Read / archive / hidden

presentation state 相互独立：

- `read`: 收件人已确认阅读；不等于 delivery；
- `archived`: 仅保留为候选 presentation concept；具体行为、恢复与 unread 关系未决定；
- `hidden`: 仅保留为候选隐私/策略 presentation concept；authority、reason、恢复和对 list/unread 的影响仍待人类决定；MVP 无通用 Admin hide API；
- Archive 是否影响 unread、unread 的集合定义、archive 后能否恢复及 hidden 与 unread 的关系已获准延期：**APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER**。
- 未决定前不得实现 unread count API、archive mutation/API、hidden mutation 或相应 UI；文档不得选择 archived/hidden 计入或不计入 unread。

Mark-read 的 future contract 使用 `row_version` CAS；archive 只有在人类冻结上述语义后才可采用同一 CAS 规则。授权、city 与 owner 检查先执行：

1. 若目标状态已成立，返回当前记录和 `already_applied=true`，不得再次递增版本；
2. 若目标状态未成立且 `expected_row_version` 不匹配，返回 stale-row-version conflict；
3. CAS 成功只递增一次 row version 并记录 actor/time/trace；
4. not owner 或 wrong city 不得因幂等语义变成成功。

### 6.5 External channel intent / attempt（未来设计，MVP 不启用）

候选 channel intent/attempt 与 platform event delivery 是两套不同事实：

- platform delivery `delivered` 仅表示 Notification subscriber 已原子提交 durable receipt 与 inbox target effect；
- 它不表示用户已读，不表示页面已显示，也不表示 SMS/Push/WeChat/Email 已送达；
- Phase 27 MVP 不创建可执行 external intent，不调用 Provider；
- 在 Provider 缺失时，渠道能力只能是 `absent`；若未来诊断需要持久化配置事实，只能写 `not_configured`，绝不能产生 `unavailable`、`queued`、`attempted` 或 `delivered` 状态。

## 7. City、role、self scope 与服务身份

- 所有 Notification business rows 使用真实 `city_code`；`__global__` 只可作为 admin permission metadata，不能成为 notification/subscription/delivery 的 business city。
- Customer 请求必须是 `appType=customer`、`role=customer`，recipient ID 固定为 token `sub/userId`。
- Worker 请求必须是 `appType=worker`、`role=worker`，recipient ID 固定为 token `sub/userId`。
- Customer/Worker 不得读取、计数或修改其他 recipient，也不得用 query/body 覆盖 recipient。
- Admin/operator future diagnostics 必须给出真实 requested city，并通过 `admin_city_scopes`；权限仅覆盖 delivery health、sanitized error 和 audit metadata，不自动覆盖 rendered content。
- Auditor 只读、同城、显式权限；不能 retry、publish template、改 preference 或改 presentation state。
- Platform materializer 与 Notification subscriber 使用注册的非人类 service identity / `subscriber_id`；它们不继承 Admin 权限，也不能使用终端用户 token 代行处理。
- manual retry 是 future platform operation，要求 operator 权限、同城 scope、reason/change reference 与 expected row version；它不是 Notification recipient API。

## 8. Retention、legal hold、tombstone 与 redaction

以下全部延期给人类决定：

- source、delivery、attempt、receipt、notification、read/archive、template、preference 与 audit 的确切保留期；
- legal hold owner、范围、解除流程；
- 用户删除/隐藏对 rendered body、render params、recipient reference 的 redaction 规则；
- minimum-data tombstone 字段、hash 与 reconciliation 证明形式；
- unresolved DLQ 的处置；
- 是否以及何时允许 physical deletion。

这些不是非阻断 TODO。未批准前：

- 不得激活任何 Notification subscription；
- 不得开始 live-start、backfill 或 replay；
- 不得启用自动 purge；
- 不得声称 derived notification 可以超出 canonical source privacy lifecycle 保存。

删除/隐藏只改变 Notification-owned presentation；不得删除或改写 Order/Support 的 canonical/audit facts。依赖清理遵循 attempt -> terminal delivery -> source -> independent audit，FK 使用 `RESTRICT/NO ACTION`，审计不得 cascade delete。

## 9. 已批准延期的人类决策台账 — 全部保持 API/runtime entry blocker

| Human-only decision | Required owners/evidence | Status |
| --- | --- | --- |
| 初始 city/subscriber/event/synthetic-major allowlist | Producer、Privacy、Notification；明确每个 real city、subscriber、event、approved shape -> synthetic `0` mapping 与 PII ceiling | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Live-start、backfill、replay | event/time boundary、row cap、dry-run count/hash、approval、cancel、live/replay quota | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Template、语言、fallback、mandatory/optional 分类 | title/body、locale set、fallback、immutable revision publication、mandatory/optional owner | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Preference 默认值、archive/unread、hidden/delete | no-row default、override、unread set、archive effect/recovery、hidden/delete authority/reason | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Retention/legal hold/redaction/tombstone/DLQ/physical deletion | exact durations、hold owner、field redaction、minimum tombstone、DLQ disposition、deletion order | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Admin diagnostics/manual retry/template/auditor 权限及四眼复核 | permission split、city scope、content ceiling、maker-checker actors、approval/audit evidence | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| 外部渠道策略 | Phase 27 持续 `absent`；任何未来 SMS/Push/WeChat/Email 必须独立 Phase、Provider/secret/retention/rollback 决策与人类批准 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |

批准延期不等于批准默认值或实施。任一对应决定未完成前，不得实现相关 API/runtime/UI，不得创建或激活订阅，也不得启动 live-start、backfill 或 replay。

## 10. Phase 14 持续生产阻断

- `docs/CURRENT_STATE.md` 的真实状态仍是 Phase 14 `IN PROGRESS`、readiness `64/100`、`NOT READY for staging`；历史 readiness 报告结论是 production/staging **NO-GO**。
- Phase 27 design acceptance、future runtime entry、甚至 future Phase 27 Lock 都不得被解释为生产就绪豁免。
- Production enablement 继续独立阻断，直到责任人批准并验证真实 Provider 前置条件、backup/restore、monitoring/alerting、secrets/key management、deployment、rollback、production approval gaps 以及其他外部整改。
- 本设计窗口没有验证或修复上述事项，也不得把 local/mock 能力当成生产 Provider 证据。

## 11. Phase 27 Gates — design acceptance closeout

| Gate | 必需证据 | 当前状态 |
| --- | --- | --- |
| P27-D0 — 设计审查 | Architecture、Markdown contract、report 完整且 N2/O2/P2 focused review 通过 | **PASS** |
| P27-D1 — 人类设计接受 | 人类于 `2026-07-13` 接受本设计；七类决策仅批准延期 | **PASS — DESIGN ONLY** |
| P27-E0 — Runtime 入口 | 明确 Phase 27 runtime entry approval、分支/base、写入 allowlist、迁移编号确认 | **NOT AUTHORIZED** |
| P27-G1 — Deferred decisions / activation | allowlist、live-start/replay、product/privacy/operations decisions 全部完成 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| P27-G2 — Future 054 implementation verification | additive schema、composite city FKs、materializer、commit-skew reconciliation、lease/reaper/DLQ/manual retry/replay | **NOT STARTED — MIGRATION 054 NOT AUTHORIZED** |
| P27-G3 — Future 055 implementation verification | global immutable `template_revision_id`、frozen fingerprint、preference、record、receipt、CAS、retention | **NOT STARTED — MIGRATION 055 NOT AUTHORIZED** |
| P27-G4 — Contract/API/runtime verification | Customer/Worker city/role/self scope、strict-shape/PII fail-closed、Provider truthfulness、protected-domain zero-write | **NOT STARTED — CONTRACT/API IMPLEMENTATION NOT AUTHORIZED** |
| P27-G5 — UI/browser verification | API 后置的 Customer/Worker inbox；Admin 仅 approved diagnostics/denial；真实三端浏览器证据 | **NOT STARTED — UI IMPLEMENTATION NOT AUTHORIZED** |
| P27-G6 — Exit/Lock | migration replay、回滚、全量 regression、浏览器证据、独立人类验收、merge/tag | **NOT ENTERED** |
| P27-PROD — Production readiness | Phase 14 64/100 NO-GO closed；Provider、backup/restore、monitoring/alerting、secrets、deployment、rollback、production approval gaps 与外部整改通过 | **BLOCKED BY PHASE 14 — DESIGN ACCEPTANCE DOES NOT WAIVE** |

跨 Gate 事实：subscription activation、live-start、backfill/replay 均 **NOT AUTHORIZED**；external Provider 为 **ABSENT / NOT AUTHORIZED**。G2–G5 implementation verification 均为 **NOT STARTED**。

## 12. 明确禁止项

- 直接 claim/ack source Outbox，或修改其 status/lease/attempt/payload；
- 先建页面、先造 mock 通知、先开 realtime 或先接外部渠道；
- 注册/激活订阅、live-start、历史 backfill、ordinary replay 或 projection rebuild；
- `support.ticket.assigned`、`support.message.created` 进入 MVP；
- Admin/OA inbox 或跨用户/cross-city read；
- SMS、Push、WeChat、Email 配置、调用或假成功；
- 写 Order、Payment、Pricing、Dispatch、Fulfillment、Worker、Support、Ledger、Settlement 或其他 protected domain；
- 在 runtime 授权前创建 migration `054/055`、TypeScript、validator、API client、route、page 或 test。
- 在 archive/unread 人工决策前实现 unread count API、archive API/behavior 或对应 UI。
- 把 synthetic compatibility major `0` 写入或描述成现有 `event_outbox`/producer 字段。
- 用当前 active template 重渲染 retry、lease-expiry 或 ordinary replay 的历史事件。

## 13. 设计审查重开规则

以下任一变化都会重新开启 D0/D1 设计审查；既有 `PASS` 不自动覆盖变化后的设计：

- source compatibility shape；
- Phase 26 Option A delivery ADR；
- candidate event 或 allowlist；
- PII classification；
- template/idempotency contract；
- retention/deletion；
- runtime Gate 或 migration ledger。

重开后必须重新获得对应 owner 审查与明确人类接受；在新接受前继续维持 API/runtime entry blocker。

## 14. 设计结论

Phase 27 Notification 已于 `2026-07-13` **ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**。正确起点仍不是 Notification 页面或 source Outbox 新消费者，而是未来单独授权的 additive per-subscriber delivery foundation。只有 `054` 隔离性与完整性成立后，`055` 才能安全投影 Customer/Worker in-app inbox。本文没有批准初始 allowlist、迁移、订阅、API、页面、Provider 或 Lock；当前 Outbox、Order、Support、Customer/Worker App 均未改变。
