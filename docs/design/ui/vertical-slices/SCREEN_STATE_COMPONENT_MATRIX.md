# XLB 三端画面与状态组件边界矩阵

## 1. 使用方式

本矩阵将 [SLICE_SCOPE_BASELINE.md](./SLICE_SCOPE_BASELINE.md) 中的 36 个 Carrier 和 214 条正式切片映射到具体表达边界。

判定顺序：

1. `GATE` Carrier 中的切片使用全局守卫画面；
2. “必须升级为 State Frame”列中的状态使用完整状态画面；
3. 同一 Carrier 的其余 Slice ID 默认使用 `REGION`，可表现为详情区、列表行、时间线、Banner 或持久结果区；
4. “Overlay”是动作输入或确认的从属界面，不替代动作后的持久结果；
5. loading、empty、error、401、403、409、422、离线、重复和部分成功按 [SCREEN_STATE_COMPONENT_BOUNDARY.md](./SCREEN_STATE_COMPONENT_BOUNDARY.md) 的全局升级规则处理。

由此，每条切片都有唯一主要承载层级，同时允许拥有从属 Overlay 和 Micro Variant。

## 2. 顾客端矩阵

| Carrier | Slice 覆盖 | 数量 | Base Frame | 必须升级为 State Frame | 保持为 Region / State Component | 从属 Overlay |
| --- | --- | ---: | --- | --- | --- | --- |
| `C-00` | `C.AUTH.*` | 1 | Customer Session Gate | `C.AUTH.SESSION.REQUIRED` | 无 | 登录/验证码输入；成功后回原目标 |
| `C-01` | `C.CATALOG.HOME.*` | 2 | Customer Home | Catalog 整页 empty；整页不可加载 | 服务分类、SKU 卡、城市范围、局部 loading | 城市选择 Sheet |
| `C-02` | `C.CATALOG.BROWSE.*`、`C.CATALOG.SEARCH.*` | 2 | Service Browse | 整个城市 Catalog 不可用 | no-result、筛选结果、分类 Tab、SKU 可用标签 | 城市/筛选 Sheet |
| `C-03` | `C.ORDER.CREATE.*`、`C.ORDER.QUOTE.*`、`C.COUPON.SELECT.*` | 6 | Order Create / Input | `C.ORDER.QUOTE.READY`、`C.ORDER.CREATE.PENDING_DISPATCH`；整单 Quote invalidated 时使用完整恢复状态 | 字段校验、局部报价刷新、优惠资格原因 | 地址、时间、优惠券选择 Sheet；创建订单确认 Sheet |
| `C-04` | `C.ORDER.DETAIL.*`、`C.CONFIRMATION.*`、`C.PAYMENT.*`、`C.REVIEW.*`、`C.REFUND.*` | 20 | Orders List + Order Detail | Order pending_dispatch/service_completed/cancelled；Confirmation disputed；Payment paid/failed/closed；Refund approved | Confirmation pending/confirmed、Review 生命周期、Refund requested、Payment pending 的持久区域 | 确认服务、提出争议、支付、评价、申诉、退款申请 Sheet/Dialog |
| `C-05` | `C.AFTERSALE.*` | 10 | Aftersale Overview + Case Detail | Reverse applied；Complaint waiting_customer/resolved/closed/rejected | Reverse requested/approved/rejected、Complaint submitted/in_progress、时间线、责任与返工摘要 | 取消/改期/改派申请、投诉、补充资料 Sheet |
| `C-06` | `C.SUPPORT.*` | 9 | Support Hub | Ticket escalated；整段 Conversation closed 且无后续动作 | Ticket open/waiting/resolved/closed、Conversation queueing/active/transferred、消息列表 | 新建工单、重开、CSAT、发起会话 Sheet |
| `C-07` | `C.NOTIFICATION.*` | 3 | Notification Inbox | 无；通知不改变 App 主任务 | unread/read/archive Tab、行状态、未读计数、引用对象链接 | 批量归档确认（如后端支持） |
| `C-08` | `C.COUPON.WALLET.*` | 4 | Coupon Wallet | 无；券状态保持在列表/详情上下文 | available/reserved/redeemed/terminal 的分组、行状态与来源说明 | 券详情 Sheet；使用动作跳转下单，不在 Sheet 建订单 |
| `C-09` | `C.PROFILE.*`、`C.ADDRESS.*` | 5 | Customer Profile | 整页身份读取失败或账号不可用 | Profile display/edit result、地址列表、保存状态 | Profile/Address Edit Sheet；Delete Confirm Dialog |

