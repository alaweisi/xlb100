# XLB Notification Contract（Accepted Design Only）

> **ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**
>
> 人类接受日期：`2026-07-13`。N2/O2/P2 聚焦复审：`PASS`。本文件是已接受的 Markdown 级设计契约，不是 TypeScript、validator、API、migration、subscription 或 runtime 授权。

## 0. 接受记录

| Item | Accepted truth |
| --- | --- |
| Human acceptance | `2026-07-13`；**PASS — DESIGN ONLY** |
| N2/O2/P2 focused review | **PASS** |
| Phase 27 implementation / Lock | **NOT STARTED / NOT ENTERED** |
| Runtime authority | **NOT AUTHORIZED**：migration `054/055`、TypeScript contract、API、UI、subscription、backfill/replay、Provider |
| Runtime impact | 当前 source Outbox、Order、Support、Customer App 与 Worker App 均未改变 |

已接受的契约基线是：Customer/Worker 同城本人 in-app inbox；`054 -> 055 -> API/runtime verification -> Customer/Worker pages`；Notification 不直接 claim/ack source Outbox；source 维持 `implicit-v0`，synthetic compatibility major `0` 仅属 future Platform metadata；durable `(subscriber_id,event_id)` receipt、全局不可变 `template_revision_id`、首次 canonical target/fingerprint、strict raw-shape fail-closed，以及 delivered/read/archive/external-delivery 四类事实相互独立。

## 1. 契约范围与不变量

本契约仅描述未来 Phase 27 的 platform delivery 与 Customer/Worker in-app Notification MVP。

硬不变量：

1. `event_outbox` 仍是单消费者 source work-claim queue；Notification 不直接 claim/ack source row。
2. Platform delivery、Notification target effect 与用户 read state 是三种不同事实。
3. Delivery guarantee 是 at-least-once；subscriber 必须 durable deduplicate。
4. 所有 executable subscriptions、deliveries、receipts 和 Notification business rows 都是 real-city scoped。
5. Customer/Worker API 只允许 own scope；不存在 recipient-switch、cross-user 或 cross-city read。
6. Phase 27 MVP 无 Admin/OA inbox、无历史回填、无外部发送 API、无真实 Provider。

## 2. Future Platform subscription / delivery / inbox receipt 关系

```text
producer transaction
  -> source event_outbox row
  -> read-only candidate scan + retained-source reconciliation
  -> one canonical platform delivery per subscriber/event
  -> Notification subscriber claim
  -> atomic {notification target effect + durable inbox receipt}
  -> platform delivery acknowledgement
```

### 2.1 Subscription allowlist

Executable allowlist 的精确键为：

`(city_code, subscriber_id, event_type, event_major_version)`

- 一行只允许一个 exact major version；版本范围、wildcard type/city 与 implicit latest 均禁止。
- 所有当前 source event 统一是 `implicit-v0 / source schema version absent`；`event_outbox` 与 producer 当前都没有 schema-major 字段。
- Future Platform 仅可把人工批准的、strictly validated 已知兼容形状映射为 synthetic compatibility major `0`。该 `0` 只属于 future subscription/materialization/delivery metadata，不是 source 已实现字段，不得写回 source。
- 新 major version 创建新的 paused row；不得扩大已有 row。
- 未知、paused、revoked 或超出 PII ceiling 的事件 fail closed。
- 本契约中的两个候选 row 均为 **CANDIDATE — HUMAN PENDING ACTIVATION**，不得注册或激活。

### 2.2 Platform delivery

- Canonical unique key：`(subscriber_id, event_id)`。
- Delivery 包含 real city、subscription、source event reference、synthetic compatibility major、payload hash、aggregate metadata、status、lease、attempt、error class、row version 与时间戳。
- Notification 只通过 platform delivery contract claim/renew/ack/fail 自己的 row；不直接写 platform table。
- `delivered` 只表示 subscriber target effect 与 durable receipt 已提交，不表示用户 read 或 external channel delivered。

### 2.3 Durable receipt

Durable receipt 的精确唯一键为：

`(subscriber_id, event_id)`

