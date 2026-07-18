# XLB 三端纵向切片总账

## 1. 总账定位

本总账是 [SLICE_CONTRACT_STANDARD.md](./SLICE_CONTRACT_STANDARD.md) 的实例目录，属于“每个切片的标准定义”范围。

- 标准回答：什么是一个合格切片、如何拆分、如何验收；
- 总账回答：当前产品有哪些切片、由什么事实证明、跨端如何交接、哪些 UI 尚缺；
- 单片合同回答：某一个切片的完整进入条件、事实、动作、异常和验收证据。

总账只登记当前代码、共享类型、状态机、API Client 和现有页面能够证明的业务。Figma 与历史 PNG 只用于后续视觉设计，不用于增加状态、权限、金额或正式服务类目。

## 2. 登记口径

### 2.1 场景状态

| 标记 | 含义 |
| --- | --- |
| `BOUND` | 当前已有页面或页面区域，并已连接对应 API/共享契约。仍需单片合同和视觉 QA 才能达到最终完成。 |
| `PARTIAL` | 页面或 API 已存在，但缺少独立画面、完整读取、某些业务状态或恢复动作。 |
| `UI_GAP` | 后端契约或状态机已存在，当前三端没有完整产品场景。 |
| `CROSS_CUTTING` | 登录失效、权限、城市范围等跨页面守卫；必须在所有相关切片中继承。 |

`BOUND` 不等于已经完成产品设计；它只表示事实链已经接通。视觉完成度由 Slice Contract 的 Definition of Done 判断。

### 2.2 本账不重复登记的状态

每个业务切片默认继承标准中的全局状态包：`loading`、`empty`、`offline/timeout`、`401`、`403`、`409`、`422`、重复提交、部分成功和未知错误。只有当异常会改变业务责任、主动作或跨端交接时，才在总账中单列为恢复切片。

### 2.3 事实源代码

| 代码 | 事实源 |
| --- | --- |
| `ROUTE` | `apps/customer`、`apps/worker`、`apps/admin` 当前路由和页面。 |
| `TYPE` | `packages/types` 中的共享状态、实体与动作语义。 |
| `API` | `@xlb/api-client` 与后端 routes/service。 |
| `SM` | 后端状态机、权限和幂等约束。 |
| `CARD` | `docs/design/ui/phase25/page-cards`，仅作既有页面范围参考。 |

### 2.4 当前盘点快照

盘点日期：2026-07-17。切片数量统计只覆盖下方三端业务表，不包含跨端交接表中的重复引用。

| 端 | 总数 | `BOUND` | `PARTIAL` | `UI_GAP` | `CROSS_CUTTING` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 顾客端 | 62 | 53 | 6 | 2 | 1 |
| 师傅端 | 54 | 37 | 12 | 5 | 0 |
| 后台 | 98 | 93 | 1 | 2 | 2 |
| 合计 | 214 | 183 | 19 | 9 | 3 |

## 3. 顾客端切片

顾客端视口基线为移动端。订单、金额、优惠、支付结果、师傅状态和售后结果均由 API 返回，不由客户端推断。

