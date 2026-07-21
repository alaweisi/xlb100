# Phase 25 — Route 开工契约矩阵

> 本文件是 Gate 0 页面准入清单。没有本表记录的 route 不得进入 Phase 25 页面施工。

> 审计结论：当前表仍是 route/surface inventory，不是最终可执行 workflow matrix。Gate 0B 必须把每个 surface 展开为 `endpoint × exact backend state × action × permission × city × confirmation × idempotency × audit`，并修正 Customer/Worker bindings 的遗漏/陈旧事实、补建 Admin binding contract。详见 `../../../reports/PHASE25_MULTI_AGENT_UI_SYSTEM_AUDIT.md`。

## Customer

| Route | Visual Source | Workflow / API Source | Required States | Primary Actions | Gate |
| --- | --- | --- | --- | --- | --- |
| `/customer/` | `docs/design/ui/references/customer-home-visual-truth.png` | `GET /api/catalog`; Customer Home workflow | loading, empty, error, available, partial | city, search, category, notifications, support, create order, open service | Gate 2 proof screen |
| `/customer/services` | Inherit `CUSTOMER_HOME_VISUAL_TRUTH.md`; route page card controls structure | `GET /api/catalog`; client query/category filter | loading, error, no-result, list, selected | search, filter, select SKU | Gate 3 |
| `/customer/order/create` | Inherit Customer Home language; current contract/page card controls workflow | quote, address, order APIs | invalid, quoting, quote-ready, submitting, created, error | SKU, quantity, address, schedule, create | Gate 3 |
| `/customer/orders` | Inherit Customer Home language; current contract/page card controls workflow | order, payment, confirmation, review APIs | empty and all backend order/payment/fulfillment states | open, pay where allowed, confirm, review | Gate 3 |
| `/customer/aftersale` | Inherit Customer Home language; Phase 17 contract controls workflow | Phase 17 reverse/complaint/evidence APIs | guarded, actionable, reviewing, repair, resolved, closed | cancel/reschedule request, complaint, note, evidence | Gate 3 |
| `/customer/support` | Inherit Customer Home language; Phase 24 contract controls workflow | Phase 24 ticket/conversation/CSAT APIs | empty, open, assigned, realtime, resolved, reopened | create, comment/message, reopen, rate | Gate 3 |
| `/customer/notifications` | Inherit Customer Home language; notification page card controls structure | notification list/read/archive/restore APIs | loading, inbox/archive empty, error, ready, loading-more, conflict | switch view, mark read, archive/restore, load more, follow target | Gate 3 |
| `/customer/coupons` | Inherit Customer Home language; coupon page card controls structure | coupon grant list and discount-decision APIs | loading, empty, error, available, used, expired, stale | switch view, select for quote, recover deep link | Gate 3 |
| `/customer/profile` | Inherit Customer Home language; current contract/page card controls workflow | profile/address APIs | loading, display, editing, invalid, saving, error | edit profile, CRUD address | Gate 3 |

Customer global constraints: authenticated identity, `city_code`, `@xlb/api-client`, five-item navigation `首页/客服/新报修/订单/我的`, top notification entry, safe area, no engineering copy, no fabricated price/order/worker data. The official catalog remains the only category authority.

Customer campaign constraints: festival/activity visuals are an overlay on the locked Customer Home visual language. Pages consume resolved campaign and authoritative quote results only; they do not decide dates, eligibility, city scope, discount amounts, or asset URLs ad hoc. Standard slots and fallbacks are defined in `PHASE25_CAMPAIGN_THEME_EVOLUTION.md`.

## Worker

| Route | Figma Source | Workflow / API Source | Required States | Gate |
| --- | --- | --- | --- | --- |
| `/worker/` | GrabHall Online/Paused | task pool, eligibility, accept/reject/timeout | loading, empty, paused, online, eligible, blocked, offer | Gate 4 |
| `/worker/tasks` | Worker task list/execution frames | fulfillment list | empty, assigned, started, completed, error | Gate 4 |
| `/worker/tasks/:id` | Worker task detail | fulfillment detail/start/complete/evidence | guarded, actionable, uploading, completed | Gate 4 |
| `/worker/repairs` | Worker aftersale frames | repair-order APIs | empty, assigned, started, completed | Gate 4 |
| `/worker/wallet` | Worker wallet/income frames | receivable, bank account, withdrawal APIs | loading, empty, balance, submitting, reviewing, paid/rejected | Gate 4 |
| `/worker/support` | Figma-derived Worker support | Phase 24 ticket/conversation APIs | empty, open, realtime, resolved | Gate 4 |
| `/worker/profile` | Worker profile frames | location/settings APIs | loading, sharing on/off, valid/invalid location | Gate 4 |
| `/worker/certification` | Worker certification frames | certification APIs | not-submitted, submitted, approved, rejected | Gate 4 |

Worker global constraints: real worker identity, service city, certification/eligibility truth, no fake task or earnings, exact location stays private, local/mock provider truth remains visible where required.

## Admin