- receipt 必须与 Notification target insert/no-op 在同一数据库事务提交；
- 首次事务必须固定 `template_revision_id`、canonical render parameters、source payload hash 与 target fingerprint，并把 canonical notification reference/result 写入 receipt；
- `target_fingerprint` 是下列字段 canonical ordered encoding 的 SHA-256：`subscriber_id,source_event_id,event_type,synthetic_compatibility_major,city_code,recipient_type,recipient_id,source_payload_hash,template_revision_id,render_parameters`。这里 `source_event_id` 与 receipt key 中的 `event_id` 是同一标识。Future contract revision 必须冻结 UTF-8、key order、number/null/string representation；active template pointer 不是 fingerprint 输入。
- lease 在 target commit 后、delivery ack 前过期时，重试读取 receipt 并返回 canonical receipt/notification；
- process memory、Redis-only lock、timestamp cache 或 source `published` 不能作为 receipt；
- ordinary replay 不创建第二个 receipt 或第二个 canonical notification effect，不读取当前 active template 重渲染历史事件；candidate fingerprint 与首次 fingerprint 不一致时 fail closed。

### 2.4 Notification 业务唯一键

Notification record 的精确业务唯一键为：

`(city_code, recipient_type, recipient_id, source_event_id, template_revision_id)`

本设计选择全局唯一且不可变的 `template_revision_id`；ID 永不复用、永不重新指向另一 template/revision。该键防止同一收件人、source event 与 frozen revision 被重复投影。`recipient_type` 在 MVP 只能是 `customer` 或 `worker`。

## 3. 候选事件契约

`order.created` 与 `support.ticket.resolved` 的统一状态为 **CANDIDATE — HUMAN PENDING ACTIVATION**。Design acceptance 不批准 live-start、历史 backfill/replay 或任何 city/subscriber allowlist row 的注册/激活；`support.ticket.assigned` 与 `support.message.created` 继续不在 MVP。

| Event | Current source truth | Future mapping | Recipient resolution | 允许的 Notification 参数 | PII / 状态 |
| --- | --- | --- | --- | --- | --- |
| `order.created` | `implicit-v0 / source schema version absent` | accepted exact-shape design；activation 前仍需 synthetic `0` allowlist 决定 | event/payload/subscription city 一致；payload customerId -> same-city Customer | `order_id`, `occurred_at` | P1 ceiling；SKU/amount 等丢弃；**CANDIDATE — HUMAN PENDING ACTIVATION** |
| `support.ticket.resolved` | `implicit-v0 / source schema version absent` | accepted exact-shape design；activation 前仍需 synthetic `0` allowlist 决定 | event/payload/subscription city 一致；source 为 customer 或 worker，结合 requesterId 解析 same-city same-role requester | `ticket_id`, `occurred_at` | P1 ceiling；其他 source 或正文 enrichment fail closed；**CANDIDATE — HUMAN PENDING ACTIVATION** |

### 3.1 字段处置类别

- **A — 仅收件人解析**：raw field 不进入 render params；只保存解析后的 canonical recipient columns。
- **B — 可持久化 render parameter**：strict validation 后按固定参数名保存。
- **C — 必须丢弃**：验证 current shape 后立即丢弃，不进入 Notification/receipt params、render、日志、error、DLQ 或 audit payload。

### 3.2 `order.created` 完整 current compatibility shape

Source schema version absent；payload required field set 必须恰好为以下六项。

| Field | Current constraint | Category | Projection |
| --- | --- | --- | --- |
| `orderId` | string length 1–64 | **B** | `order_id` |
| `cityCode` | lowercase `[a-z0-9_-]` string length 2–64，且不得为 `__global__` | **A** | scope/recipient resolution only |
| `customerId` | string length 1–64 | **A** | same-city Customer resolution only |
| `skuId` | string length 1–128 | **C** | discard；不得持久化 SKU/名称 |
| `totalAmount` | finite non-negative number | **C** | discard；不得持久化金额/currency/price |
| `createdAt` | non-empty string；producer emits ISO time，shared validator only checks length >= 1 | **B** | future adapter additionally requires timezone-aware timestamp；then `occurred_at` |

Address/contact/name fields 不在 current shape；若出现为 extra/unknown 并 fail closed。禁止 Order enrichment。

### 3.3 `support.ticket.resolved` 完整 current compatibility shape

Source schema version absent；payload required field set 必须恰好为以下十项。`actorId` 可为 null，但 key 必须存在。

