# Phase 24E — Bot / 知识库详细设计

## 1. 状态、前置条件与边界

本文是 Phase 24E 的施工设计，不是已交付能力声明。Phase 24E 只有在 Phase 24D 完成、测试并 Lock，且完成聊天内容的数据最小化、保留期和隐私评审后才能写业务代码。

事实基线：Phase 24B 工单已 Lock；Phase 24C Phase 3 已验证但尚未 Lock；当前最大迁移为 `050`。因此 24E 的迁移候选是 **24D 实际最新迁移的下一号**（若 24D 只使用 `051`，则候选为 `052_phase24e_support_bot_knowledge_base.sql`）。施工时必须重新探测，禁止修改 `000–050`、禁止使用永久历史空号 `024`，也不创建 Phase 25。

本阶段只做：城市隔离知识库、不可变文章版本、发布审核、确定性/内存 mock NLU、知识检索、信息性 Bot 回复、敏感问题强制转人工，以及 Admin 知识库配置界面。

明确不做：外部大模型、Embedding/向量数据库、互联网检索、电话/微信渠道、自动退款/赔偿/改派/提现/封号等业务动作、CSAT/质检（24F）。Bot 不成为绕过 `RequestContext → CityCode → Contract → Guard` 的旁路。

## 2. 既有事实与模块位置

- `backend/src/providers/` 当前只有 local/mock 对象存储；其 envelope 均真实标记 `externalProviderExecuted=false`。仓库没有 NLU 客户端或真实外部 NLU 成功事实。
- 24E 新增 `backend/src/providers/nlu/`，业务编排进入 `backend/src/support/bot/`，知识库进入 `backend/src/support/knowledgeBase/`。
- 24D 的 `support_conversations`、参与者和消息必须是会话事实源。24E 只通过 24D 服务接口追加 Bot/system 消息和执行转人工，不直接复制或重定义会话状态机。
- 类型落地顺序固定为 `packages/types → packages/validators → backend → packages/api-client → apps/admin`。

## 3. 数据模型与迁移候选

所有表包含真实 `city_code`，拒绝 `__global__`，并以 `(city_code, id)` 建立唯一键供下游复合外键使用。时间为 `TIMESTAMP(3)`，正文不进入 Outbox。

### 3.1 `support_kb_articles`

| 字段 | 约束与含义 |
|---|---|
| `article_id` | 字符串 PK |
| `city_code` | 城市 FK，非全局 |
| `slug` | 同城稳定唯一标识，规范化小写 |
| `category_id` / `sku_id` | 可空；若绑定既有实体必须使用同城复合 FK |
| `language` | 规范化 BCP-47-like 标签 |
| `lifecycle_status` | `draft/published/archived`；与版本审核状态分开 |
| `current_draft_version_id` | 可空，同城 FK |
| `published_version_id` | 可空，同城 FK；读取端唯一发布指针 |
| `version` | CAS 版本 |
| 幂等字段 | `create_idempotency_key/fingerprint`、最近 mutation key/fingerprint |
| 审计字段 | `created_by_admin_id`、`created_at/updated_at` |

唯一键：`(city_code,slug,language)`。发布指针不得指向非 `approved` 版本。

### 3.2 `support_kb_article_versions`

不可变快照：`article_version_id`、`city_code`、`article_id`、单调 `revision`、`title`、`summary`、`body_markdown`、规范化 `keywords_json`、`intent_tags_json`、`review_status(draft/pending_review/approved/rejected)`、`created_by_admin_id`、`submitted_by_admin_id`、`reviewed_by_admin_id`、`review_note`、`created_at/submitted_at/reviewed_at`、`content_sha256`。

- UNIQUE `(city_code,article_id,revision)`；版本行禁止 UPDATE/DELETE。
- 修改内容只能创建新 revision；审核动作通过独立审计表记录后更新文章指针，不改旧版本正文。
- 发布必须引用 `approved` 版本；已发布版本永久可审计。撤回只清除/替换发布指针并归档文章，不销毁历史。
- `body_markdown` 禁止脚本、iframe、远程图片和任意 HTML；客户端渲染前仍须安全 Markdown 策略。

### 3.3 `support_kb_review_events`

append-only：`review_event_id`、`city_code`、`article_id`、`article_version_id`、`action(submitted/approved/rejected/published/archived)`、`actor_admin_id`、`note`、`idempotency_key`、`created_at`。UNIQUE `(city_code,article_version_id,idempotency_key)`。

### 3.4 `support_bot_runs`

保存可审计决策而非隐藏思维过程：`bot_run_id`、`city_code`、`conversation_id`、`trigger_message_id`、`provider`、`provider_status`、`external_provider_executed`、`provider_rule_version`、`intent`、`confidence_basis_points`、`sensitive_classification`、`decision(reply/hand_off/no_match)`、`reason_codes_json`、`matched_article_version_ids_json`、`response_message_id`、`idempotency_key`、`created_at`。

UNIQUE `(city_code,conversation_id,trigger_message_id)` 保证同一消息最多一次有效编排。匹配项必须固化 **version ID**，不能只存会漂移的 article ID。原始消息正文不复制到该表。

