# XLB 三端全量切片范围基线

## 1. 基线结论

阶段二“二、三端全量切片范围”的正式范围如下：

| 项目 | 基线值 |
| --- | ---: |
| 正式纵向切片 | 214 |
| 顾客端切片 | 62 |
| 师傅端切片 | 54 |
| 后台切片 | 98 |
| 承载容器 | 36 |
| 全局守卫切片 | 3 |
| 已接通事实链 `BOUND` | 183 |
| 部分接通 `PARTIAL` | 19 |
| 正式范围内 UI 缺口 `UI_GAP` | 9 |
| 核心跨端交接 | 20 |

基线版本：`XLB-SCOPE-V1`

基线日期：2026-07-17

输入总账：[SLICE_LEDGER.md](./SLICE_LEDGER.md)

切片标准：[SLICE_CONTRACT_STANDARD.md](./SLICE_CONTRACT_STANDARD.md)

**范围决议：总账中的 214 条候选切片全部纳入正式三端范围，0 条删除。** 其中 `PARTIAL` 与 `UI_GAP` 是施工状态，不是排除理由。

## 2. 范围口径

### 2.1 三个不同数量

后续设计和排期必须区分：

1. **业务切片数：214**。代表角色、目标、状态、动作和交接发生实质变化的产品场景。
2. **承载容器数：36**。代表 Route、App Gate、Workbench、Detail Surface 等稳定的信息架构容器。
3. **Figma Frame 数：由后续 Frame Map 确定**。阶段三只锁定画面与组件边界：36 个 Carrier 各有一个 Base Frame，需要升级的业务状态使用 State Frame，其余使用 Panel、Dialog、Drawer、Bottom Sheet 或 Component Variant。

因此，不得把“214 条切片”机械理解为“214 个路由”或“214 张等尺寸画板”。

### 2.2 范围状态

| 状态 | 是否在正式范围 | 阶段二解释 |
| --- | --- | --- |
| `BOUND` | 是 | 进入设计时可以直接绑定现有事实链，但仍需完成单片合同和视觉验收。 |
| `PARTIAL` | 是 | 必须保留画面位置，并明确缺少的读状态、反馈或恢复动作。 |
| `UI_GAP` | 是 | 后端事实已经存在，正式设计必须补画，不得降级为未来设想。 |
| `CROSS_CUTTING` | 是 | 作为 App/Shell 守卫继承到所有相关业务切片，不重复绘制成普通内容页。 |

### 2.3 优先级

| 优先级 | 定义 |
| --- | --- |
| `P0` | 核心交易、认证权限、履约、售后安全、资金准备或跨端责任闭环；缺失会使主要业务不可完成或产生误导。 |
| `P1` | 信誉、通知、客服增强、账户管理和治理效率；主要交易可运行，但体验或运营闭环不完整。 |
| `P2` | 增长、企业运营和营销治理；不阻断基础到家服务主链。 |

正式优先级分布：

| 端 | `P0` | `P1` | `P2` | 合计 |
| --- | ---: | ---: | ---: | ---: |
| 顾客端 | 41 | 17 | 4 | 62 |
| 师傅端 | 33 | 21 | 0 | 54 |
| 后台 | 68 | 8 | 22 | 98 |
| 合计 | 142 | 46 | 26 | 214 |

优先级只决定设计施工顺序，不改变切片是否在范围内。

## 3. 顾客端正式范围

顾客端采用移动端 App Shell。正式范围为 62 条切片、10 个承载容器，其中 9 个为现有 Route，1 个为全局身份守卫。