| Field | Current constraint | Category | Projection |
| --- | --- | --- | --- |
| `ticketId` | trimmed string length 1–64 | **B** | `ticket_id` |
| `cityCode` | lowercase `[a-z0-9_-]` string length 2–64，且不得为 `__global__` | **A** | scope/recipient resolution only |
| `source` | customer/worker/enterprise/admin/system | **A** | 只接受 customer/worker；其他值 fail closed |
| `type` | order_question/order_dispute/service_complaint/withdrawal_issue/account_issue/safety/other | **C** | discard |
| `priority` | low/normal/high/urgent/critical | **C** | discard |
| `status` | open/processing/waiting_requester/escalated/resolved/closed | **C** | 必须为 `resolved`，随后 discard |
| `requesterId` | trimmed string length 1–64 | **A** | 与 source 共同解析同城同角色 requester |
| `actorId` | trimmed string length 1–64 or null | **C** | discard |
| `version` | non-negative integer | **C** | ticket aggregate version，非 schema major；discard |
| `occurredAt` | timezone-aware timestamp | **B** | `occurred_at` |

Resolution note、subject、description、comment、聊天文本或证据引用不在 current shape；出现为 extra/unknown 并 fail closed。禁止 Support/conversation/message enrichment。

### 3.4 Executable strict-shape rules

1. Envelope event type 必须精确匹配，source schema-version field 必须 absent；未来出现显式 version 时不得继续映射 implicit-v0。
2. Payload 必须是 non-null、non-array object。
3. Required key set 必须与相应表完全相等；missing field -> `INVALID_EVENT_PAYLOAD`。
4. 任意 unknown/extra key，不论是否敏感 -> `UNAPPROVED_COMPATIBILITY_SHAPE`；不得忽略。
5. 类型、枚举、格式 strict validation；不 coercion、不 default、不 best-effort parse。
6. Envelope/payload/subscription city 必须相等；resolved status/source 必须满足上表。
7. 全部通过后才映射 synthetic `0`、执行 A/B/C 投影并固定 fingerprint。
8. 失败时无 target effect、无 success ack，只产生 sanitized bounded subscriber failure/DLQ。

当前 `orderCreatedEventPayloadSchema` 不是 strict object schema，parse 可能剥离 extra keys；因此 future adapter 必须在任何 stripping parse 前校验 raw own-key set，或使用独立批准的 strict adapter。Support current payload schema 已 strict，但仍须执行同一独立 exact-key rule，不能把 validator library default 当 compatibility-version 证明。

`support.ticket.assigned` 与 `support.message.created` 明确不在 MVP allowlist。任何未列出的 type/version 都返回 contract failure，并进入该 subscriber 的 bounded failure/DLQ 路径；不得 default parse 或 ack success。

## 4. 候选 API 契约

下列 path 仅为 future candidate。正式 path、response schema 与 TypeScript 必须在 runtime entry 后按 `packages/types -> packages/validators -> backend -> packages/api-client -> apps` 顺序实施。

### 4.1 Customer own inbox

| Operation | Candidate endpoint | Scope | Request | Success result |
| --- | --- | --- | --- | --- |
| Own list | `GET /api/customer/notifications` | authenticated customer + real current city + own recipient | optional `cursor`, bounded `limit`；archive filter 未决不得实现 | items、next cursor；每项只使用 frozen `template_revision_id`/render params；archive fields 待决 |
| Unread count | `GET /api/customer/notifications/unread-count` | 同上 | 无 recipient ID | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER；不得实现** |
| Mark read | `POST /api/customer/notifications/{notification_id}/read` | 同上 | `expected_row_version`, `idempotency_key` | current record、`already_applied`、new/current row version |
| Archive | `POST /api/customer/notifications/{notification_id}/archive` | 同上 | 语义未冻结 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER；不得实现** |

### 4.2 Worker own inbox

