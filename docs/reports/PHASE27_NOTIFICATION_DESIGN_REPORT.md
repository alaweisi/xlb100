# Phase 27 Notification Design Acceptance Report

> **ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**

## 1. Entry conclusion

**ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**

人类接受日期：`2026-07-13`。N2/O2/P2 聚焦复审：**PASS**。本文记录 Phase 27 Notification 的 design-only acceptance，不是 Phase 27 runtime 入口、migration `054/055` 授权、实施完成或 Lock。

## 2. Session Sync

| Item | Observed fact |
| --- | --- |
| Repository | `G:\xlb100`（唯一有效本地仓库） |
| Branch / HEAD | `main` / `0b81aaf` (`docs: sync Phase 26 design governance state`) |
| Working tree at N/O/P revision entry | exactly the three authorized Phase 27 document files are untracked；无其他 dirty file |
| Remote relation | local `main` ahead of `origin/main` by 43 commits |
| Last locked phase | Phase 25；tag `xlb-phase25-ui-standardization-v1.0` |
| Phase 26 | `ACCEPTED — DESIGN ONLY`；Option A accepted as design；无 tag、无 runtime authority |
| Phase 27 | 设计已接受（DESIGN ONLY）；runtime 未进入、实施未开始、未 Lock |
| Phase 14 | `64/100`、`IN PROGRESS`、`NOT READY for staging`；历史结论 staging/production `NO-GO` |
| Migration truth | latest verified `053`；`054/055` 均不存在且未授权 |
| Write window | `WRITE_PHASE0`；只允许本文及另外两份 Phase 27 design-only 文档 |

接受收口没有改变 source Outbox、Order、Support、Customer App 或 Worker App；当前不存在 Notification runtime、migration、API、页面或订阅。

启动 skill 顺序已执行：

1. `xlb-session-sync`；
2. `xlb-context-map`，含 `reference.md`；
3. `xlb-current-vs-target`；
4. `xlb-phase-boundary`。

## 3. 事实来源

### 3.1 Governance 与设计事实

- `AGENTS.md`；
- `docs/CURRENT_STATE.md`；
- `docs/governance/phase-registry.json`；
- mandatory architecture rule 与 Phase boundary；
- 五份已提交 Phase 26 文档：
  - `docs/architecture/26_XLB_EVENT_DELIVERY_ADR.md`；
  - `docs/architecture/26_XLB_PLATFORM_DOMAIN_OWNERSHIP.md`；
  - `docs/architecture/26_XLB_PLATFORM_FOUNDATION.md`；
  - `docs/contracts/CONTRACT_PLATFORM_EVENT_CATALOG.md`；
  - `docs/reports/PHASE26_PLATFORM_FOUNDATION_DESIGN_REPORT.md`；
- `docs/reports/PHASE26_GOVERNANCE_METADATA_SYNC_REPORT.md`；
- 用户提供的窗口 G 只读发现结论。

### 3.2 Runtime/source facts inspected

- `backend/src/events/`：source Outbox claim/ack、lease、retry、reaper 与 event payload；
- `backend/src/order/`：`order.created` 在 Order transaction 内写入；
- `backend/src/support/`：ticket resolved metadata Outbox、requester identity 与 message event；
- `backend/src/auth/`、RequestContext、RBAC 与 Admin city guard；
- `backend/src/providers/`：只有 local/mock object storage 与 deterministic/mock Support NLU；没有消息渠道 Provider；
- `apps/customer`、`apps/worker`、`apps/admin`：当前无 Notification/inbox surface；
- `packages/types`、`packages/validators`、`packages/api-client`：当前无 Notification contract/client exports。

事实优先级保持为 git + `CURRENT_STATE` + actual source > committed reports/design > window/prompt context。未发现与本任务 prompt 冲突的 repo truth。

## 4. 窗口 G 发现保留