| Carrier ID | Route / 容器 | Slice ID 覆盖 | 数量 | 优先级 | 默认表达 | 范围决议 |
| --- | --- | --- | ---: | --- | --- | --- |
| `C-00` | Customer App 身份守卫 | `C.AUTH.*` | 1 | `P0` | App Gate / Full-state | 失效后保留原目标地址，认证成功返回原切片。 |
| `C-01` | `/customer/` | `C.CATALOG.HOME.*` | 2 | `P0` | Full Frame + Empty Variant | 首页只展示真实 Catalog 事实。 |
| `C-02` | `/customer/services` | `C.CATALOG.BROWSE.*`、`C.CATALOG.SEARCH.*` | 2 | `P0` | Full Frame + Result Variant | 搜索与分类是同一服务浏览容器。 |
| `C-03` | `/customer/order/create` | `C.ORDER.CREATE.*`、`C.ORDER.QUOTE.*`、`C.COUPON.SELECT.*` | 6 | `P0` | Form Frame + Quote Panel + Sheet | 报价变化、优惠失效和提交结果在同一创建上下文中表达。 |
| `C-04` | `/customer/orders` | `C.ORDER.DETAIL.*`、`C.CONFIRMATION.*`、`C.PAYMENT.*`、`C.REVIEW.*`、`C.REFUND.*` | 20 | `P0` | List/Detail Frame + Action Sheet/Dialog | 列表是聚合容器，不新增业务状态；详情按后端状态切换动作。 |
| `C-05` | `/customer/aftersale` | `C.AFTERSALE.*` | 10 | `P0` | List/Detail Frame + Timeline | 逆向申请、投诉和恢复动作在统一售后上下文中完成。 |
| `C-06` | `/customer/support` | `C.SUPPORT.*` | 9 | `P1` | Hub + Ticket Detail + Conversation | 工单和实时会话共享入口，但保留各自状态机。 |
| `C-07` | `/customer/notifications` | `C.NOTIFICATION.*` | 3 | `P1` | Inbox Frame + Archive Tab | 通知必须跳转到真实业务引用。 |
| `C-08` | `/customer/coupons` | `C.COUPON.WALLET.*` | 4 | `P2` | Wallet Frame + Status Variant | 使用动作交接到下单容器，不在券包内创建订单事实。 |
| `C-09` | `/customer/profile` | `C.PROFILE.*`、`C.ADDRESS.*` | 5 | `P1` | Profile Frame + Edit Sheet/Dialog | 地址删除必须有确认场景；身份事实来自会话/API。 |

### 3.1 顾客端必须完整画出的状态

以下状态不能只靠一个 Tag 或 Toast 表达，至少需要完整状态区域或完整画面：

- 报价已失效，需要重新报价；
- 订单等待派单、服务完成、已取消；
- 顾客待确认、已确认、已争议；
- 支付 pending、paid、failed、closed；
- 退款 requested、approved；
- 投诉 waiting_customer、resolved、rejected；
- 评价 hidden 与申诉 open/结果；
- 身份失效且需要恢复原任务。

## 4. 师傅端正式范围

师傅端采用移动工作台。正式范围为 54 条切片、11 个承载容器。`/worker/tasks` 是任务聚合列表，业务状态由详情切片承载，因此不新增 Slice ID。

| Carrier ID | Route / 容器 | Slice ID 覆盖 | 数量 | 优先级 | 默认表达 | 范围决议 |
| --- | --- | --- | ---: | --- | --- | --- |
| `W-00` | Worker App Auth / Access Gate | `W.AUTH.*`、`W.PROFILE.ACCESS.*` | 4 | `P0` | Login Frame + Blocked Full-state | suspended/disabled 不得回落到普通空状态。 |
| `W-01` | `/worker/` | `W.TASK_POOL.*`、`W.DISPATCH.*` | 8 | `P0` | Hall Frame + Offer Sheet | 在线、暂停、资格阻断和报价倒计时均在抢单上下文表达。 |
| `W-02` | `/worker/tasks` | 聚合 `W.FULFILLMENT.*` 状态摘要 | 0 | `P0` | Supporting List Frame | 只负责筛选和进入详情，不创造新的业务状态。 |
| `W-03` | `/worker/tasks/:id` | `W.FULFILLMENT.*`、`W.CONFIRMATION.*` | 9 | `P0` | Detail Frame + Evidence Panel + Action Dock | 开始、证据、完成和顾客确认形成一个履约闭环。 |
| `W-04` | `/worker/repairs` | `W.REPAIR.*` | 4 | `P0` | List/Detail Frame | 返工任务与普通履约必须在视觉上区分责任来源。 |
| `W-05` | `/worker/wallet` | `W.FINANCE.*`、`W.BANK_ACCOUNT.*`、`W.WITHDRAWAL.*` | 10 | `P1` | Wallet Frame + Account/Request Sheet | 余额、调整、申请、审批和 marked-paid 分层表达。 |
| `W-06` | `/worker/support` | `W.SUPPORT.*` | 4 | `P1` | Hub + Ticket/Conversation Detail | 任务、提现和账号问题保留来源上下文。 |
| `W-07` | `/worker/notifications` | `W.NOTIFICATION.*` | 2 | `P1` | Inbox Frame | 通知动作返回真实任务、财务或客服对象。 |
| `W-08` | `/worker/reputation` | `W.REPUTATION.*`、`W.REVIEW.*` | 5 | `P1` | Reputation Frame + Appeal Sheet | 评分汇总与可申诉目标均来自投影/API。 |
| `W-09` | `/worker/profile` | `W.LOCATION.*` | 3 | `P0` | Profile/Location Frame | exact location 保持私密；stale/disabled 必须说明接单影响。 |
| `W-10` | `/worker/certification` | `W.CERTIFICATION.*` | 5 | `P0` | Apply Frame + Review-result Full-state | pending、approved、rejected、expired 都在正式范围。 |