### 2.1 顾客端固定边界

- 订单创建成功后不能只显示 Toast，必须进入订单结果 State Frame；
- Payment paid/failed/closed 必须是可回看的持久结果；
- Refund requested 可以是订单详情 Region，approved 必须升级为结果 State Frame；
- 评价和申诉保留在订单详情，不新增独立 Route；
- 通知和券状态使用列表 Region，不为每条通知或券建立独立 Frame。

## 3. 师傅端矩阵

| Carrier | Slice 覆盖 | 数量 | Base Frame | 必须升级为 State Frame | 保持为 Region / State Component | 从属 Overlay |
| --- | --- | ---: | --- | --- | --- | --- |
| `W-00` | `W.AUTH.*`、`W.PROFILE.ACCESS.*` | 4 | Worker Login / Access Gate | unauthenticated、authenticated handoff、suspended、disabled | 验证码 loading/error | 登录/验证码表单 |
| `W-01` | `W.TASK_POOL.*`、`W.DISPATCH.*` | 8 | Worker Grab Hall | Task Pool online/paused/blocked；Offer accepted handoff | Offer rejected/timeout/cancelled 的持久反馈、任务卡、倒计时 | Offer Sheet：accept/reject；timeout 后自动关闭且保留结果 |
| `W-02` | 聚合 `W.FULFILLMENT.*` | 0 | My Tasks List | 整页无权限或账号阻断 | accepted/in_progress/completed/cancelled 列表分组、empty/loading | 筛选 Sheet；无业务结果 Overlay |
| `W-03` | `W.FULFILLMENT.*`、`W.CONFIRMATION.*` | 9 | Task Detail | Fulfillment accepted/in_progress/completed/cancelled；Confirmation disputed | Evidence missing/stored、Confirmation pending/confirmed、任务时间线 | Start Confirm、Evidence Upload、Complete Service Sheet/Dialog |
| `W-04` | `W.REPAIR.*` | 4 | Repair List + Detail | Repair assigned/in_progress/completed/cancelled | 返工来源、Complaint/Order 引用、服务说明 | Start Repair、Complete Repair Sheet/Dialog |
| `W-05` | `W.FINANCE.*`、`W.BANK_ACCOUNT.*`、`W.WITHDRAWAL.*` | 10 | Worker Wallet | 钱包整页不可用；Withdrawal marked_paid 需要可回看结果区但不新建 Route | Balance/adjusted、账户 active/inactive、Withdrawal requested/approved/rejected/cancelled | Add Bank Account、Withdrawal Request Sheet；敏感信息确认 Dialog |
| `W-06` | `W.SUPPORT.*` | 4 | Worker Support Hub | 账号/任务安全问题进入升级状态；Conversation closed 且无恢复动作 | Ticket active/resolved、Conversation active/closed、消息列表 | 新建工单、重开、CSAT、发起会话 Sheet |
| `W-07` | `W.NOTIFICATION.*` | 2 | Worker Notification Inbox | 无 | unread/read/archive、引用对象跳转 | 批量归档确认（如后端支持） |
| `W-08` | `W.REPUTATION.*`、`W.REVIEW.*` | 5 | Worker Reputation | 整页信誉投影不可用 | empty/available、Appeal eligible/open/resolved、评分分布 | Appeal Create/Withdraw Sheet/Dialog |
| `W-09` | `W.LOCATION.*` | 3 | Worker Profile / Location | sharing stale 且阻断接单、sharing disabled 且当前目标为恢复接单 | fresh/enabled、精度/时间/隐私说明 | 保存位置、关闭共享确认 Sheet |
| `W-10` | `W.CERTIFICATION.*` | 5 | Certification Apply | pending、approved、rejected、expired | not-submitted 表单校验、提交中、证据说明 | Submit Certification Sheet/Dialog；是否重提由 API 决定 |

### 3.1 师傅端固定边界

- Offer 只在 offering 时使用 Bottom Sheet；accepted 后必须跳转 Task Detail；
- Task Detail 的 accepted/in_progress/completed/cancelled 是完整 State Frame，不只换按钮；
- Evidence 是履约详情 Region，不独立成 Route；
- Withdrawal 状态在 Wallet 中持久表达，Toast 只能补充；
- Certification 四个审核结果必须拥有完整画面状态。

## 4. 后台矩阵