| Window G fact | 已接受设计中的处理 |
| --- | --- |
| `event_outbox` 是单消费者 source work-claim queue | 作为首要不变量；Notification 禁止 direct claim/ack |
| Notification 不得直接 claim/ack source Outbox | 写入 architecture、contract、Gate 与测试矩阵 |
| Option A per-subscriber delivery ledger 尚未实现 | `054` 全部标为 future design / not implemented |
| MVP 仅 Customer/Worker in-app inbox | 无 Admin/OA inbox，无外部渠道 |
| `order.created` 与 `support.ticket.resolved` 只是候选 | current 均为 `implicit-v0 / source schema version absent`；synthetic compatibility major `0` 仅是 future Platform metadata；均为 **CANDIDATE — HUMAN PENDING ACTIVATION** |
| `support.ticket.assigned`、`support.message.created` 不进入 MVP | 明确 denylist/zero subscription |
| 外部渠道 absent/not_configured | 无 Provider、无 send API、无 fake delivered |

## 5. 当前真实能力 vs Phase 27 候选能力

| Concern | 当前真实能力 | Phase 27 候选能力 | 当前差距 / blocker |
| --- | --- | --- | --- |
| Source Outbox | 单 source row/shared lifecycle；Dispatch 等 typed consumer claim/ack | 保持不变 | 不可直接增加 Notification claimer |
| Platform fan-out | 无通用 per-subscriber ledger | future `054` additive ledger | migration/runtime/ops 未授权且未实现 |
| Completeness | source queue 自身 lifecycle；无新 subscriber reconciliation | candidate scan + retained-source anti-join | commit-skew/long-tx/reconciliation evidence 未实现 |
| Durable subscriber idempotency | Notification 无 | `(subscriber_id,event_id)` receipt + atomic target effect | schema/transaction/test 未实现 |
| Notification data | 无模板、偏好、记录或 read state | future `055` in-app projection | human product/privacy decisions + migration 未完成 |
| Event allowlist | Phase 26 只有 proposed allowed catalog；无 Notification subscription | 两个候选 accepted-shape design -> synthetic-major `0` allowlist rows | **CANDIDATE — HUMAN PENDING ACTIVATION**；不得注册或激活；synthetic `0` 不是 source 字段 |
| API | 无 Notification API/client/types/validators | C/W own list/read；count/archive 仅在人类决策后 | runtime entry 未授权；unread/archive 另有 API/runtime blocker |
| UI | 三端无 inbox page | Customer/Worker inbox after APIs | 页面未授权；不得先建 |
| Admin | 现有 admin city scope 基础 | future city-scoped sanitized diagnostics | permission/content boundary 待人类决定；无 Admin inbox |
| External channel | SMS/Push/WeChat/Email Provider 不存在 | MVP 保持 absent/not_configured | 外部策略未批准；不得 fake success |
| Retention/deletion | Phase 26 明确延期 | notification-specific policy | 未决即阻断 activation/purge/replay |
| Source schema version | 所有 current source event envelope 均无 schema-version 字段；Support payload `version` 是 ticket aggregate version | future Platform 可记录 approved compatibility mapping 的 synthetic major `0` | synthetic `0` 不是 `event_outbox`/producer 已实现字段，且不得写回 source |
| Unread/archive | 无 Notification API/runtime | 只有人类冻结语义后才可设计 count/archive behavior | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Production readiness | Phase 14 64/100、IN PROGRESS、NO-GO | 不属于 Phase 27 设计可豁免范围 | Provider/backup/monitoring/secrets/deployment/rollback/production approval gaps 等仍阻断 |

## 6. 关键设计决定