| Slice ID | 场景 / 用户目标 | 权威状态或进入条件 | 主动作 / 交接 | 当前状态 | 事实源 |
| --- | --- | --- | --- | --- | --- |
| `C.AUTH.SESSION.REQUIRED` | 识别会话失效并安全返回认证 | 缺少、无效或过期 Customer 身份 | 重新认证；成功后返回原切片 | `CROSS_CUTTING` | API |
| `C.CATALOG.HOME.AVAILABLE` | 从首页发现当前城市可用服务 | Catalog 有真实分类和 SKU | 搜索、选择城市、进入服务或下单 | `BOUND` | ROUTE, API, CARD |
| `C.CATALOG.HOME.EMPTY` | 理解当前城市暂无可展示内容 | Catalog 返回空集合 | 更换城市或重试 | `BOUND` | ROUTE, API, CARD |
| `C.CATALOG.BROWSE.AVAILABLE` | 浏览和筛选真实 SKU | Catalog 加载成功 | 分类筛选、搜索、选择 SKU | `BOUND` | ROUTE, API, CARD |
| `C.CATALOG.SEARCH.NO_RESULT` | 从无结果中恢复 | Catalog 成功但筛选结果为空 | 清除筛选或修改搜索词 | `BOUND` | ROUTE, CARD |
| `C.ORDER.CREATE.INPUT` | 填写数量、地址和预约时间 | 已选真实 SKU；表单尚未形成有效报价请求 | 修改输入、选择地址、请求报价 | `BOUND` | ROUTE, API, CARD |
| `C.ORDER.QUOTE.READY` | 核对权威价格与服务标准 | Quote API 返回有效快照 | 确认并创建订单；可返回修改 | `BOUND` | TYPE, API, CARD |
| `C.ORDER.QUOTE.INVALIDATED` | 处理报价过期或输入变化 | 报价不再匹配当前输入或优惠决策 | 重新报价，不允许沿用旧金额 | `PARTIAL` | TYPE, API |
| `C.COUPON.SELECT.AVAILABLE` | 在下单前选择可用优惠券 | Coupon Grant=`available` 且满足报价条件 | 选择并重新计算报价 | `BOUND` | ROUTE, TYPE, API |
| `C.COUPON.SELECT.INELIGIBLE` | 理解优惠券不可用原因 | 优惠决策 rejected/expired 或规则不匹配 | 更换优惠券或无券下单 | `PARTIAL` | TYPE, API |
| `C.ORDER.CREATE.PENDING_DISPATCH` | 确认订单已创建并等待派单 | Order=`pending_dispatch` | 查看订单；交接给派单系统和师傅端 | `BOUND` | TYPE, API, SM |
| `C.ORDER.DETAIL.PENDING_DISPATCH` | 查看等待师傅的订单 | Order=`pending_dispatch` | 查看进度；按后端允许发起改单/取消 | `BOUND` | ROUTE, TYPE, API |
| `C.ORDER.DETAIL.SERVICE_COMPLETED` | 核对师傅已完成服务 | Order=`service_completed` | 进入确认与支付相关动作 | `BOUND` | ROUTE, TYPE, SM |
| `C.CONFIRMATION.DETAIL.PENDING` | 确认服务结果或提出异议 | Customer Confirmation=`pending` | 确认或争议；交接支付或售后 | `BOUND` | ROUTE, TYPE, API, SM |
| `C.CONFIRMATION.DETAIL.CONFIRMED` | 看见已确认的不可误解结果 | Customer Confirmation=`confirmed` | 按后端条件进入支付 | `BOUND` | ROUTE, TYPE, SM |
| `C.CONFIRMATION.DETAIL.DISPUTED` | 跟进服务争议 | Customer Confirmation=`disputed` | 进入售后投诉/客服；交接后台 | `BOUND` | ROUTE, TYPE, SM |
| `C.PAYMENT.CHECKOUT.PENDING` | 发起并等待支付处理 | Payment=`pending`；当前 Provider=`mock` | 提交支付、等待回调或重试查询 | `BOUND` | ROUTE, TYPE, API |
| `C.PAYMENT.RESULT.PAID` | 获得可核验的支付成功结果 | Payment=`paid` 且 Order=`paid` | 查看订单、评价、符合条件时申请退款 | `BOUND` | ROUTE, TYPE, API, SM |
| `C.PAYMENT.RESULT.FAILED` | 从支付失败恢复 | Payment=`failed` | 查看原因并按 API 允许重试 | `PARTIAL` | TYPE, API |
| `C.PAYMENT.RESULT.CLOSED` | 理解支付单已关闭 | Payment=`closed` | 返回订单并重新判断可用动作 | `UI_GAP` | TYPE, API |
| `C.ORDER.DETAIL.CANCELLED` | 查看订单取消结果 | Order=`cancelled` | 查看取消/优惠补偿事实；不再支付 | `BOUND` | ROUTE, TYPE, SM |
| `C.REVIEW.CREATE.ELIGIBLE` | 对已完成订单提交评价 | 后端确认订单、履约和身份满足条件 | 提交评分与评论 | `BOUND` | ROUTE, TYPE, API |
| `C.REVIEW.DETAIL.PENDING_MODERATION` | 理解评价正在审核 | Review Visibility=`pending_moderation` | 等待审核 | `BOUND` | ROUTE, TYPE, API |
| `C.REVIEW.DETAIL.VISIBLE` | 查看已公开评价 | Review Visibility=`visible` | 查看；按条件发起申诉 | `BOUND` | ROUTE, TYPE, API |
| `C.REVIEW.DETAIL.HIDDEN` | 理解评价被隐藏及可申诉范围 | Review Visibility=`hidden` | 发起申诉 | `BOUND` | ROUTE, TYPE, API |
| `C.REVIEW.APPEAL.OPEN` | 跟进或撤回评价申诉 | Appeal=`open` | 撤回；等待后台裁决 | `BOUND` | ROUTE, TYPE, API |
| `C.REVIEW.APPEAL.UPHELD` | 查看申诉成立结果 | Appeal=`upheld` | 查看结果，无重复提交 | `BOUND` | ROUTE, TYPE |
| `C.REVIEW.APPEAL.REJECTED` | 查看申诉驳回结果 | Appeal=`rejected` | 查看原因 | `BOUND` | ROUTE, TYPE |
| `C.REVIEW.APPEAL.WITHDRAWN` | 查看已撤回申诉 | Appeal=`withdrawn` | 返回评价详情 | `BOUND` | ROUTE, TYPE |
| `C.REFUND.REQUEST.REQUESTED` | 确认退款申请已登记 | Refund=`requested` | 查看申请；交接后台审批 | `BOUND` | ROUTE, TYPE, API |
| `C.REFUND.REQUEST.APPROVED` | 查看退款获批事实 | Refund=`approved` | 查看审批结果；不得虚构 Provider 到账 | `UI_GAP` | TYPE, API |
| `C.AFTERSALE.REVERSE.REQUESTED` | 跟进取消、改期或改派申请 | Reverse=`requested` | 查看申请；交接后台审批 | `BOUND` | ROUTE, TYPE, API |
| `C.AFTERSALE.REVERSE.APPROVED` | 查看逆向申请获批 | Reverse=`approved` | 等待系统应用 | `BOUND` | ROUTE, TYPE, SM |
| `C.AFTERSALE.REVERSE.REJECTED` | 查看逆向申请被拒 | Reverse=`rejected` | 查看原因或转客服 | `BOUND` | ROUTE, TYPE, SM |
| `C.AFTERSALE.REVERSE.APPLIED` | 查看逆向变更已生效 | Reverse=`applied` | 查看新订单事实或取消结果 | `BOUND` | ROUTE, TYPE, SM |
| `C.AFTERSALE.COMPLAINT.SUBMITTED` | 确认投诉已提交 | Complaint=`submitted` | 查看进度；交接后台分诊 | `BOUND` | ROUTE, TYPE, API |
| `C.AFTERSALE.COMPLAINT.IN_PROGRESS` | 跟进已分诊或处理中投诉 | Complaint=`triaged`/`in_progress` | 补充信息、查看时间线 | `BOUND` | ROUTE, TYPE, API |
| `C.AFTERSALE.COMPLAINT.WAITING_CUSTOMER` | 回应后台补充要求 | Complaint=`waiting_customer` | 补充说明或证据 | `PARTIAL` | ROUTE, TYPE, API |
| `C.AFTERSALE.COMPLAINT.RESOLVED` | 核对投诉解决方案 | Complaint=`resolved` | 查看责任、返工或补偿意向 | `BOUND` | ROUTE, TYPE, API |
| `C.AFTERSALE.COMPLAINT.CLOSED` | 查看售后闭环记录 | Complaint=`closed` | 查看时间线或转客服 | `BOUND` | ROUTE, TYPE |
| `C.AFTERSALE.COMPLAINT.REJECTED` | 查看投诉不受理结果 | Complaint=`rejected` | 查看理由或转客服 | `PARTIAL` | TYPE, API |
| `C.SUPPORT.TICKET.OPEN` | 创建和跟进客服工单 | Ticket=`open`/`processing` | 评论、查看分派和 SLA 事实 | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.TICKET.WAITING_REQUESTER` | 回应客服补充请求 | Ticket=`waiting_requester` | 添加评论或资料 | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.TICKET.ESCALATED` | 理解工单已升级 | Ticket=`escalated` | 查看进度，不推断处理人 | `BOUND` | ROUTE, TYPE |
| `C.SUPPORT.TICKET.RESOLVED` | 查看客服解决结果 | Ticket=`resolved` | 重新打开或等待关闭 | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.TICKET.CLOSED` | 对已关闭工单评价 | Ticket=`closed` | 提交 CSAT | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.CONVERSATION.QUEUEING` | 等待在线客服接入 | Conversation=`queueing` | 等待或发送允许的消息 | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.CONVERSATION.ACTIVE` | 与客服持续沟通 | Conversation=`active` | 发送消息、读取增量消息 | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.CONVERSATION.TRANSFERRED` | 理解会话已转接 | Conversation=`transferred` | 继续沟通并保留历史 | `BOUND` | ROUTE, TYPE, API |
| `C.SUPPORT.CONVERSATION.CLOSED` | 查看会话关闭状态 | Conversation=`closed` | 返回工单或新建会话 | `BOUND` | ROUTE, TYPE |
| `C.NOTIFICATION.INBOX.UNREAD` | 查看未读业务通知 | 收件箱存在 unread item | 打开业务对象并标记已读 | `BOUND` | ROUTE, TYPE, API |
| `C.NOTIFICATION.INBOX.READ` | 浏览已读通知 | 收件箱 item 已读 | 打开引用对象或归档 | `BOUND` | ROUTE, TYPE, API |
| `C.NOTIFICATION.ARCHIVE.ARCHIVED` | 查看归档通知 | Inbox View=`archive` | 恢复查看关联对象 | `BOUND` | ROUTE, TYPE, API |
| `C.COUPON.WALLET.AVAILABLE` | 查看并使用可用券 | Grant=`available` | 进入下单并携带 Grant ID | `BOUND` | ROUTE, TYPE, API |
| `C.COUPON.WALLET.RESERVED` | 理解优惠券已被订单占用 | Grant=`reserved` | 打开关联订单 | `BOUND` | ROUTE, TYPE |
| `C.COUPON.WALLET.REDEEMED` | 查看已核销优惠券 | Grant=`redeemed` | 查看关联订单与金额证据 | `BOUND` | ROUTE, TYPE |
| `C.COUPON.WALLET.TERMINAL` | 查看已过期、释放或撤销优惠券 | Grant=`released`/`expired`/`revoked` | 查看原因，不允许继续使用 | `BOUND` | ROUTE, TYPE |
| `C.PROFILE.DETAIL.DISPLAY` | 查看真实账户与地址 | Profile/Address API 加载成功 | 编辑资料、管理地址 | `BOUND` | ROUTE, API, CARD |
| `C.PROFILE.EDIT.EDITING` | 修改展示名和默认城市 | 有效 Customer 身份 | 保存资料 | `BOUND` | ROUTE, API |
| `C.ADDRESS.EDIT.CREATING` | 新增服务地址 | 地址表单有效 | 创建地址 | `BOUND` | ROUTE, API |
| `C.ADDRESS.EDIT.UPDATING` | 修改已有地址 | 地址归属当前 Customer | 更新或取消编辑 | `BOUND` | ROUTE, API |
| `C.ADDRESS.DELETE.CONFIRMING` | 防止误删服务地址 | 地址归属当前 Customer | 确认删除或取消 | `PARTIAL` | ROUTE, API |