| Operation | Candidate endpoint | Scope | Request | Success result |
| --- | --- | --- | --- | --- |
| Own list | `GET /api/worker/notifications` | authenticated worker + real current city + own recipient | optional `cursor`, bounded `limit`；archive filter 未决不得实现 | 与 Customer item shape 等价，recipient 固定为当前 Worker |
| Unread count | `GET /api/worker/notifications/unread-count` | 同上 | 无 recipient ID | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER；不得实现** |
| Mark read | `POST /api/worker/notifications/{notification_id}/read` | 同上 | `expected_row_version`, `idempotency_key` | current record、`already_applied`、new/current row version |
| Archive | `POST /api/worker/notifications/{notification_id}/archive` | 同上 | 语义未冻结 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER；不得实现** |

### 4.3 API hard boundaries

- API 从 verified token / RequestContext 获取 `recipient_type` 与 `recipient_id`；不得信任 body/query/header 中的 recipient override。
- 必须携带并校验 `x-xlb-city-code`；`__global__` 不是有效 inbox city。
- Customer 不能调用 Worker path，Worker 不能调用 Customer path。
- list/count/mutation 均先验证 city、role 与 owner，再处理幂等。
- 无跨用户 list/filter/detail；无通过 notification ID 枚举其他用户记录。
- 无 Admin/OA inbox API；future Admin diagnostics 与 recipient content API 必须分离，且不由本文授权。
- 无 send、broadcast、campaign、test-send、SMS、Push、WeChat、Email 或 Provider API。

## 5. 最小状态模型

### 5.1 Platform delivery state

`pending -> processing -> delivered`

失败分支：`processing -> retry_wait -> processing`；超过上限进入 `dead_letter`。Paused subscription 不产生新 claim。Manual retry 需要 future city-scoped operator authority、expected row version 与 append-only action audit。

### 5.2 Notification presentation state

- `visible`: 可以进入本人列表；
- `read=false|true`: recipient-scoped read fact；
- `archived=false|true`: 仅为候选 presentation fact；行为、恢复与 unread 关系待人类决定；
- `hidden=false|true`: 仅为候选 privacy/policy fact；authority、reason、恢复和 list/unread 影响待人类决定；MVP 无通用 Admin mutation；
- 物理删除不是 presentation state，且在 retention 决策前禁止。
- Archive 是否影响 unread、unread set、archive recovery 与 hidden/unread/list 关系已获准延期：**APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER**。具体决定完成前不得实现 unread count API、archive behavior/API、hidden/delete mutation 或对应 UI。

### 5.3 External channel truth state

Phase 27 MVP external channel capability 为 `absent`。若 future diagnostics 需要持久化配置事实，只允许 `not_configured`。没有真实 Provider envelope 时不得出现 `unavailable`、`queued`、`attempted`、`sent` 或 `delivered`。

## 6. CAS 与幂等语义

Mark-read 的判定顺序如下；archive 只有在人类冻结其语义后才可复用该 CAS 模型：

1. 校验 authentication、app role、real city 与 row owner；
2. 记录不存在时 `NOT_FOUND`；存在但不属于 requester 或 city 不同时，public response 不泄露存在性；
3. 若目标状态已经成立，返回 success + `already_applied=true`，不递增 `row_version`；
4. 否则要求 `expected_row_version == current row_version`；不匹配返回 `STALE_ROW_VERSION`；
5. CAS 成功后仅变更当前 recipient state、递增一次 row version，并保存 actor/time/trace；
6. 相同 idempotency key 与相同 fingerprint 返回 canonical result；相同 key 不同 fingerprint 返回 conflict。

## 7. 错误模型

| Canonical condition | Public behavior | 说明 |
| --- | --- | --- |
| `NOT_FOUND` | 404 | 本人同城 scope 内无该记录 |
| `NOT_OWNER` | 404（internal audit reason 保留） | 对 Customer/Worker 折叠为 not found，防止 existence oracle；零读取/零写入 |
| `WRONG_CITY` | 404（internal audit reason 保留） | record operation 对外折叠为 not found，防止跨城 existence oracle；零读取/零写入 |
| `STALE_ROW_VERSION` | 409 | 目标状态尚未成立且 expected version 过期；返回 bounded current version，不返回敏感内容 |
| `ALREADY_APPLIED` | 200 | 成功语义，不是 error；返回 `already_applied=true` 且不重复写 |
| `UNSUPPORTED_EVENT_VERSION` | subscriber contract failure / DLQ | 无 target effect，无 ack success |
| `INVALID_EVENT_PAYLOAD` / `PII_CEILING_EXCEEDED` | subscriber contract failure / DLQ | fail closed；error sanitized，不复制 payload |
| `PROVIDER_NOT_CONFIGURED` | 无发送；diagnostic only | 不得转成 delivered |