1. 未来实施顺序固定为 `054 platform delivery -> 055 Notification projection -> APIs -> Customer/Worker pages`；不得页面或渠道先行。
2. Platform materializer 只读 source Outbox，不使用 source claim/ack；source `published` 不被重新解释。
3. Exact executable subscription key 为 `(city_code,subscriber_id,event_type,event_major_version)`；current source 只有 implicit-v0，future Platform 仅可把 approved exact known shape 映射 synthetic `0`，且不允许 wildcard/range/source 回写。
4. Platform canonical delivery 与 Notification durable receipt 均以 `(subscriber_id,event_id)` 防重复；receipt 与 target effect 原子提交。
5. Template identity 选择 global immutable `template_revision_id`；Notification record 业务唯一键为 `(city_code,recipient_type,recipient_id,source_event_id,template_revision_id)`。
6. `order.created` 与 `support.ticket.resolved` 均为 **CANDIDATE — HUMAN PENDING ACTIVATION**；MVP 不含 assigned/message events。
7. 两个 current compatibility shape 已完整列入 architecture §4.3–4.4 与 contract §3.2–3.3，并逐字段分为 recipient-only、render parameter、discard；missing/unknown/extra 均 strict fail closed。
8. Platform delivery `delivered`、recipient `read`、候选 `archive` 与 external delivery 是相互独立的事实；`delivered` 只代表 inbox effect committed。
9. 首次 target fingerprint 固定为 subscriber/source-event/event-type/synthetic-major/city/recipient/source-hash/template-revision/render-params 的 canonical SHA-256；retry、lease expiry、ordinary replay 返回 canonical receipt/notification，不按 active template 重渲染。
10. Mark-read future contract 使用 row-version CAS；archive/unread 语义不作选择，延期状态为 **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER**，具体决定前不得实现 API/runtime/UI。
11. Retention/legal hold/redaction/tombstone 未决是 activation blocker，不是可在上线后补的 TODO。
12. Phase 14 持续 64/100、IN PROGRESS、production NO-GO；Phase 27 design acceptance 不豁免任何生产整改。

候选事件没有 activation authority：无 live-start 批准、无历史 backfill/replay 批准、无 city/subscriber allowlist 激活；`support.ticket.assigned` 与 `support.message.created` 不在 MVP。

## 7. Gate 最终状态

| Gate | Prepared evidence | Waiting / status |
| --- | --- | --- |
| Session baseline | `main` / `0b81aaf`；dirty 仅三份 authorized document；Phase 26 governance truth；migration 053 latest | **PASS for design closeout only** |
| D0 — Design review | Architecture、Markdown contract、report 完整；N2/O2/P2 focused review 完成 | **PASS** |
| D1 — Human design acceptance | 人类于 `2026-07-13` 接受设计；仅 DESIGN ONLY | **PASS — DESIGN ONLY** |
| E0 — Runtime entry | 禁止项与未来顺序已固定；仍需独立 explicit runtime entry approval | **NOT AUTHORIZED** |
| G1 — Deferred decisions / activation | 七类决策延期获准；无 live-start、allowlist activation、backfill/replay | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| G2 — Future 054 implementation verification | 字段/索引/FK/replay/rollback ledger 仅设计 | **NOT STARTED — MIGRATION 054 NOT AUTHORIZED** |
| G3 — Future 055 implementation verification | template/preference/record/receipt/CAS ledger 仅设计 | **NOT STARTED — MIGRATION 055 NOT AUTHORIZED** |
| G4 — Contract/API/runtime verification | own-scope contract 与 security matrix 仅设计 | **NOT STARTED — CONTRACT/API IMPLEMENTATION NOT AUTHORIZED** |
| G5 — UI/browser verification | required evidence matrix 仅设计；当前无 Notification 页面 | **NOT STARTED — UI IMPLEMENTATION NOT AUTHORIZED** |
| G6 — Exit/Lock | migration replay、rollback、regression、browser、独立验收、merge/tag 均未执行 | **NOT ENTERED** |
| Subscription/backfill/replay | candidate events 未激活；无 city/subscriber row | **NOT AUTHORIZED** |
| External Provider | truthfulness boundary 已固定；当前无消息渠道 Provider | **ABSENT / NOT AUTHORIZED** |
| Production readiness | Phase 14 `64/100`、`IN PROGRESS`、NO-GO | **BLOCKED**：design acceptance 不豁免 Provider、backup/restore、monitoring/alerting、secrets、deployment、rollback、production approval gaps 或外部整改 |

## 8. Future implementation test matrix

所有行都是未来 runtime authorization 后的必需证据；本设计窗口不创建或运行这些测试。