### 3.5 可选事件闭集扩展

仅当 24D 实际事件模型需要跨进程观察转人工，append-only 迁移扩展其命名 CHECK/ENUM，候选事实为 `support.bot.handed_off`，最小 payload 仅含 city、conversation、run、reason code 和时间。知识正文、用户输入、匹配关键词不得进入 Outbox，也不得自动加入企业 webhook allowlist。

## 4. 发布与审核模型

角色矩阵：

| 动作 | Admin | Operator | Auditor | Customer/Worker/Bot |
|---|---:|---:|---:|---:|
| 读取已发布文章 | 是 | 是 | 是 | 仅经 Bot/允许的公开读取 |
| 建文章/新版本 | 是 | 是 | 否 | 否 |
| 提交审核 | 是 | 是 | 否 | 否 |
| 审核、发布、归档 | 是 | 否 | 否 | 否 |
| 查看 Bot 审计运行 | 是 | 自身技能组会话范围 | 是（只读） | 仅自身会话的可见回复 |

Admin/Operator 都必须有显式真实城市 scope；Operator 的写操作可被限制到配置的技能组/类型范围。推荐启用四眼原则：审核者不能等于该 revision 的创建者；若首期确需单人小团队例外，必须以显式配置、审计原因和 gate 测试落地，默认仍拒绝自审。

发布事务同时：锁定文章、校验 CAS、校验 revision 为 approved、更新 `published_version_id/lifecycle_status/version`、追加 review event。相同 idempotency key + 同指纹返回原结果；相同 key + 不同指纹返回 409；陈旧 `expectedVersion` 返回 409 且不产生审计行。

## 5. NLU Provider 合约

```ts
interface SupportNluProvider {
  readonly kind: "deterministic" | "mock";
  classifyAndRetrieve(input: {
    cityCode: string;
    language: string | null;
    normalizedText: string;
    publishedCandidates: ReadonlyArray<PublishedKbCandidate>;
  }): Promise<SupportNluEnvelope>;
}

interface SupportNluEnvelope {
  provider: "deterministic" | "mock";
  providerName: "xlb-deterministic-nlu" | "xlb-memory-nlu-mock";
  providerStatus: "matched_local" | "no_match_local" | "forced_mock";
  externalProviderExecuted: false;
  intent: string | null;
  confidenceBasisPoints: number;
  matchedArticleVersionIds: string[];
  reasonCodes: string[];
  ruleVersion: string;
}
```

`externalProviderExecuted` 在类型和 Zod schema 中必须是 literal `false`。配置只允许 `deterministic|mock`，未知值启动失败；不得出现 OpenAI、Claude 或其他外部 Provider 名称/密钥。mock 只允许测试通过显式 fixture 强制结果，生产默认 deterministic。

确定性匹配顺序：敏感规则先行 → 城市 + 语言精确的 published revision → intent tag 精确匹配 → 规范化关键词交集与稳定评分 → 分数、revision 发布时间、article ID 的固定 tie-break。低于阈值、歧义同分或零匹配一律 `hand_off/no_match`，不能编造答案。回复只能取发布版本中的预审正文/摘要并携带版本引用，不做生成式改写。

## 6. 敏感类型与强制转人工

在任何知识检索和回复前运行 deterministic sensitive guard。至少包括：

- 工单类型 `withdrawal_issue`、`safety`、`account_issue`；
- 资金/支付/退款/提现/赔偿/银行卡，安全/威胁/人身伤害，账号盗用/验证码/密码/身份证等受控词组；
- 24D 会话已处于 escalated/transferred，或用户明确要求人工。

命中后必须：记录 `sensitive_classification` 与稳定 reason code；使用 24D 的 CAS/idempotent handoff 服务使会话进入排队/转人工；必要时依既有 Support API 创建/升级工单；追加最小安全提示。禁止 Bot 继续提供知识答案或触发任何受保护领域写操作。规则漏检测试必须覆盖同义词、大小写、空白/常见标点规避；不存储“推理过程”，只存命中的规则版本和 reason code。

## 7. Bot 编排与幂等

输入来自 24D 已持久化且完成身份/participant 校验的 requester text message。编排事务边界：

1. 以 `(city,conversation,trigger_message)` 查询既有 run，存在则返回原结果。
2. 锁定/校验会话状态和版本；关闭或已人工接管的会话不得自动回复。
3. 执行敏感 guard；命中直接 handoff。
4. 读取同城、同语言、当前 published revision 的候选；执行 Provider。
5. 零匹配/低置信度/多义时 handoff；命中时追加一条 24D Bot 消息。
6. 原子保存 run、消息/转人工事实及必要 Outbox；竞争失败者重读结果，不重复发消息。

Bot 不接受客户端提供的 `cityCode`、sender、provider 或候选文章 ID。服务端生成操作幂等键，例如 `bot-run:{triggerMessageId}`；重放不得按最新发布指针重新计算历史结果。

## 8. API 合约候选

Admin 知识库（`/api/internal/support/kb`）：