### 4.1 师傅端必须完整画出的状态

- 未认证、账号 suspended、账号 disabled；
- 抢单暂停、资格 blocked、Offer timeout/cancelled；
- 履约 accepted、in_progress、completed、cancelled；
- 证据缺失、证据已保存；
- 顾客 disputed；
- 返工 assigned、in_progress、completed/cancelled；
- 提现 requested、approved、rejected、marked_paid；
- 认证 pending、approved、rejected、expired；
- 位置 stale、共享关闭。

## 5. 后台正式范围

后台采用桌面工作台。正式范围为 98 条切片、15 个承载容器，其中 14 个为当前 Hash View，1 个为全局身份/城市守卫。

| Carrier ID | Route / 容器 | Slice ID 覆盖 | 数量 | 优先级 | 默认表达 | 范围决议 |
| --- | --- | --- | ---: | --- | --- | --- |
| `A-00` | Admin Shell Auth / City Gate | `A.AUTH.*`、`A.SCOPE.*` | 2 | `P0` | Shell Guard / Full-state | 所有后台动作继承身份、城市、权限和审计。 |
| `A-01` | `#/settlement-ops` | `A.SETTLEMENT.BATCH.*`、`A.SETTLEMENT.PAYABLE.*`、`A.SETTLEMENT.QUEUE.*`、`A.SETTLEMENT.RECONCILIATION.*` | 7 | `P0` | Dashboard + Dense Table + Gap Panel | preparation/readiness 不得表达为付款完成。 |
| `A-02` | `#/settlement-ops/statements/:id` | `A.SETTLEMENT.STATEMENT.*` | 3 | `P0` | Statement Detail + Review Dialog | created、approved、rejected 保留审计差异。 |
| `A-03` | `#/settlement-ops/exports` | `A.SETTLEMENT.EXPORT.*` | 1 | `P0` | Export Review Table/Detail | 表达内部归档与哈希证据，不表达支付指令。 |
| `A-04` | `#/settlement-ops/governance` | `A.GOVERNANCE.*` | 4 | `P1` | Governance Workbench | executionEnabled=false 必须常驻可见。 |
| `A-05` | `#/order-trace` | `A.ORDER.TRACE.*` | 3 | `P0` | Search + Trace Detail | 聚合事实只读，链接到责任工作台。 |
| `A-06` | `#/worker-withdrawals` | `A.WITHDRAWAL.*` | 5 | `P0` | Review Queue + Confirm Dialog | marked_paid 只是后台标记，不是银行回执。 |
| `A-07` | `#/aftersale` | `A.REFUND.*`、`A.REVERSE.*`、`A.COMPLAINT.*`、`A.REPAIR.*`、`A.LIABILITY.*`、`A.COMPENSATION.*` | 18 | `P0` | Queue + Split Detail + Timeline + Dialog | 退款审核 UI 缺口在此容器补齐，不新建第四套售后入口。 |
| `A-08` | `#/enterprise` | `A.ENTERPRISE.*` | 10 | `P2` | Client List + Settings Detail | Secret 仅创建时展示；账单 issued 不等于收款。 |
| `A-09` | `#/dispatch` | `A.DISPATCH.*` | 11 | `P0` | Dispatch Board + Candidate/Reason Panel | no_match、manual_review、failed 等必须保留真实 reason。 |
| `A-10` | `#/platform-operations` | `A.ORDER.OPERATIONS.*`、`A.CATALOG.OPERATIONS.*`、`A.CERTIFICATION.*` | 6 | `P0` | Operations Dashboard + Review Table | 认证审核与师傅端结果形成交接。 |
| `A-11` | `#/support` | `A.SUPPORT.WORKBENCH.*`、`A.SUPPORT.TICKET.*`、`A.SUPPORT.CONVERSATION.*`、`A.SUPPORT.ROUTING.*`、`A.SUPPORT.KNOWLEDGE.*` | 10 | `P0` | Three-column Workbench + Config/KB Panel | 队列、实时会话、SLA 和内部知识权限分层。 |
| `A-12` | `#/support-quality` | `A.SUPPORT.QUALITY.*` | 2 | `P0` | Metrics + Review Detail | 只显示 API 指标，不填充演示经营数字。 |
| `A-13` | `#/review-moderation` | `A.REVIEW.*` | 4 | `P1` | Moderation Queue + Appeal Detail | 内容权限、版本冲突和裁决审计必须可见。 |
| `A-14` | `#/marketing` | `A.MARKETING.*`、`A.COUPON.*` | 12 | `P2` | Campaign Workbench + Rule/Coupon Detail | 金额使用 CNY 分；保留复核/发布职责分离。 |