| Area | Required scenario | Pass condition |
| --- | --- | --- |
| City scope | missing/mismatched/`__global__` city；cross-city source/recipient/FK | fail closed；零泄露、零 target write；composite FK 拒绝 |
| Role scope | Customer 调 Worker API、Worker 调 Customer API、auditor mutation、Admin 无权限 diagnostics | 401/403/404 按 accepted contract；零写入；审计 bounded |
| Self scope | 改 notification ID、query/body recipient ID、枚举他人记录 | no cross-user read/count/mutation；public surface 不泄露存在性 |
| PII | 注入电话、地址、姓名、金额、正文、聊天、证据 URL/bytes、token、Provider body | materializer/handler/persistence 三层 fail closed；DLQ/error 不复制 payload |
| Version truth | source schema field absent；伪造/新增 source version；synthetic mapping | current 只识别 approved implicit-v0 shape；synthetic `0` 仅 platform metadata；source 零写 |
| Compatibility shape | 每个 required missing、逐个 unknown/extra、wrong type/enum/time；Order 在 stripping parse 前检查 raw keys；Support other source | strict fail closed；无 target/ack；sanitized error；完整 A/B/C projection |
| Duplicate delivery | concurrent claim、ack lost、same event replay、active template changed | 一个 receipt、一个 Notification effect；返回 frozen canonical revision/fingerprint；不重渲染 |
| Lease/CAS | owner/token mismatch、expired ack、renew/reaper race、late worker | 只有有效 unexpired token 可转移；其他 subscriber/source 不变 |
| Reaper | expired processing rows across cities/subscribers | 只处理指定 city/subscriber；bounded retry/DLQ；不碰 source |
| DLQ | retryable poison、non-retryable schema/PII failure | bounded attempts、sanitized error、subscriber-only DLQ |
| Manual retry | authorized/unauthorized/wrong-city/stale-version retry | 仅显式 city-scoped operator + reason/change ref 成功；append-only audit |
| Replay | dry-run、bounded live/replay quota、cancel、already applied、active template advanced | no live starvation；返回 canonical receipt/notification；frozen revision/fingerprint 不变 |
| Commit-skew reconciliation | cursor 越过 T 后 `created_at<T` 的 long transaction 才 commit | 初次 cursor 可 miss；retained anti-join 修复一次；gap 未闭合前不宣告 complete |
| Repeated reconciliation | concurrent/repeated same retained horizon | unique `(subscriber,event)`；stable count/hash；无重复 target |
| Missing-delivery repair | retained eligible source 缺 delivery | anti-join 发现并修复；repair evidence；source status 不变 |
| Row-version CAS | concurrent mark-read、stale version、lost response retry；archive 测试暂禁 | 一个 CAS mutation；target-already-state 返回 `already_applied` 不增 version；archive 等人类语义 |
| Unread/archive blocker | 尝试在具体 decision absent 时实现 count/archive API、runtime 或 UI | Gate 必须失败；**APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Provider unavailable | SMS/Push/WeChat/Email absent、伪造 config/result | 能力只为 absent；若持久化配置事实只为 not_configured；零 external call；无 delivered/unavailable 假状态 |
| Protected-domain zero-write | capture writes to Order/Payment/Pricing/Dispatch/Fulfillment/Worker/Support/Ledger/Settlement/source Outbox | 只允许 platform/Notification-owned target 与 ack API；protected domains zero write |
| Migration replay | empty/existing/partial-DDL/double-run；cross-city fixtures | deterministic schema/marker；000–053 不变；cross-city rejected |
| Rollback/compatible read | pause materializer/subscriber、revert read pointer、resume | old consumers/source 正常；audit retained；无 source rewrite |
| Retention/legal hold | non-terminal source/delivery、DLQ、active replay、gap、hold、FK | 每个 blocker 阻止 purge；no cascade audit deletion |
| Real Customer browser | real auth/city/API data：list/read、empty/error/stale；count/archive 仅在 human decision 后 | 无 mock success；状态与 API/DB 一致；unread/archive 未决时页面无该能力 |
| Real Worker browser | real auth/city/API data：list/read、wrong-role denial；count/archive 仅在 human decision 后 | 同上；own Worker scope；未决能力不得出现 |
| Real Admin browser | 无 Admin inbox；仅经批准 diagnostics 或明确 denial；cross-city negative | 不显示 recipient inbox/content；city/role denial 可证；无 fake data |

“真实三端浏览器证据”指 Customer/Worker 的真实 inbox workflow 加 Admin 的 diagnostics/denial boundary，不表示 Admin inbox 进入 MVP。

## 9. 已批准延期的人类决策台账 — API/runtime entry blockers

以下事项不得由 Agent、默认值、模板或实现者自行决定：