- `GET /articles?status&language&query&limit&cursor`
- `POST /articles`：`{slug,language,categoryId?,skuId?,title,summary?,bodyMarkdown,keywords,intentTags,idempotencyKey}`
- `GET /articles/:articleId`
- `POST /articles/:articleId/versions`：新 revision，含 `expectedVersion/idempotencyKey`
- `POST /articles/:articleId/versions/:versionId/submit`
- `POST .../approve`、`POST .../reject`：Admin only
- `POST /articles/:articleId/publish`、`POST .../archive`：Admin only
- `GET /bot-runs?conversationId&decision&limit&cursor`：审计读取

24D requester send-message API 不增加可伪造的 `bot=true` 参数；Bot 由服务端在消息持久化后触发。若需要显式重试，仅提供 Admin 运维接口并要求原 trigger ID、`expectedVersion` 和 idempotency key，且不得覆盖已有成功 run。

列表采用有界 cursor/keyset，cursor 绑定 city、筛选和排序。所有请求 strict Zod；正文、keywords、intent tags、列表 limit 均有上限。响应通过 `@xlb/api-client` 做运行时校验，幂等 POST 才允许安全重试。

## 9. Admin UI

新增懒加载 Support Knowledge Base 页面：文章列表、草稿/待审/已发布筛选、版本时间线、Markdown 编辑与安全预览、差异摘要、提交审核、Admin 审批/拒绝/发布/归档。Operator 看不到审批按钮；Auditor 全部禁写。

会话工作台显示 Bot 回复的 provider truthfulness badge（`deterministic` 或 `mock`）、匹配版本、reason code 和转人工原因；Requester 侧只显示获批知识内容和“已转人工”等必要状态，不暴露内部关键词、评分规则或内部笔记。UI 只能在 API 成功回执后变更状态。

## 10. 隐私、安全与内容治理

- NLU 输入仅用当前必要消息；日志、Outbox、run 表均不得复制原文、Token、电话、证件、地址或支付资料。
- 知识正文发布前检查 secrets、联系方式、脚本/危险链接；禁止文章包含要求用户提供密码、验证码或完整支付凭证的操作。
- 数据保留跟随 24D 会话政策；删除/匿名化请求不得因 Bot run 产生新的明文副本。
- KB 查询始终 city scoped；不允许全局文章通过 `__global__` 绕过城市治理。如需跨城复用，由 Admin 明确复制并独立审核版本。
- Provider 超时/异常或 schema 不合法时 fail closed 转人工，不能返回伪成功。

## 11. 测试矩阵

- **Unit**：文本规范化、敏感规则优先、确定性评分/tie-break、低置信度转人工、Provider envelope literal false、Markdown 安全。
- **Contract**：types/Zod/API client/DB 枚举闭集；未知字段拒绝；mock/deterministic 状态一致；Outbox 最小 payload。
- **Integration**：版本不可变；四眼审批；发布指针事务；旧会话重放保持原 version；文章更新不改变历史 Bot run；敏感消息零知识回复并转人工。
- **Security**：跨城文章/会话/版本拒绝；Operator 自审/越组拒绝；Auditor 写拒绝；Requester 伪造 provider/bot/文章 ID 拒绝；内部 reason 不泄露。
- **Idempotency/concurrency**：重复建文/新版本/发布；同一 trigger 并发只产生一个 run 和一条回复或一次 handoff；相同 key 不同 payload 409；陈旧 CAS 无副作用。
- **Provider truthfulness**：代码和构建产物扫描外部 SDK/端点/Provider 名；配置未知值启动失败；所有成功 envelope 仍为 `externalProviderExecuted=false`。
- **Migration**：全新库、重复 replay、历史 checksum、复合 FK 跨城拒绝、version 行 UPDATE/DELETE 数据库级拒绝或权限/gate 证明。
- **E2E**：Admin 建 revision → 独立 Admin 审批发布 → requester 普通问题得到确定性回复；敏感问题立即转人工；刷新/重连不重复回复。

## 12. Phase Gate 与交付

新增 `gate:phase24e`，串联 boundary、focused unit/contract/integration/security、迁移 replay、provider truthfulness、类型检查、构建和浏览器证据，并纳入 `preflight-architecture.ps1` 与 CI。边界 gate 至少阻止：外部 NLU SDK/网络调用、`externalProviderExecuted:true`、写入 `aftersale/payment/dispatch/ledger/settlement`、使用 migration 024、修改 locked migrations、Bot 原文进入 Outbox。

交付必须包括实际迁移编号、types/validators/API client、`CONTRACT_SUPPORT_BOT_KB.md`、模块 README、测试、Admin 浏览器证据和 `PHASE24E_SUPPORT_BOT_KB_REPORT.md`。只有所有 gate 通过、人工验收、按既定流程合并和打 tag 后才能 Lock；本设计本身不代表 24E 已进入或完成。

## 13. 施工决策清单

开工前必须重新确认：24D Lock/tag 与实际会话契约；24D 最新迁移号；隐私/保留评审结论；四眼审核是否保留默认强制；24D 转人工 CAS API；可复用的消息事务接口。任一事实与本文冲突时先停下修订设计，不以假设补代码。