### 5.1 后台必须完整画出的状态

- 无城市范围、无操作权限、409 版本冲突；
- Dispatch no_match、manual_review、timeout/expired、failed/rejected；
- Refund requested/approved；
- Complaint waiting_customer、resolved、closed/rejected；
- Withdrawal requested、approved、rejected、marked_paid；
- Settlement prepared、confirmed、cancelled、gap_found；
- Governance blocked 与 execution disabled；
- Webhook retry_wait、dead_letter；
- Support escalated/SLA breached；
- Review pending moderation 与 Appeal open；
- Marketing draft/reviewed/published、职责分离冲突。

## 6. 跨端闭环范围

20 条核心交接全部纳入范围。设计时按以下 6 条主链组织，而不是按三个端分别孤立作图。

| Chain ID | 主链 | 涉及端 | 必须闭环的关键节点 | 施工优先级 |
| --- | --- | --- | --- | --- |
| `X-01` | 下单与派单 | 顾客 → 后台/系统 → 师傅 | quote → order.created → queued/offering → accepted | `P0` |
| `X-02` | 履约与顾客确认 | 师傅 → 顾客 | accepted → in_progress → evidence → completed → pending confirmation → confirmed/disputed | `P0` |
| `X-03` | 支付、评价与退款 | 顾客 → 后台/账务 → 师傅 | payment paid → review/refund request → approval → receivable adjustment | `P0` |
| `X-04` | 售后与返工 | 顾客 → 后台 → 师傅 → 顾客 | reverse/complaint → triage → repair/liability/intent → repair completed → resolved | `P0` |
| `X-05` | 师傅资格与财务 | 师傅 → 后台 → 师傅 | certification/withdrawal request → review → result → eligibility/wallet update | `P0` |
| `X-06` | 客服、评价申诉与通知 | 顾客/师傅 → 后台 → 顾客/师傅 | ticket/conversation/appeal → claim/review/resolve → notification/result | `P1` |

每条主链必须同时设计：发送端提交反馈、后台/系统处理中状态、接收端待办、最终结果和超时/冲突恢复。

## 7. 表达层级决议

| 条件 | 正式表达层级 |
| --- | --- |
| 用户目标、主动作、责任角色或下一交接改变 | 新 Full Frame 或同一容器的完整 State Frame。 |
| 后台同一对象内查看不同证据，不改变主任务 | Detail Panel / Drawer / Tab。 |
| 高风险确认、不可直接撤销动作、补充少量信息 | Dialog / Bottom Sheet。 |
| loading、empty、401、403、409、422、离线、重复提交 | State Variant；若改变责任或恢复路径则升级为完整 State Frame。 |
| 颜色、标签、按钮 enable/disable、倒计时表现 | Component Variant，不增加业务切片。 |
| 列表仅汇总多个已有对象状态 | Supporting Frame，不新增业务切片。 |

## 8. 正式排除范围

以下内容不属于三端 UI 切片范围：