## 4. 师傅端切片

师傅端视口基线为移动端。资格、城市、在线状态、位置新鲜度、任务可抢性和收入均由后端决定。

| Slice ID | 场景 / 用户目标 | 权威状态或进入条件 | 主动作 / 交接 | 当前状态 | 事实源 |
| --- | --- | --- | --- | --- | --- |
| `W.AUTH.SESSION.UNAUTHENTICATED` | 完成师傅身份认证 | 缺少有效 Worker 会话 | 请求验证码并登录 | `BOUND` | ROUTE, API |
| `W.AUTH.SESSION.AUTHENTICATED` | 进入与身份匹配的工作台 | 有效 Worker 身份和城市范围 | 进入抢单大厅 | `BOUND` | ROUTE, API |
| `W.PROFILE.ACCESS.SUSPENDED` | 理解账号暂停原因 | Worker Profile=`suspended` | 联系支持，不展示可执行任务 | `UI_GAP` | TYPE, API |
| `W.PROFILE.ACCESS.DISABLED` | 理解账号已停用 | Worker Profile=`disabled` | 联系支持或退出 | `UI_GAP` | TYPE, API |
| `W.TASK_POOL.AVAILABILITY.ONLINE` | 查看当前可抢任务 | 在线、城市匹配、资格允许 | 刷新、查看 Offer、接单 | `BOUND` | ROUTE, API, CARD |
| `W.TASK_POOL.AVAILABILITY.PAUSED` | 明确当前暂停接单 | 在线状态或本地工作开关为暂停 | 恢复接单 | `BOUND` | ROUTE, CARD |
| `W.TASK_POOL.ELIGIBILITY.BLOCKED` | 理解为什么不能接单 | 认证、城市、位置或账号资格不满足 | 前往修复对应资料 | `BOUND` | TYPE, API, SM |
| `W.DISPATCH.OFFER.OFFERING` | 在时限内判断是否接单 | Offer=`offering` | 接受或拒绝 | `BOUND` | ROUTE, TYPE, API |
| `W.DISPATCH.OFFER.ACCEPTED` | 确认任务已被本人接受 | Offer=`accepted` 且 Acceptance=`accepted` | 进入履约详情；交接顾客端等待上门 | `BOUND` | TYPE, API, SM |
| `W.DISPATCH.OFFER.REJECTED` | 确认本次已拒绝 | Offer=`rejected` | 返回任务池 | `PARTIAL` | TYPE, API |
| `W.DISPATCH.OFFER.TIMEOUT` | 理解报价已超时 | Offer=`timeout` | 返回任务池，不允许继续接受 | `BOUND` | TYPE, API |
| `W.DISPATCH.OFFER.CANCELLED` | 理解报价已撤销 | Offer=`cancelled` | 返回任务池 | `PARTIAL` | TYPE, API |
| `W.FULFILLMENT.DETAIL.ACCEPTED` | 核对待开始任务 | Fulfillment=`accepted` | 开始服务 | `BOUND` | ROUTE, TYPE, API |
| `W.FULFILLMENT.DETAIL.IN_PROGRESS` | 按订单事实执行服务 | Fulfillment=`in_progress` | 上传证据、完成服务 | `BOUND` | ROUTE, TYPE, API, CARD |
| `W.FULFILLMENT.DETAIL.COMPLETED` | 查看已完成记录 | Fulfillment=`completed` | 查看证据和顾客确认状态 | `BOUND` | ROUTE, TYPE, API |
| `W.FULFILLMENT.DETAIL.CANCELLED` | 查看履约取消事实 | Fulfillment=`cancelled` | 返回任务列表或联系支持 | `PARTIAL` | TYPE, API |
| `W.FULFILLMENT.EVIDENCE.MISSING` | 理解尚缺的履约证据 | Evidence 列表为空或不满足动作要求 | 上传允许的真实文件 | `BOUND` | ROUTE, API |
| `W.FULFILLMENT.EVIDENCE.STORED` | 核验已保存证据 | Object Storage=`stored_local`/`stored_mock` | 继续履约或等待确认 | `BOUND` | ROUTE, TYPE, API |
| `W.CONFIRMATION.STATUS.PENDING` | 等待顾客确认 | Customer Confirmation=`pending` | 查看状态，不替顾客确认 | `PARTIAL` | TYPE, API |
| `W.CONFIRMATION.STATUS.CONFIRMED` | 查看顾客已确认结果 | Customer Confirmation=`confirmed` | 查看后续账务事实 | `PARTIAL` | TYPE, API |
| `W.CONFIRMATION.STATUS.DISPUTED` | 响应顾客争议 | Customer Confirmation=`disputed` | 进入售后或客服；交接后台 | `PARTIAL` | TYPE, API |
| `W.REPAIR.DETAIL.ASSIGNED` | 查看已分配返工任务 | Repair=`assigned` 且 workerId 为本人 | 开始返工 | `BOUND` | ROUTE, TYPE, API |
| `W.REPAIR.DETAIL.IN_PROGRESS` | 执行返工任务 | Repair=`in_progress` | 填写说明并完成 | `BOUND` | ROUTE, TYPE, API |
| `W.REPAIR.DETAIL.COMPLETED` | 查看返工完成记录 | Repair=`completed` | 返回列表；交接后台售后 | `BOUND` | ROUTE, TYPE |
| `W.REPAIR.DETAIL.CANCELLED` | 查看返工任务取消 | Repair=`cancelled` | 返回列表 | `PARTIAL` | TYPE, API |
| `W.FINANCE.WALLET.AVAILABLE` | 查看应收余额和可提现额 | Receivable Balance 加载成功 | 管理银行卡、申请提现 | `BOUND` | ROUTE, TYPE, API |
| `W.FINANCE.WALLET.ADJUSTED` | 理解退款导致的应收调整 | Adjustment=`applied` | 查看来源订单和调整金额 | `PARTIAL` | TYPE, API |
| `W.BANK_ACCOUNT.LIST.ACTIVE` | 选择有效收款账户 | Bank Account=`active` | 选择提现账户 | `BOUND` | ROUTE, TYPE, API |
| `W.BANK_ACCOUNT.EDIT.CREATING` | 添加收款账户 | 银行卡输入通过后端校验 | 保存账户 | `BOUND` | ROUTE, API |
| `W.BANK_ACCOUNT.DETAIL.INACTIVE` | 理解账户不可用于提现 | Bank Account=`inactive` | 选择其他账户或新增 | `PARTIAL` | TYPE, API |
| `W.WITHDRAWAL.REQUEST.REQUESTED` | 确认提现申请已提交 | Withdrawal=`requested` | 查看审批进度；交接后台 | `BOUND` | ROUTE, TYPE, API |
| `W.WITHDRAWAL.REQUEST.APPROVED` | 查看提现已审批 | Withdrawal=`approved` | 等待后台标记；不得声称到账 | `BOUND` | ROUTE, TYPE |
| `W.WITHDRAWAL.REQUEST.REJECTED` | 查看提现被拒原因 | Withdrawal=`rejected` | 修改资料后重新判断 | `BOUND` | ROUTE, TYPE |
| `W.WITHDRAWAL.REQUEST.MARKED_PAID` | 查看后台已标记付款 | Withdrawal=`marked_paid` | 查看审计说明；不等同 Provider 回执 | `BOUND` | ROUTE, TYPE |
| `W.WITHDRAWAL.REQUEST.CANCELLED` | 查看提现申请取消 | Withdrawal=`cancelled` | 返回钱包 | `PARTIAL` | TYPE, API |
| `W.CERTIFICATION.APPLY.NOT_SUBMITTED` | 提交从业认证资料 | 当前没有可读取申请 | 提交认证 | `PARTIAL` | ROUTE, API, CARD |
| `W.CERTIFICATION.STATUS.PENDING` | 查看认证待审核 | Certification=`pending` | 等待后台审核 | `PARTIAL` | TYPE, API, SM |
| `W.CERTIFICATION.STATUS.APPROVED` | 查看认证已通过 | Certification=`approved` | 返回任务池并由后端重新判断资格 | `UI_GAP` | TYPE, API, SM |
| `W.CERTIFICATION.STATUS.REJECTED` | 查看认证被拒及原因 | Certification=`rejected` | 查看原因；是否可重提由 API 决定 | `UI_GAP` | TYPE, API, SM |
| `W.CERTIFICATION.STATUS.EXPIRED` | 理解认证已过期 | Certification=`expired` | 重新进入认证流程 | `UI_GAP` | TYPE, SM |
| `W.LOCATION.SHARING.ENABLED` | 维护用于派单的有效位置 | sharing=true 且 Location=`fresh` | 更新位置或关闭共享 | `BOUND` | ROUTE, TYPE, API |
| `W.LOCATION.SHARING.STALE` | 修复过期位置 | Location=`stale` | 重新获取并保存位置 | `BOUND` | ROUTE, TYPE, API |
| `W.LOCATION.SHARING.DISABLED` | 明确关闭共享的接单影响 | sharing=false | 开启共享 | `BOUND` | ROUTE, TYPE, API |
| `W.REPUTATION.SUMMARY.EMPTY` | 理解尚无公开评价 | ratingCount=0、averageRating=null | 返回工作台 | `BOUND` | ROUTE, TYPE, API |
| `W.REPUTATION.SUMMARY.AVAILABLE` | 查看可验证的信誉汇总 | Reputation Projection 有数据 | 查看分布和可申诉目标 | `BOUND` | ROUTE, TYPE, API |
| `W.REVIEW.APPEAL.ELIGIBLE` | 对可申诉评价发起申诉 | 目标 visibility=`visible`/`hidden` 且无 open appeal | 提交申诉 | `BOUND` | ROUTE, TYPE, API |
| `W.REVIEW.APPEAL.OPEN` | 跟进或撤回申诉 | Appeal=`open` | 撤回或等待裁决 | `BOUND` | ROUTE, TYPE, API |
| `W.REVIEW.APPEAL.RESOLVED` | 查看申诉最终结果 | Appeal=`upheld`/`rejected`/`withdrawn` | 返回信誉页 | `BOUND` | ROUTE, TYPE |
| `W.SUPPORT.TICKET.ACTIVE` | 处理任务、提现或账号问题 | Ticket=`open`/`processing`/`waiting_requester` | 评论、补充资料 | `BOUND` | ROUTE, TYPE, API |
| `W.SUPPORT.TICKET.RESOLVED` | 查看客服解决结果 | Ticket=`resolved`/`closed` | 重新打开或评价 | `BOUND` | ROUTE, TYPE, API |
| `W.SUPPORT.CONVERSATION.ACTIVE` | 与客服持续沟通 | Conversation=`queueing`/`active`/`transferred` | 发送消息并保持历史 | `BOUND` | ROUTE, TYPE, API |
| `W.SUPPORT.CONVERSATION.CLOSED` | 查看在线会话关闭 | Conversation=`closed` | 返回工单或新建会话 | `BOUND` | ROUTE, TYPE |
| `W.NOTIFICATION.INBOX.UNREAD` | 处理未读业务通知 | Worker Inbox 有 unread item | 打开引用对象、标记已读 | `BOUND` | ROUTE, TYPE, API |
| `W.NOTIFICATION.INBOX.READ_OR_ARCHIVED` | 管理已读和归档通知 | read/archive 状态 | 打开对象或归档 | `BOUND` | ROUTE, TYPE, API |