| Human-only decision | Required decision evidence | Status |
| --- | --- | --- |
| 初始 city/subscriber/event/synthetic-major allowlist | 两个 implicit-v0 shape 的 synthetic `0` mapping、具体 real-city rows、PII ceiling、activation owner | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Live-start、backfill、replay | boundary、historical scope、row cap、dry-run/hash、approval、cancel/quota | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Template/语言/fallback/mandatory/optional 分类 | title/body、locales、fallback、mandatory/optional、publication approval | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Preference 默认值、archive/unread、hidden/delete | default、override、unread set、archive effect/recovery、hidden/delete authority/reason | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Retention/legal hold/redaction/tombstone/DLQ/physical deletion | durations、hold owner、redaction fields、tombstone、DLQ disposition、cleanup | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| Admin diagnostics/manual retry/template/auditor 权限及四眼复核 | maker/checker 分离、city/content scope、approval/audit trail | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |
| 外部渠道策略 | Phase 27 持续 absent；未来 SMS/Push/WeChat/Email 需独立 Phase、Provider/secrets/retention/rollback 批准 | **APPROVED DEFERRAL — API/RUNTIME ENTRY BLOCKER** |

延期获得批准，但具体决定值没有获得批准。任一对应决定完成前，不得实现相关 API/runtime/UI，不得注册或激活 subscription，也不得启动 live-start、backfill 或 replay。

## 10. N2/O2/P2 focused-review acceptance record

N2/O2/P2 聚焦复审结果：**PASS**。该 PASS 只接受 design artifacts，不构成 E0 runtime entry、migration、implementation 或 Lock 证据。

| Review requirement | Revised locations |
| --- | --- |
| Version truth / synthetic `0` | Architecture §§1.2, 4.1；Contract §§2.1, 3, 8；Report §§4–8 |
| Complete compatibility shapes / PII / executable fail-closed | Architecture §§4.2–4.5；Contract §§3.1–3.4；Report §§6–8 |
| Global immutable template revision / frozen fingerprint | Architecture §§6.1, 6.3；Contract §§2.3–2.4, 9.2；Report §§6–8 |
| Unread/archive human blocker | Architecture §§3.1, 6.4, 9, 11；Contract §§4–6, 11；Report §§5–9 |
| Phase 14 continuing blocker | Architecture §§10–11；Contract §12；Report §§2, 5, 7, 11 |
| Human decision ledger | Architecture §9；Contract §11；Report §9 |

## 11. Phase 14 continuing production blocker

Phase 14 仍为 `64/100`、`IN PROGRESS`、staging/production `NO-GO`。Phase 27 design acceptance 不构成 production-readiness 豁免，也不证明真实 Provider、backup/restore、monitoring/alerting、secrets/key management、deployment、rollback、production approval gaps 或其他外部整改已完成。Production enablement 继续独立阻断。

## 12. 设计审查重开规则

以下任一变化都会重新开启 D0/D1 设计审查，既有 `PASS` 不自动覆盖新设计：

- source compatibility shape；
- Phase 26 Option A delivery ADR；
- candidate event 或 allowlist；
- PII classification；
- template/idempotency contract；
- retention/deletion；
- runtime Gate 或 migration ledger。

重开后必须重新完成对应 owner review、N2/O2/P2 focused review 与明确人类接受；在新接受前继续保持 API/runtime entry blocker。

## 13. Files modified in this window

仅修改既有三份未跟踪文档：

1. `docs/architecture/27_XLB_NOTIFICATION_DESIGN.md`；
2. `docs/contracts/CONTRACT_NOTIFICATION.md`；
3. `docs/reports/PHASE27_NOTIFICATION_DESIGN_REPORT.md`。

未修改 `CURRENT_STATE`、phase registry、Phase 26 文档、tag、runtime、migration、packages、apps、tests 或 Provider。

## 14. Final boundary

**ACCEPTED — DESIGN ONLY — RUNTIME NOT AUTHORIZED**

Phase 27 runtime、migration `054/055`、TypeScript contracts/validators、API/client/route、Customer/Worker/Admin/OA 页面、subscription activation、backfill/replay 与 SMS/Push/WeChat/Email Provider 均未授权。

**Phase27 已接受为设计，不代表 runtime、migration、API、页面、订阅、backfill/replay、Provider 或 Lock 授权；等待主窗口独立复核并提交。**