| View / Hash Route | Figma Source | Workflow / API Source | Required States | Gate |
| --- | --- | --- | --- | --- |
| settlement operations | Admin dashboard/work-order visual system | settlement read/governance APIs | loading, empty, list, detail, guarded error | Gate 5 |
| `#/settlement-ops/exports` | Admin list/review system | export review APIs | loading, empty, review states, error | Gate 5 |
| `#/settlement-ops/governance` | Admin governance system | action intent/review/readiness | disabled, review, approved/rejected, audit | Gate 5 |
| `#/order-trace` | Admin work-order/detail system | order trace API | search, loading, result, no-result, error | Gate 5 |
| `#/worker-withdrawals` | Admin audit/list system | withdrawal review APIs | pending, approved/rejected, paid guard | Gate 5 |
| `#/aftersale` | Complaint / AfterSale frames | Phase 17 Admin APIs | queue, detail, triage, repair, liability, compensation, closed | Gate 5 |
| `#/enterprise` | Admin settings/list system | enterprise APIs | list, detail, credential/webhook/bill states | Gate 5 |
| `#/dispatch` | Admin Dispatch frame | dispatch board/match/timeout APIs | loading, candidates, offered, expired, reassigned, error | Gate 5 |
| `#/platform-operations` | Admin Dashboard / Settings frames | orders/SKU/workers APIs | list, filter, status update, conflict/error | Gate 5 |
| `#/support` | Admin workbench system | Phase 24 queue/SLA/conversation APIs | mine/group/all, breached, claimed, realtime, resolved | Gate 5 |
| `#/support-quality` | Admin audit/metric system | CSAT/quality APIs | empty, metrics, review queue, scored | Gate 5 |

Admin global constraints: authenticated admin/operator, explicit city scope, role permission, audit/confirmation/idempotency visibility, installable mobile layout with touch-safe compact tasks, no hidden backend errors, no fake execution success. Desktop batch operations belong to OA.

## OA — Desktop Runtime Foundation

Current repo state: `apps/oa` is an independent desktop Vite runtime that reuses Admin's real business pages and API contract. It authenticates through dedicated OA OTP routes, isolated session storage and an `appType=oa` token. Login requires an `admin` identity with the `__global__` scope; every workflow still sends an explicit real city.

| Planned Surface | Required Product/Contract Source | Required States | Entry Condition | Gate |
| --- | --- | --- | --- | --- |
| 工作台 | role/organization and queue contract | loading, empty, ready, error | OA identity + scoped read API | Gate 6 |
| 待办/任务 | task ownership, assignment, due-time contract | open, claimed, in-progress, blocked, done | task state machine approved | Gate 6 |
| 审批 | approval definition, step, decision, audit contract | pending, approved, rejected, withdrawn, expired | approval API and audit model approved | Gate 6 |
| 通知 | notification delivery/read contract | unread, read, archived, error | notification API approved | Gate 6 |
| 流程详情 | process instance and timeline contract | running, blocked, completed, cancelled | workflow read model approved | Gate 6 |
| 组织协作 | admin user/org relationship contract | member, role, scope, unavailable | organization source approved | Gate 6 |

OA global constraints: no fake approvals/tasks, no direct protected-domain mutation, every decision requires permission/audit/idempotency definition, and Admin identity may only be reused after explicit contract approval.

## Realtime Dashboard — Read-only Runtime Foundation

Current repo state: `apps/dashboard` is an independent 16:9 Vite wallboard. It polls real health/readiness/system-status sources and exposes live, partial, stale, disconnected and error states. Dedicated business aggregate APIs remain a readiness gap and must not be replaced by static numbers.

| Planned Surface | Required Data Contract | Required Runtime States | Entry Condition | Gate |
| --- | --- | --- | --- | --- |
| 全局态势 | metric dictionary + time window + city scope | loading, live, stale, partial, disconnected, error | metric definitions approved | Gate 7 |
| 订单/派单/履约 | bounded aggregate/read-model contract | live, delayed, no-data, error | aggregation source approved | Gate 7 |
| 客服/SLA | support metrics and freshness contract | live, breached, stale, disconnected | Phase 24 read model approved | Gate 7 |
| 财务只读 | ledger/settlement aggregate contract | live, closed-window, restricted, stale | finance privacy/role scope approved | Gate 7 |
| 趋势与告警 | time-series and threshold contract | normal, warning, critical, acknowledged | alert semantics approved | Gate 7 |
| 实时连接 | pull/SSE/WebSocket protocol | connecting, live, retrying, disconnected | transport and retry policy approved | Gate 7 |

Dashboard global constraints: read-only, no fake realtime numbers, every metric displays unit/time window/last-updated/source state, city/role privacy is enforced, and disconnected/stale data must never appear live.

Dashboard campaign constraints: activity decoration remains below metric, alert, freshness and disconnected-state priority. OA/Dashboard theme activation is blocked until `CampaignAppScope`, permissions and API contracts explicitly support both systems.

## Page Card Exit Rule

Before a row changes from its listed Gate to implementation, create a page card under `docs/design/ui/phase25/page-cards/` containing the full template from the execution control document and receive Gate authorization.