- 无人类阅读或决策的 Outbox、Projection Worker、Replay、Stream Consumer、定时扫描内部步骤；
- 当前契约不存在的真实微信/支付宝、银行打款、真实 Provider 成功或到账画面；
- 正式服务类目、价格、师傅、收入、经营指标和成功数据的虚构示例；
- 把外部企业 OpenAPI 使用方扩展成第四个产品端；企业能力只覆盖现有后台管理面；
- 仅因 Figma 中存在画板而新增的状态、权限或页面；
- 开发专用 debug OTP、timeout simulation、mock execution 控件作为正式产品切片；
- 为每个状态建立独立 Route；Route 数量由信息架构决定，不由状态枚举决定。

## 9. UI 缺口的正式归属

9 条 `UI_GAP` 均已分配承载容器：

| UI Gap | 正式 Carrier | 设计要求 |
| --- | --- | --- |
| `C.PAYMENT.RESULT.CLOSED` | `C-04` | 在订单详情中提供关闭原因和可用下一步。 |
| `C.REFUND.REQUEST.APPROVED` | `C-04` | 区分“已批准”和“外部到账”；展示审批事实。 |
| `W.PROFILE.ACCESS.SUSPENDED` | `W-00` | 专用阻断状态和客服入口。 |
| `W.PROFILE.ACCESS.DISABLED` | `W-00` | 专用停用状态，不进入任务大厅。 |
| `W.CERTIFICATION.STATUS.APPROVED` | `W-10` | 展示审核事实，并返回后端资格重算。 |
| `W.CERTIFICATION.STATUS.REJECTED` | `W-10` | 展示真实拒绝原因和后端允许的下一步。 |
| `W.CERTIFICATION.STATUS.EXPIRED` | `W-10` | 明确过期对接单资格的影响。 |
| `A.REFUND.REVIEW.REQUESTED` | `A-07` | 在售后工作台增加退款审核队列/详情。 |
| `A.REFUND.REVIEW.APPROVED` | `A-07` | 展示审批、Ledger/应收调整和非 Provider 执行边界。 |

## 10. 施工批次

| Batch | 范围 | Carrier | 目标 |
| --- | --- | --- | --- |
| `B0` | 全局基础 | `C-00`、`W-00`、`A-00` | 锁定 Shell、身份、城市、权限、错误恢复和跨端状态语言。 |
| `B1` | 订单交易主链 | `C-01`～`C-04`、`W-01`～`W-03`、`A-05`、`A-09`、`A-10` | 完成发现、报价、下单、派单、履约、确认和支付闭环。 |
| `B2` | 售后与退款 | `C-05`、`W-04`、`A-07` | 完成逆向、投诉、退款、返工、定责和补偿意向。 |
| `B3` | 信任与沟通 | `C-06`、`C-07`、`W-06`～`W-08`、`A-11`～`A-13` | 完成客服、通知、评价、申诉和质量闭环。 |
| `B4` | 师傅资料与财务治理 | `C-09`、`W-05`、`W-09`、`W-10`、`A-01`～`A-04`、`A-06` | 完成位置、认证、钱包、提现、结算和治理边界。 |
| `B5` | 增长与企业运营 | `C-08`、`A-08`、`A-14` | 完成优惠券、营销和企业客户管理。 |

批次是设计依赖顺序，不是发布承诺。每个批次仍需为其切片填写 Slice Contract 后才能进入 Figma 画面施工。

## 11. Scope Definition of Done

阶段二只有满足以下条件才可关闭：

- [x] 三端所有候选 Slice ID 均有明确纳入/排除决定；
- [x] 三端切片数量与总账一致，Slice ID 无重复；
- [x] 每个切片有稳定 Carrier 归属或全局守卫归属；
- [x] 业务切片、承载容器和 Figma Frame 三个数量概念已分离；
- [x] 9 个 UI 缺口都有正式承载位置；
- [x] 20 条核心交接已归入跨端主链；
- [x] P0/P1/P2 和 B0～B5 施工顺序已确定；
- [x] 系统内部步骤、真实 Provider 和第四端等排除项明确；
- [x] 未生成任何未经业务事实证明的正式服务类目或成功状态；
- [x] 下一阶段可按 Carrier 和 Batch 建立 Slice Contract / Figma Frame Map。