| Carrier | Slice 覆盖 | 数量 | Base Frame | 必须升级为 State Frame | 保持为 Region / State Component | 从属 Overlay |
| --- | --- | ---: | --- | --- | --- | --- |
| `A-00` | `A.AUTH.*`、`A.SCOPE.*` | 2 | Admin Auth / City Gate | Session required、City required、整页无权限 | Shell 内身份、角色、城市 ScopeBadge | 登录、城市选择；权限不能仅放 Overlay |
| `A-01` | Settlement Batch/Payable/Queue/Reconciliation | 7 | Settlement Ops Dashboard | Reconciliation gap_found 且阻断后续操作；整页 scope/permission error | Batch/Payable/Queue 行状态、gap clear、审计摘要 | Confirm/Cancel Batch、Mark Payable、Enqueue、Generate Statement Dialog |
| `A-02` | `A.SETTLEMENT.STATEMENT.*` | 3 | Statement Detail | created actionable、approved、rejected | 金额、行项、审核历史、hash/版本 | Approve/Reject Review Dialog |
| `A-03` | `A.SETTLEMENT.EXPORT.*` | 1 | Export Review | Export integrity failed 时使用完整错误状态 | Export created、hash、证据引用 | 查看元数据 Drawer；禁止伪造下载成功 |
| `A-04` | `A.GOVERNANCE.*` | 4 | Governance Workbench | blocked；整页 execution boundary 不满足 | draft/ready/terminal、evidence/risk Flags | Submit/Cancel/Archive Dialog；execution 永不出现 |
| `A-05` | `A.ORDER.TRACE.*` | 3 | Order Trace Search | Trace found 使用完整结果构图；not_found 使用整页结果状态 | 各阶段证据、ID、状态和链接 | 高敏证据详情 Drawer |
| `A-06` | `A.WITHDRAWAL.*` | 5 | Withdrawal Review Queue | 选中 requested/approved/marked_paid 时使用完整 Detail Region；整页冲突时升级 | rejected/cancelled 行状态、审计历史 | Approve/Reject/Mark-paid Dialog，显示非 Provider 边界 |
| `A-07` | Refund/Reverse/Complaint/Repair/Liability/Compensation | 18 | Aftersale Workbench | Complaint waiting_customer/resolved/closed/rejected；Refund approved；关键 409 冲突 | Queue、选中详情、Reverse/Repair/Liability/Intent 时间线 | Review Refund/Reverse、Assign Repair、Decide Liability、Compensation Dialog |
| `A-08` | `A.ENTERPRISE.*` | 10 | Enterprise Client List + Detail | Client suspended/closed 阻断全客户操作；Credential one-time secret result | Credentials、prices、subscriptions、deliveries、bills 的 Tab/Panel | Create/Revoke Credential、Price、Webhook、Issue Bill Dialog；Secret 创建结果持久区 |
| `A-09` | `A.DISPATCH.*` | 11 | Dispatch Board | 选中 no_match/manual_review/failed/rejected 的任务进入完整诊断 Detail Region；整板失败升级 | pending/queued/offering/accepted/reassigning/timeout/completed/cancelled 行状态、候选与 reason | Retry Match / Manual Action Dialog；不展示精确位置 |
| `A-10` | Order/Catalog Operations、Certification | 6 | Platform Operations | Certification pending 进入审核详情；approved/rejected/expired 为持久结果 | Order/SKU 列表、Certification history | Approve/Reject Certification Dialog |
| `A-11` | Support Workbench/Ticket/Conversation/Routing/Knowledge | 10 | Support Three-column Workbench | Ticket escalated/SLA breached；Conversation active 是独立工作模式；整页 scope error | 队列、Ticket Detail、消息、SLA、Routing、Knowledge Panel | Claim/Assign/Resolve/Transfer/Close Dialog；配置和知识编辑 Drawer |
| `A-12` | `A.SUPPORT.QUALITY.*` | 2 | Support Quality Dashboard | 选中 Quality Review 使用完整 Detail Region | 指标、Rubric、抽检列表、empty/loading | Create Rubric / Submit Review Dialog |
| `A-13` | `A.REVIEW.*` | 4 | Review Moderation Queue | Appeal open 进入完整裁决 Detail Region；整页内容权限阻断 | pending/visible/hidden、resolved history、内容权限标记 | Moderate/Resolve Appeal Dialog；敏感内容 Drawer |
| `A-14` | `A.MARKETING.*`、`A.COUPON.*` | 12 | Marketing Workbench | Campaign active/terminal 的完整详情；职责分离冲突；Compensation pending | Campaign/Rule/Coupon/Grant/Compensation 的 Tab、列表、审计与金额证据 | Review/Publish/Pause/Revoke/Grant/Resolve Dialog |