缺失或语法非法的 `x-xlb-city-code` 仍由 RequestContext 在查找记录前返回 route-level 400；`WRONG_CITY` 只指格式有效但与目标记录不一致的真实 city。

## 8. Version、PII 与 fail-closed

- Current source 只有 `implicit-v0 / source schema version absent`。Future synthetic compatibility major `0` 只代表人工批准的 exact known shape，不能被解释为 source 字段或“latest”。
- 新 major 需要新的 paused allowlist row、producer/validator/handler/PII/replay review。
- known type + unknown shape/major、required field missing、任意 unknown/extra field、payload hash conflict 或 illegal recipient 均不得调用 handler target effect。
- Template parameter schema 是 strict allowlist；任意附加字段拒绝。
- 禁止电话、地址、姓名、金额、工单正文、聊天文本、证据 URL/字节、token、Provider body，以及 unrestricted JSON snapshot。
- 错误、attempt 与 DLQ 只保存 bounded sanitized classification，不保存原 payload 或 rendered sensitive body。

## 9. Future `054/055` migration design ledger — no SQL

下表仅记录字段、索引、FK、replay、回滚与兼容读取要求。它不批准名称、编号或 SQL。

### 9.1 Future `054` — Platform delivery

| Candidate table/group | Required fields | Keys / indexes / composite city FK | Migration replay / rollback / compatible read |
| --- | --- | --- | --- |
| Subscribers | subscriber ID、stable name、owner/contact、handler revision、purpose、max PII、policy bounds、status、actor/time、row version | PK；owner+stable-name unique；status/policy checks | empty create；初始 proposed/paused；rollback pause 并保留 audit |
| Subscriptions | subscription ID、subscriber、real city、event type、synthetic/explicit exact major、approved compatibility handler revision、live start、retention class、status、actor/time、row version | unique `(city_code,subscriber_id,event_type,event_major_version)`；subscriber/city FK；active lookup；禁止 range | implicit-v0 mapping `0` 需人类批准；不回填 source version；source/current consumers 保持原读路径 |
| Materialization checkpoints | city、subscription、candidate cursor、last reconciliation range/count/hash/result、row version | city+subscription unique；composite FK；cursor/reconciliation index | cursor 非权威；partial/double replay 确定；rollback freeze scan，不宣告 complete |
| Deliveries | delivery ID、city、subscriber/subscription、source event、exact major/hash、aggregate metadata、status/lease/attempt/error、row version/times | unique `(subscriber_id,event_id)`；source `(city_code,event_id)` composite FK；exact-version subscription FK；claim/reaper/DLQ/anti-join indexes；`RESTRICT/NO ACTION` | candidate + repeated retained anti-join；不更新 source；ordinary replay 复用 canonical row |
| Attempts | attempt ID、city、delivery、attempt number、claimant/token ref、outcome、sanitized error、trace/times | city+delivery+attempt unique；composite delivery FK；`RESTRICT/NO ACTION` | 无 payload copy；hold/retention 后先于 delivery 清理 |
| Replay/actions | generation/action ID、city、subscriber/event/version bounded filters、dry-run hash/count、approval、actor/reason、expected/actual version、status/times | city/subscriber/status indexes；append-only action；无 cascade delete | replay 不绕过 receipt；cancel 只停新 claim；audit 保留 |

### 9.2 Future `055` — Notification