## 5. 后台切片

后台视口基线为桌面工作台。每个动作都继承 Admin 身份、城市范围、权限、幂等、版本冲突、确认和审计要求。后台不得把“准备、可支付、已排队、已导出、意向、标记付款”表述成真实资金执行。

| Slice ID | 场景 / 操作目标 | 权威状态或进入条件 | 主动作 / 交接 | 当前状态 | 事实源 |
| --- | --- | --- | --- | --- | --- |
| `A.AUTH.SESSION.REQUIRED` | 阻止无效后台会话继续操作 | 缺少有效 Admin 身份或权限 | 重新认证并恢复原查询 | `CROSS_CUTTING` | API |
| `A.SCOPE.CITY.REQUIRED` | 明确当前城市操作范围 | cityCode 缺失或无权限 | 选择允许城市 | `CROSS_CUTTING` | ROUTE, API |
| `A.ORDER.TRACE.SEARCH` | 按订单 ID 检索完整链路 | 尚未提交有效 Order ID | 搜索 | `BOUND` | ROUTE, API, CARD |
| `A.ORDER.TRACE.FOUND` | 查看订单、支付、派单、履约、评价和售后事实 | Trace API 返回结果 | 定位异常并进入责任工作台 | `BOUND` | ROUTE, API |
| `A.ORDER.TRACE.NOT_FOUND` | 从无结果或越权结果恢复 | 404 或范围内无数据 | 校验 ID/城市后重试 | `BOUND` | ROUTE, API |
| `A.ORDER.OPERATIONS.LIST` | 筛选城市内订单 | Operations Order 列表加载成功 | 筛选、查看状态 | `BOUND` | ROUTE, TYPE, API |
| `A.CATALOG.OPERATIONS.LIST` | 查看 SKU 运营状态 | Operations SKU 列表加载成功 | 筛选；仅执行契约允许操作 | `BOUND` | ROUTE, TYPE, API |
| `A.CERTIFICATION.REVIEW.PENDING` | 审核师傅认证 | Certification=`pending` | 批准或拒绝；交接师傅端 | `BOUND` | ROUTE, TYPE, API, SM |
| `A.CERTIFICATION.REVIEW.APPROVED` | 查看认证批准记录 | Certification=`approved` | 查看审计信息 | `BOUND` | ROUTE, TYPE, SM |
| `A.CERTIFICATION.REVIEW.REJECTED` | 查看认证拒绝记录 | Certification=`rejected` | 查看原因 | `BOUND` | ROUTE, TYPE, SM |
| `A.CERTIFICATION.REVIEW.EXPIRED` | 查看过期认证 | Certification=`expired` | 不允许直接恢复为 approved | `PARTIAL` | TYPE, SM |
| `A.DISPATCH.BOARD.PENDING` | 查看尚未入队的派单任务 | Dispatch Task=`pending` | 刷新或诊断事件链 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.QUEUED` | 查看已进入城市队列任务 | Dispatch Task=`queued` | 运行允许的匹配/查看候选 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.OFFERING` | 监控报价中的任务 | Dispatch Task=`offering` | 查看候选、Offer 和截止时间 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.ACCEPTED` | 查看已被接受任务 | Dispatch Task=`accepted` | 打开关联履约 | `BOUND` | ROUTE, TYPE |
| `A.DISPATCH.BOARD.REASSIGNING` | 处理重新派单 | Dispatch Task=`reassigning` | 查看尝试次数并重新匹配 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.NO_MATCH` | 处理无匹配师傅 | Dispatch Task=`no_match` | 查看资格和距离原因、转人工 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.MANUAL_REVIEW` | 人工处理派单异常 | Dispatch Task=`manual_review` | 审核上下文并执行允许动作 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.TIMEOUT_OR_EXPIRED` | 处理超时任务 | Task=`timeout`/`expired` | 重派或转人工 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.FAILED_OR_REJECTED` | 诊断失败或被拒任务 | Task=`failed`/`rejected` | 查看 reason，不伪造成功 | `BOUND` | ROUTE, TYPE, API |
| `A.DISPATCH.BOARD.COMPLETED` | 查看派单闭环 | Dispatch Task=`completed` | 打开履约/订单追踪 | `BOUND` | ROUTE, TYPE |
| `A.DISPATCH.BOARD.CANCELLED` | 查看已取消派单 | Dispatch Task=`cancelled` | 查看取消来源 | `BOUND` | ROUTE, TYPE |
| `A.REFUND.REVIEW.REQUESTED` | 审核退款申请 | Refund=`requested` | 批准并记录管理员；交接顾客/账务 | `UI_GAP` | TYPE, API |
| `A.REFUND.REVIEW.APPROVED` | 查看退款批准和冲销链事实 | Refund=`approved` | 查看 Ledger/应收调整；不声称 Provider 到账 | `UI_GAP` | TYPE, API |
| `A.REVERSE.REVIEW.REQUESTED` | 审核取消、改期或改派申请 | Reverse=`requested` | 批准或拒绝 | `BOUND` | ROUTE, TYPE, API, SM |
| `A.REVERSE.REVIEW.APPROVED` | 查看待应用逆向申请 | Reverse=`approved` | 等待/触发契约允许的应用步骤 | `BOUND` | ROUTE, TYPE, SM |
| `A.REVERSE.REVIEW.REJECTED` | 查看拒绝记录 | Reverse=`rejected` | 查看审计原因 | `BOUND` | ROUTE, TYPE |
| `A.REVERSE.REVIEW.APPLIED` | 查看逆向变更已应用 | Reverse=`applied` | 查看订单和补偿事实 | `BOUND` | ROUTE, TYPE |
| `A.COMPLAINT.QUEUE.SUBMITTED` | 分诊新投诉 | Complaint=`submitted` | 设置优先级、分配和转处理中 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPLAINT.DETAIL.TRIAGED` | 处理已分诊投诉 | Complaint=`triaged` | 开始处理、要求顾客补充 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPLAINT.DETAIL.IN_PROGRESS` | 协调处理方案 | Complaint=`in_progress` | 建返工、定责、提补偿意向或解决 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPLAINT.DETAIL.WAITING_CUSTOMER` | 等待顾客补充材料 | Complaint=`waiting_customer` | 查看补充内容并恢复处理 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPLAINT.DETAIL.RESOLVED` | 复核解决方案 | Complaint=`resolved` | 关闭或继续查看审计 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPLAINT.DETAIL.CLOSED_OR_REJECTED` | 查看投诉最终记录 | Complaint=`closed`/`rejected` | 只读查看时间线 | `BOUND` | ROUTE, TYPE |
| `A.REPAIR.ORDER.REQUESTED` | 为投诉建立或分配返工 | Repair=`requested` | 指定师傅并形成 assigned | `BOUND` | ROUTE, TYPE, API |
| `A.REPAIR.ORDER.ACTIVE` | 跟进返工执行 | Repair=`assigned`/`in_progress` | 查看师傅进度 | `BOUND` | ROUTE, TYPE |
| `A.REPAIR.ORDER.COMPLETED_OR_CANCELLED` | 复核返工结果 | Repair=`completed`/`cancelled` | 回到投诉解决流程 | `BOUND` | ROUTE, TYPE |
| `A.LIABILITY.DECISION.DRAFTING` | 记录售后责任比例和理由 | 投诉允许定责且尚无决策 | 提交责任决定 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPENSATION.INTENT.PROPOSED` | 审核补偿意向 | Compensation=`proposed` | 批准或拒绝；不执行真实资金 | `BOUND` | ROUTE, TYPE, API |
| `A.COMPENSATION.INTENT.APPROVED_OR_REJECTED` | 查看补偿意向决策 | Compensation=`approved`/`rejected` | 查看审计和后续契约 | `BOUND` | ROUTE, TYPE |
| `A.WITHDRAWAL.REVIEW.REQUESTED` | 审核师傅提现申请 | Withdrawal=`requested` | 批准或拒绝 | `BOUND` | ROUTE, TYPE, API |
| `A.WITHDRAWAL.REVIEW.APPROVED` | 处理已批准提现 | Withdrawal=`approved` | 标记付款；不得声称 Provider 已支付 | `BOUND` | ROUTE, TYPE, API |
| `A.WITHDRAWAL.REVIEW.REJECTED` | 查看拒绝结果 | Withdrawal=`rejected` | 只读审计 | `BOUND` | ROUTE, TYPE |
| `A.WITHDRAWAL.REVIEW.MARKED_PAID` | 查看后台付款标记 | Withdrawal=`marked_paid` | 只读审计，不等同银行回执 | `BOUND` | ROUTE, TYPE |
| `A.WITHDRAWAL.REVIEW.CANCELLED` | 查看取消申请 | Withdrawal=`cancelled` | 只读审计 | `BOUND` | TYPE, API |
| `A.SETTLEMENT.BATCH.PREPARED` | 复核不可变结算准备批次 | Batch=`prepared` | 确认或取消；无资金移动 | `BOUND` | ROUTE, TYPE, API, SM |
| `A.SETTLEMENT.BATCH.CONFIRMED` | 查看已确认批次 | Batch=`confirmed` | 标记 payable readiness | `BOUND` | ROUTE, TYPE, API, SM |
| `A.SETTLEMENT.BATCH.CANCELLED` | 查看取消批次 | Batch=`cancelled` | 只读审计 | `BOUND` | ROUTE, TYPE |
| `A.SETTLEMENT.PAYABLE.PAYABLE` | 查看可支付准备事实 | Payable=`payable` | 加入内部队列；不执行支付 | `BOUND` | ROUTE, TYPE, API |
| `A.SETTLEMENT.QUEUE.QUEUED` | 查看已排队准备项 | Queue=`queued` | 生成师傅应收对账单 | `BOUND` | ROUTE, TYPE, API |
| `A.SETTLEMENT.STATEMENT.CREATED` | 审核师傅应收快照 | Statement=`created` | 批准或拒绝 review | `BOUND` | ROUTE, TYPE, API |
| `A.SETTLEMENT.STATEMENT.APPROVED` | 查看已批准审核 | Review Decision=`approved` | 生成内部导出归档 | `BOUND` | ROUTE, TYPE, API |
| `A.SETTLEMENT.STATEMENT.REJECTED` | 查看被拒对账单 | Review Decision=`rejected` | 查看原因，不允许导出为批准结果 | `BOUND` | ROUTE, TYPE |
| `A.SETTLEMENT.EXPORT.CREATED` | 复核内部归档包 | Export 存在且哈希验证通过 | 查看审计，不声称付款文件 | `BOUND` | ROUTE, TYPE, API |
| `A.SETTLEMENT.RECONCILIATION.GAP_FOUND` | 处理链路缺口 | Gap Scan 返回一个或多个 gap | 定位 batch/payable/queue/statement/review/export | `BOUND` | ROUTE, TYPE, API |
| `A.SETTLEMENT.RECONCILIATION.CLEAR` | 查看无缺口扫描结果 | Gap Scan count=0 | 记录证据 | `BOUND` | ROUTE, TYPE, API |
| `A.GOVERNANCE.INTENT.DRAFT` | 编制治理意向 | Intent=`draft` 且 executionEnabled=false | 编辑或提交评审 | `BOUND` | ROUTE, TYPE, API |
| `A.GOVERNANCE.INTENT.READY_FOR_REVIEW` | 评审治理意向 | Intent=`ready_for_review` | 批准/拒绝仅限治理流程 | `BOUND` | ROUTE, TYPE, API |
| `A.GOVERNANCE.INTENT.BLOCKED` | 处理证据或风险阻塞 | Intent=`blocked` | 补证或取消，不允许执行 | `BOUND` | ROUTE, TYPE |
| `A.GOVERNANCE.INTENT.TERMINAL` | 查看取消或归档意向 | Intent=`cancelled`/`archived` | 只读审计 | `BOUND` | ROUTE, TYPE |
| `A.ENTERPRISE.CLIENT.ACTIVE` | 管理可用企业客户 | Client=`active` | 管理凭证、协议价、Webhook 和账单 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.CLIENT.SUSPENDED_OR_CLOSED` | 限制企业客户能力 | Client=`suspended`/`closed` | 查看并按契约更新状态 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.CREDENTIAL.ACTIVE` | 管理有效 API 凭证 | Credential=`active` | 查看前缀/范围或撤销；Secret 仅创建时显示 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.CREDENTIAL.REVOKED` | 查看已撤销凭证 | Credential=`revoked` | 不允许恢复或展示 Secret | `BOUND` | ROUTE, TYPE |
| `A.ENTERPRISE.PRICE.ACTIVE` | 管理有效协议价 | Agreement Price=`active` | 新增/更新有效窗口 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.WEBHOOK.ACTIVE_OR_PAUSED` | 管理 Webhook 订阅 | Subscription=`active`/`paused` | 暂停、恢复或查看交付 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.DELIVERY.PENDING_OR_RETRY` | 处理待投递或重试 | Delivery=`pending`/`retry_wait` | 重试或运行一次投递 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.DELIVERY.DELIVERED_OR_DEAD` | 查看投递结果 | Delivery=`delivered`/`dead_letter` | 查看 Provider Envelope 和审计 | `BOUND` | ROUTE, TYPE |
| `A.ENTERPRISE.BILL.DRAFT` | 复核企业账单快照 | Bill=`draft` | 签发 | `BOUND` | ROUTE, TYPE, API |
| `A.ENTERPRISE.BILL.ISSUED` | 查看已签发账单 | Bill=`issued` | 只读查看，不声称收款 | `BOUND` | ROUTE, TYPE |
| `A.SUPPORT.WORKBENCH.QUEUE` | 查看本人、技能组和全部工单队列 | Ticket queue + SLA 排序 | 认领或分派 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.TICKET.PROCESSING` | 处理已认领工单 | Ticket=`processing`/`waiting_requester` | 评论、请求补充、升级或解决 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.TICKET.ESCALATED` | 处理升级或 SLA 风险工单 | Ticket=`escalated` 或 SLA breached | 查看原因并重新分派 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.TICKET.RESOLVED_OR_CLOSED` | 查看解决和关闭记录 | Ticket=`resolved`/`closed` | 只读审计或依规则关闭 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.CONVERSATION.QUEUEING` | 接入排队会话 | Conversation=`queueing` | 接受会话 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.CONVERSATION.ACTIVE` | 处理实时会话 | Conversation=`active` | 发消息、标已读、转接或关闭 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.CONVERSATION.TRANSFERRED_OR_CLOSED` | 查看转接或关闭结果 | Conversation=`transferred`/`closed` | 继续接手或只读审计 | `BOUND` | ROUTE, TYPE |
| `A.SUPPORT.ROUTING.CONFIGURATION` | 配置坐席、技能组和 SLA 路由 | Admin 有配置权限 | 创建/更新规则 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.KNOWLEDGE.DRAFT_OR_REVIEW` | 编写并审核知识库内容 | Article/Review=`draft`/`pending_review` | 提交审核、批准或拒绝 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.KNOWLEDGE.PUBLISHED_OR_ARCHIVED` | 管理已发布或归档内容 | Article=`published`/`archived` | 归档或只读查看 | `BOUND` | ROUTE, TYPE, API |
| `A.SUPPORT.QUALITY.DASHBOARD` | 查看真实客服质量指标 | Quality Dashboard API 返回结果 | 筛选并进入抽检 | `BOUND` | ROUTE, API |
| `A.SUPPORT.QUALITY.REVIEW` | 执行质量评分 | Rubric 和 Review 合同允许 | 保存评分和审计 | `BOUND` | ROUTE, API |
| `A.REVIEW.MODERATION.PENDING` | 审核待处理评价 | Visibility=`pending_moderation` | 设为 visible 或 hidden | `BOUND` | ROUTE, TYPE, API |
| `A.REVIEW.MODERATION.VISIBLE_OR_HIDDEN` | 查看已审核评价 | Visibility=`visible`/`hidden` | 查看内容权限和申诉状态 | `BOUND` | ROUTE, TYPE, API |
| `A.REVIEW.APPEAL.OPEN` | 裁决评价申诉 | Appeal=`open` | upheld 或 rejected | `BOUND` | ROUTE, TYPE, API |
| `A.REVIEW.APPEAL.RESOLVED` | 查看申诉裁决记录 | Appeal=`upheld`/`rejected`/`withdrawn` | 只读审计 | `BOUND` | ROUTE, TYPE |
| `A.MARKETING.CAMPAIGN.DRAFT_OR_REVIEWED` | 编制和复核营销活动 | Campaign=`draft`/`reviewed` | 创建规则修订并进入发布流程 | `BOUND` | ROUTE, TYPE, API |
| `A.MARKETING.CAMPAIGN.SCHEDULED_OR_ACTIVE` | 监控计划中或生效活动 | Campaign=`scheduled`/`active` | 暂停或查看规则证据 | `BOUND` | ROUTE, TYPE, API |
| `A.MARKETING.CAMPAIGN.TERMINAL` | 查看暂停、结束或撤销活动 | Campaign=`paused`/`ended`/`revoked` | 按合同恢复或只读查看 | `BOUND` | ROUTE, TYPE, API |
| `A.MARKETING.RULE.DRAFT_OR_REVIEWED` | 编写并双人复核规则修订 | Revision=`draft`/`reviewed` | 审核或发布；保留职责分离 | `BOUND` | ROUTE, TYPE, API |
| `A.MARKETING.RULE.PUBLISHED_OR_RETIRED` | 查看已发布或退役规则 | Revision=`published`/`retired` | 只读查看哈希与审计 | `BOUND` | ROUTE, TYPE |
| `A.COUPON.DEFINITION.DRAFT` | 配置优惠券定义 | Definition=`draft` | 审核并激活 | `BOUND` | ROUTE, TYPE, API |
| `A.COUPON.DEFINITION.ACTIVE_OR_SUSPENDED` | 管理生效或暂停券定义 | Definition=`active`/`suspended` | 暂停、恢复或查看额度 | `BOUND` | ROUTE, TYPE, API |
| `A.COUPON.DEFINITION.TERMINAL` | 查看过期或退役券定义 | Definition=`expired`/`retired` | 只读审计 | `BOUND` | ROUTE, TYPE |
| `A.COUPON.GRANT.LIFECYCLE` | 查询单张券授予和占用链 | Grant=`granted`/`available`/`reserved`/`redeemed` | 查看来源、订单和金额证据 | `BOUND` | ROUTE, TYPE, API |
| `A.COUPON.GRANT.TERMINAL` | 查看释放、过期或撤销券 | Grant=`released`/`expired`/`revoked` | 只读查看原因 | `BOUND` | ROUTE, TYPE |
| `A.MARKETING.COMPENSATION.PENDING` | 审核取消或全额退款补偿 | Compensation=`pending` | 依据证据决定 granted/denied | `BOUND` | ROUTE, TYPE, API |
| `A.MARKETING.COMPENSATION.RESOLVED` | 查看补偿处理结果 | Compensation=`granted`/`denied` | 查看 resulting Grant 或拒绝原因 | `BOUND` | ROUTE, TYPE |

## 6. 跨端交接总表

| 触发切片 | 权威事件 / 状态变化 | 接收切片 | 交接必须可见的事实 |
| --- | --- | --- | --- |
| `C.ORDER.CREATE.PENDING_DISPATCH` | `order.created` / Order=`pending_dispatch` | `A.DISPATCH.BOARD.QUEUED`、`W.TASK_POOL.AVAILABILITY.ONLINE` | Order ID、城市、SKU、金额快照；不得显示虚构师傅。 |
| `W.DISPATCH.OFFER.ACCEPTED` | `dispatch.accepted` / Fulfillment=`accepted` | `W.FULFILLMENT.DETAIL.ACCEPTED`、`C.ORDER.DETAIL.PENDING_DISPATCH` | Worker/Task/Fulfillment 关联和接受时间。 |
| `W.FULFILLMENT.DETAIL.COMPLETED` | `fulfillment.completed` | `C.CONFIRMATION.DETAIL.PENDING` | 完成时间、说明和证据引用。 |
| `C.CONFIRMATION.DETAIL.CONFIRMED` | confirmation=`confirmed` | `C.PAYMENT.CHECKOUT.PENDING`、后台 Trace | 顾客身份、确认时间和对应 Fulfillment。 |
| `C.CONFIRMATION.DETAIL.DISPUTED` | confirmation=`disputed` | `C.AFTERSALE.COMPLAINT.SUBMITTED`、`A.COMPLAINT.QUEUE.SUBMITTED` | 争议来源、订单、履约和证据引用。 |
| `C.PAYMENT.RESULT.PAID` | `payment.paid` / Order=`paid` | `C.REVIEW.CREATE.ELIGIBLE`、账务投影 | Payment ID、金额、币种、Provider Envelope；当前 Provider 可能为 mock。 |
| `C.REFUND.REQUEST.REQUESTED` | Refund=`requested` | `A.REFUND.REVIEW.REQUESTED` | Refund ID、订单、支付、金额、理由。 |
| `A.REFUND.REVIEW.APPROVED` | `refund.approved` | `C.REFUND.REQUEST.APPROVED`、`W.FINANCE.WALLET.ADJUSTED` | 审批人、时间、Ledger/应收调整；不承诺外部到账。 |
| `C.AFTERSALE.REVERSE.REQUESTED` | Reverse=`requested` | `A.REVERSE.REVIEW.REQUESTED` | 逆向类型、原因、期望时间和版本。 |
| `A.REPAIR.ORDER.REQUESTED` | Repair=`assigned` | `W.REPAIR.DETAIL.ASSIGNED` | Complaint、Order、Worker、原因和分配人。 |
| `W.REPAIR.DETAIL.COMPLETED` | Repair=`completed` | `A.COMPLAINT.DETAIL.IN_PROGRESS`、顾客售后详情 | 完成时间、服务说明和关联投诉。 |
| `W.WITHDRAWAL.REQUEST.REQUESTED` | Withdrawal=`requested` | `A.WITHDRAWAL.REVIEW.REQUESTED` | 金额、账户掩码、申请时间；不得暴露完整卡号。 |
| `A.WITHDRAWAL.REVIEW.APPROVED` | Withdrawal=`approved` | `W.WITHDRAWAL.REQUEST.APPROVED` | 审批人、时间、备注；不是资金到账。 |
| `W.CERTIFICATION.STATUS.PENDING` | Certification=`pending` | `A.CERTIFICATION.REVIEW.PENDING` | 证书类型、名称、提交人、城市和提交时间。 |
| `A.CERTIFICATION.REVIEW.APPROVED` | Certification=`approved` | `W.CERTIFICATION.STATUS.APPROVED`、任务资格重算 | 审批事实；前端不得直接推断可抢所有任务。 |
| `C.REVIEW.DETAIL.PENDING_MODERATION` | Review created | `A.REVIEW.MODERATION.PENDING` | Review ID、评分、内容权限和版本。 |
| `C.REVIEW.APPEAL.OPEN` / `W.REVIEW.APPEAL.OPEN` | Appeal=`open` | `A.REVIEW.APPEAL.OPEN` | 申诉主体、版本、理由可见性和幂等键。 |
| 顾客/师傅 `SUPPORT.*` | ticket/conversation mutation | `A.SUPPORT.WORKBENCH.QUEUE` 或 `A.SUPPORT.CONVERSATION.QUEUEING` | Requester、城市、来源、优先级、SLA 和消息序号。 |
| `A.SUPPORT.TICKET.RESOLVED_OR_CLOSED` | Ticket resolved/closed | 顾客/师傅对应 Support 结果切片、通知中心 | 解决码、可见评论、关闭时间和可否 reopen/CSAT。 |
| `A.MARKETING.COMPENSATION.RESOLVED` | Compensation=`granted` | `C.COUPON.WALLET.AVAILABLE` | 新 Grant ID、有效期、金额和触发来源。 |

## 7. 当前 UI 真实缺口

以下缺口已由后端契约证明，应在三端正式画面阶段优先补齐；它们不是新业务设想：

1. 顾客端缺少 Payment=`closed`、Refund=`approved` 的完整结果场景；支付失败和报价失效恢复仍不完整。
2. 师傅端认证只有提交能力，缺少可靠的申请读取以及 `approved`、`rejected`、`expired` 独立结果画面。
3. 师傅账号 `suspended`、`disabled` 缺少专用阻断与恢复说明。
4. 后台已有退款审批后端能力，但当前没有完整退款审核工作台切片。
5. 多个页面已绑定业务，但确认 Dialog、409 版本冲突、部分成功和跨端“下一责任人”反馈仍需按单片合同逐一验收。

## 8. 覆盖边界与下一产物

- 总账中的每一行都是候选 Slice Contract，不等于每一行都必须成为独立路由；Dialog、Drawer、Bottom Sheet 或页面内状态区也可以承载完整场景。
- 合并状态只发生在角色、用户目标、可用动作、风险和下一责任人完全一致时。例如后台只读终态允许合并，顾客端评价申诉的不同结果仍分别登记。
- 系统内部 Outbox、投影、扫描器、重放器和 Provider Worker 若没有人类决策，不单独生成 UI 切片；其结果进入相应业务切片的事实或异常区。
- 下一步应按业务主链顺序，为本总账中的行生成单片合同：先订单主链，再售后主链，再师傅财务，最后后台治理与运营。