### 4.1 后台固定边界

- 后台列表状态优先使用 Table Row + Selected Detail，不为每个枚举建立新 Route；
- 选中对象的风险、主动作或责任发生变化时，Detail Region 必须完整重组并独立留证；
- 无城市范围、整页无权限、整页数据冲突必须升级为 State Frame；
- Approve、Reject、Close、Mark Paid、Publish 等动作使用 Dialog，并在提交后回写持久结果；
- Drawer 只承载上下文详情，独立协作对象必须使用 Detail Frame；
- preparation、payable、queued、exported、intent、marked_paid 均不得用成功视觉暗示真实资金执行。

## 5. 全局状态组件矩阵

| Component Contract | Page Scope | Region Scope | Action Scope | 升级条件 |
| --- | --- | --- | --- | --- |
| `LoadingState` | 首屏结构占位 + `aria-busy` | 保留其他可用区域 | 按钮 submitting + 文案 | 长任务、阶段进度或结果未知时升级为持久 Region |
| `EmptyState` | 成功请求后的全页无记录 | 某列表/Panel 无记录 | N/A | Empty 代表资格、权限、城市或前置任务时升级 State Frame |
| `ApiErrorPanel` | 页面仍可安全展示旧事实 | 局部请求失败 | 动作失败且可重试 | 服务端事实失效、提交结果未知或高风险失败时升级 |
| `NotWiredState` | 主能力完全不可用 | 某局部能力未接线 | 禁用动作说明 | 主任务不可完成时升级 State Frame |
| `PermissionState` | 整页 403 | 局部字段/内容受限 | `DisabledReasonText` | 身份/账号/城市阻断时升级 GATE/State Frame |
| `ConflictState` | 整页事实版本失效 | 对象或表单冲突 | Conflict Dialog | 需要放弃本地输入或重新加载主对象时升级 |
| `ValidationState` | 多字段对象级规则错误 | Form Region | Field Error | 用户需要跨区修复时升级 Region Summary |
| `OfflineState` | 无缓存且页面不可完成 | Banner + cached data | Retry action | Mutation 结果未知时升级持久 Result Region |
| `DuplicateState` | 显示既有业务结果 | Inline existing-result | 防止再次提交 | 既有结果是支付/退款/提现等关键证据时升级 State Frame |
| `PartialResultState` | 批量或多对象结果 | 逐项 outcome | Retry failed subset | 资金、责任或跨端交接分叉时升级 State Frame |
| `HandoffState` | 本端主要任务转为等待 | Region 显示接收角色 | N/A | 跨端责任已改变主任务时升级 State Frame |
| `ResultState` | 关键成功/失败/关闭结果 | 非关键保存结果 | Toast 仅补充 | 需要留证、恢复或客服引用时升级 State Frame |

## 6. Figma 与代码映射

| 设计节点 | Figma 形式 | 代码基线 |
| --- | --- | --- |
| `GATE` | 独立 Frame，描述包含 Slice ID | App/Auth/Shell Gate |
| `FRAME` | Carrier Base Frame | `MobileShell` / `AdminShell` / Route Template |
| `STATE_FRAME` | Carrier 下独立 State Frame | 同 Route 的完整状态构图 |
| `REGION` | Component Instance / Section / Panel | Card、Table、Timeline、Detail Panel |
| `OVERLAY` | Component Set Variant / Overlay Frame | BottomSheet、Modal、Drawer |
| `STATE_COMPONENT` | Shared Component Set | LoadingState、EmptyState、ApiErrorPanel、NotWiredState 等 |
| `MICRO_VARIANT` | Variant Property | StatusTag、StateBadge、Button enabled/disabled、tone |

## 7. 矩阵验收

- [x] 36 个 Carrier 各有一个 Base Frame；
- [x] 214 条切片全部且仅映射到一个 Carrier；
- [x] 每个 Carrier 的 State Frame 与 Region 边界明确；
- [x] 每个高风险动作都有从属 Overlay 和持久结果位置；
- [x] 所有全局状态都能按 scope 升级或降级；
- [x] Supporting Frame 不凭空增加 Slice ID；
- [x] Toast、Tag、disabled 和颜色不独自承担业务结果；
- [x] Figma 与代码节点都能追溯 Carrier ID / Slice ID。