| Candidate table/group | Required fields | Keys / indexes / composite city FK | Migration replay / rollback / compatible read |
| --- | --- | --- | --- |
| Templates | template key/scope、active pointer、owner/policy、channel=`in_app` | key+scope unique；一 active pointer | 只载入人工批准模板；rollback pointer |
| Immutable revisions | global `template_revision_id`、template key、human revision label、locale、strict parameter schema、PII ceiling、content/hash、review/publish/retire actors/times | revision ID globally unique/immutable；template+label unique；ID 永不复用 | 无历史重渲染；旧 revision 保持可读 |
| Preferences | city、recipient type/ID、class、policy default/override/effective、row version、actor/time | city+recipient+class unique；recipient city FK；CAS index | 不发明默认；rollback previous revision；audit retained |
| Notification records | notification ID、city、recipient、source event、global `template_revision_id`、canonical params/hash、first target fingerprint、visibility/read/archive/hidden、row version/times | unique `(city_code,recipient_type,recipient_id,source_event_id,template_revision_id)`；recipient list index；unread/archive indexes 等待人类语义；source/template city-safe refs | 空表起步；无 fake/bulk backfill；retry/replay 返回 canonical row，不按 active template 重渲染 |
| Durable receipts | subscriber、event、city、notification target、frozen template revision/fingerprint/source hash、applied time/result | unique `(subscriber_id,event_id)`；city-safe delivery/notification linkage | 与 target effect 原子提交；retry/lease expiry/replay 返回 canonical result；fingerprint mismatch fail closed |
| State actions/audit | notification、recipient、action、expected/actual version、actor/trace/time | append-only；recipient/time index；不得 cascade | CAS evidence 保留；rollback 不改 source |
| External intent/attempt | notification、channel、config ref、truth status、attempt/error/audit | notification+channel+intent revision unique；无 Provider 不得 delivered | MVP 不创建 executable rows；能力 `absent`，若需持久化只允许 `not_configured`；无 backfill |

### 9.3 Migration verification requirements

- empty、existing、partial-DDL 与 double-run replay 必须得到同一 accepted schema marker；
- migrations `000`–`053` 不变；
- cross-city parent/child fixture 必须被 composite FK 拒绝；
- long transaction/commit-skew 后 anti-join 能修复 missing delivery；
- rollback 先 pause materializer/subscriber，再恢复 previous read path；不删除 audit、不改 source status；
- historical backfill/replay 始终需要独立 human approval，本契约不提供默认操作。

## 10. Provider truthfulness

当前无 SMS、Push、WeChat 或 Email Provider。Phase 27 也不安装 Provider。任何实现、API、页面、日志或测试都不得用 mock/local 状态冒充外部送达；不得创建 test-send 或 broadcast escape hatch。External channel 策略只有在未来独立 Phase、真实配置、credential/secret ownership、Provider envelope、retry/retention 与 human approval 齐备后才能扩展。

## 11. Approved deferral ledger — API/runtime entry blockers

| Decision | Status |
| --- | --- |
| 初始 city/subscriber/event/synthetic-major allowlist | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Live-start、backfill、replay | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Template、语言、fallback、mandatory/optional 分类 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Preference 默认值、archive/unread、hidden/delete | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Retention/legal hold/redaction/tombstone/DLQ/physical deletion | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Admin diagnostics/manual retry/template/auditor 权限及四眼复核 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| 外部渠道策略 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER**；Phase 27 保持 `absent`，future independent Phase + human approval required |

批准延期不产生默认契约。任一对应决定未完成前，不得实现相关 API/runtime/UI，不得注册或激活 subscription，也不得执行 live-start、backfill 或 replay。

## 12. Production-readiness boundary

Phase 14 仍为 `64/100`、`IN PROGRESS`、staging/production `NO-GO`。Phase 27 design acceptance 不豁免真实 Provider、backup/restore、monitoring/alerting、secrets/key management、deployment、rollback、production approval gaps 或其他外部整改。上述生产 Gate 与本契约的 runtime entry Gate 相互独立，且都未通过。

## 13. 设计审查重开规则

以下任一变化都会重新开启设计审查，且既有 N2/O2/P2 `PASS` 与人类 design acceptance 不自动覆盖新形状：source compatibility shape、Phase 26 Option A delivery ADR、candidate event/allowlist、PII classification、template/idempotency contract、retention/deletion、runtime Gate 或 migration ledger。重开后必须重新获得对应 owner 复审与明确人类接受；在此之前继续阻断 API/runtime entry。

## 14. 契约状态

本契约状态为 **ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**；接受日期 `2026-07-13`，N2/O2/P2 `PASS`。七类决策只获得延期批准，未获得具体产品/隐私/运维值或 runtime 权限；unread count、archive、hidden/delete API/runtime/UI 尤其不得在语义冻结前实施。Phase27 尚未实施、未 Lock，当前 Outbox、Order、Support、Customer/Worker App 均未改变。
