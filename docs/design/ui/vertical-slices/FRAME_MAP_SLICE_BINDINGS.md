# XLB Frame Map 逐 Slice 绑定

## 1. 使用规则

本文件为 214 条正式业务切片建立唯一主要设计落点。每个 Carrier 段落都声明完整的六层路径：

```text
页面 -> 页面状态 -> 页面区域 -> 浮层 -> 状态组件 -> 微状态
```

主要表达代码：

| 代码 | 含义 |
| --- | --- |
| `G` | Gate 业务状态，建立顶层 Gate Frame。 |
| `SF` | 完整业务 State Frame，计入顶层 Frame。 |
| `R` | Base/State Frame 内的持久 Region、Panel、Table Row、Timeline 或 Result Block。 |
| `O` | 以 Overlay 为主要编辑/确认表面；关闭后返回所属 Carrier，业务结果仍回写持久 Region。 |

每个 Slice ID 在本文件中只出现一次。未在某个切片后单独重复的 loading、empty、offline、401、403、409、422、duplicate、partial、handoff 和 unknown-result，统一继承 [INTERACTION_STATE_INVENTORY.md](./INTERACTION_STATE_INVENTORY.md)。

## 2. 顾客端绑定

### `C-00` Customer Session Gate

路径：`C-00 / Session Gate / Identity Recovery / Login & OTP / PermissionState / focus-submitting-error`

- `G`：`C.AUTH.SESSION.REQUIRED`

### `C-01` Customer Home

路径：`C-01 / Home / Catalog Feed / City Sheet / Loading|Empty|Offline / card-selected-refreshing`

- `SF`：`C.CATALOG.HOME.EMPTY`
- `R`：`C.CATALOG.HOME.AVAILABLE`

### `C-02` Service Browse

路径：`C-02 / Browse / Filtered Catalog / City & Filter Sheet / Loading|Empty|Offline / tab-filter-selected`

- `R`：`C.CATALOG.BROWSE.AVAILABLE`、`C.CATALOG.SEARCH.NO_RESULT`

### `C-03` Order Create

路径：`C-03 / Create & Quote / Form + Quote + Coupon / Address|Time|Coupon|Create Sheet / Validation|Conflict|Handoff / field-valid-invalid-submitting`

- `SF`：`C.ORDER.QUOTE.READY`、`C.ORDER.QUOTE.INVALIDATED`、`C.ORDER.CREATE.PENDING_DISPATCH`
- `R`：`C.ORDER.CREATE.INPUT`、`C.COUPON.SELECT.AVAILABLE`、`C.COUPON.SELECT.INELIGIBLE`

### `C-04` Orders

路径：`C-04 / Order Business State / Detail + Timeline + Action Dock / Confirm|Dispute|Pay|Review|Appeal|Refund / Result|Handoff|Conflict|Duplicate / status-action-pending-terminal`

- `SF`：`C.ORDER.DETAIL.PENDING_DISPATCH`、`C.ORDER.DETAIL.SERVICE_COMPLETED`、`C.ORDER.DETAIL.CANCELLED`、`C.CONFIRMATION.DETAIL.DISPUTED`、`C.PAYMENT.RESULT.PAID`、`C.PAYMENT.RESULT.FAILED`、`C.PAYMENT.RESULT.CLOSED`、`C.REFUND.REQUEST.APPROVED`
- `R`：`C.CONFIRMATION.DETAIL.PENDING`、`C.CONFIRMATION.DETAIL.CONFIRMED`、`C.PAYMENT.CHECKOUT.PENDING`、`C.REVIEW.CREATE.ELIGIBLE`、`C.REVIEW.DETAIL.PENDING_MODERATION`、`C.REVIEW.DETAIL.VISIBLE`、`C.REVIEW.DETAIL.HIDDEN`、`C.REVIEW.APPEAL.OPEN`、`C.REVIEW.APPEAL.UPHELD`、`C.REVIEW.APPEAL.REJECTED`、`C.REVIEW.APPEAL.WITHDRAWN`、`C.REFUND.REQUEST.REQUESTED`

### `C-05` Aftersale

路径：`C-05 / Case Business State / Case Detail + Timeline + Responsibility / Reverse|Complaint|Supplement Sheet / Handoff|Result|Partial / status-owner-action-evidence`

- `SF`：`C.AFTERSALE.REVERSE.APPLIED`、`C.AFTERSALE.COMPLAINT.WAITING_CUSTOMER`、`C.AFTERSALE.COMPLAINT.RESOLVED`、`C.AFTERSALE.COMPLAINT.CLOSED`、`C.AFTERSALE.COMPLAINT.REJECTED`
- `R`：`C.AFTERSALE.REVERSE.REQUESTED`、`C.AFTERSALE.REVERSE.APPROVED`、`C.AFTERSALE.REVERSE.REJECTED`、`C.AFTERSALE.COMPLAINT.SUBMITTED`、`C.AFTERSALE.COMPLAINT.IN_PROGRESS`

### `C-06` Customer Support Hub

路径：`C-06 / Ticket or Conversation State / Queue + Timeline + Messages / Create|Reopen|CSAT|Start Chat Sheet / Handoff|Offline|Result / unread-sending-assigned-sla`

- `SF`：`C.SUPPORT.TICKET.ESCALATED`、`C.SUPPORT.CONVERSATION.CLOSED`
- `R`：`C.SUPPORT.TICKET.OPEN`、`C.SUPPORT.TICKET.WAITING_REQUESTER`、`C.SUPPORT.TICKET.RESOLVED`、`C.SUPPORT.TICKET.CLOSED`、`C.SUPPORT.CONVERSATION.QUEUEING`、`C.SUPPORT.CONVERSATION.ACTIVE`、`C.SUPPORT.CONVERSATION.TRANSFERRED`

### `C-07` Customer Notification Inbox

路径：`C-07 / Inbox View / Notification List / Archive Confirm / Loading|Empty|Offline / unread-read-archived-selected`

- `R`：`C.NOTIFICATION.INBOX.UNREAD`、`C.NOTIFICATION.INBOX.READ`、`C.NOTIFICATION.ARCHIVE.ARCHIVED`

### `C-08` Coupon Wallet

路径：`C-08 / Wallet View / Coupon Groups + Detail / Coupon Detail Sheet / Loading|Empty|Permission / available-reserved-redeemed-terminal`

- `R`：`C.COUPON.WALLET.AVAILABLE`、`C.COUPON.WALLET.RESERVED`、`C.COUPON.WALLET.REDEEMED`、`C.COUPON.WALLET.TERMINAL`

### `C-09` Customer Profile

路径：`C-09 / Profile & Address / Profile + Address List / Profile|Address Edit Sheet + Delete Dialog / Validation|Conflict|Result / field-focus-dirty-saving`

- `R`：`C.PROFILE.DETAIL.DISPLAY`
- `O`：`C.PROFILE.EDIT.EDITING`、`C.ADDRESS.EDIT.CREATING`、`C.ADDRESS.EDIT.UPDATING`、`C.ADDRESS.DELETE.CONFIRMING`

## 3. 师傅端绑定

### `W-00` Worker Auth / Access Gate

路径：`W-00 / Access State / Login or Block Reason / Login & OTP / Permission|Handoff / focus-submitting-error-blocked`

- `G`：`W.AUTH.SESSION.UNAUTHENTICATED`、`W.AUTH.SESSION.AUTHENTICATED`、`W.PROFILE.ACCESS.SUSPENDED`、`W.PROFILE.ACCESS.DISABLED`

### `W-01` Worker Grab Hall

路径：`W-01 / Availability & Offer / Task Feed + Eligibility / Offer Sheet / Handoff|Conflict|Result / countdown-online-paused-action`

- `SF`：`W.TASK_POOL.AVAILABILITY.ONLINE`、`W.TASK_POOL.AVAILABILITY.PAUSED`、`W.TASK_POOL.ELIGIBILITY.BLOCKED`、`W.DISPATCH.OFFER.ACCEPTED`
- `R`：`W.DISPATCH.OFFER.REJECTED`、`W.DISPATCH.OFFER.TIMEOUT`、`W.DISPATCH.OFFER.CANCELLED`
- `O`：`W.DISPATCH.OFFER.OFFERING`

### `W-02` My Tasks Supporting Frame

路径：`W-02 / Aggregated View / Task Groups / Filter Sheet / Loading|Empty|Offline / tab-filter-status`

- 无 Slice ID；只汇总 `W.FULFILLMENT.*` 并进入 `W-03`。

### `W-03` Task Detail

路径：`W-03 / Fulfillment State / Facts + Evidence + Timeline + Action Dock / Start|Upload|Complete / Handoff|Conflict|Offline|Result / action-enabled-submitting-evidence`

- `SF`：`W.FULFILLMENT.DETAIL.ACCEPTED`、`W.FULFILLMENT.DETAIL.IN_PROGRESS`、`W.FULFILLMENT.DETAIL.COMPLETED`、`W.FULFILLMENT.DETAIL.CANCELLED`、`W.CONFIRMATION.STATUS.DISPUTED`
- `R`：`W.FULFILLMENT.EVIDENCE.MISSING`、`W.FULFILLMENT.EVIDENCE.STORED`、`W.CONFIRMATION.STATUS.PENDING`、`W.CONFIRMATION.STATUS.CONFIRMED`

### `W-04` Repair

路径：`W-04 / Repair State / Source + Task + Evidence / Start|Complete Repair / Handoff|Result|Conflict / status-action-evidence`

- `SF`：`W.REPAIR.DETAIL.ASSIGNED`、`W.REPAIR.DETAIL.IN_PROGRESS`、`W.REPAIR.DETAIL.COMPLETED`、`W.REPAIR.DETAIL.CANCELLED`

### `W-05` Worker Wallet

路径：`W-05 / Wallet & Withdrawal / Balance + Account + Request History / Add Account|Withdraw|Sensitive Confirm / Result|Duplicate|Conflict / amount-visibility-saving-status`

- `R`：`W.FINANCE.WALLET.AVAILABLE`、`W.FINANCE.WALLET.ADJUSTED`、`W.BANK_ACCOUNT.LIST.ACTIVE`、`W.BANK_ACCOUNT.DETAIL.INACTIVE`、`W.WITHDRAWAL.REQUEST.REQUESTED`、`W.WITHDRAWAL.REQUEST.APPROVED`、`W.WITHDRAWAL.REQUEST.REJECTED`、`W.WITHDRAWAL.REQUEST.MARKED_PAID`、`W.WITHDRAWAL.REQUEST.CANCELLED`
- `O`：`W.BANK_ACCOUNT.EDIT.CREATING`

### `W-06` Worker Support Hub

路径：`W-06 / Ticket or Conversation State / Source + Timeline + Messages / Create|Reopen|CSAT|Start Chat / Offline|Handoff|Result / unread-sending-resolved`

- `SF`：`W.SUPPORT.CONVERSATION.CLOSED`
- `R`：`W.SUPPORT.TICKET.ACTIVE`、`W.SUPPORT.TICKET.RESOLVED`、`W.SUPPORT.CONVERSATION.ACTIVE`

### `W-07` Worker Notification Inbox

路径：`W-07 / Inbox View / Notification List / Archive Confirm / Loading|Empty|Offline / unread-read-archived`

- `R`：`W.NOTIFICATION.INBOX.UNREAD`、`W.NOTIFICATION.INBOX.READ_OR_ARCHIVED`

### `W-08` Worker Reputation

路径：`W-08 / Reputation & Appeal / Summary + Eligible Reviews + Appeal / Create|Withdraw Appeal / Empty|Result|Conflict / score-status-action`

- `R`：`W.REPUTATION.SUMMARY.EMPTY`、`W.REPUTATION.SUMMARY.AVAILABLE`、`W.REVIEW.APPEAL.ELIGIBLE`、`W.REVIEW.APPEAL.OPEN`、`W.REVIEW.APPEAL.RESOLVED`

### `W-09` Worker Location

路径：`W-09 / Sharing State / Freshness + Privacy + Eligibility / Save|Disable Sharing / Permission|Stale|Result / enabled-stale-disabled-saving`

- `SF`：`W.LOCATION.SHARING.STALE`、`W.LOCATION.SHARING.DISABLED`
- `R`：`W.LOCATION.SHARING.ENABLED`

### `W-10` Certification

路径：`W-10 / Certification State / Apply Form + Evidence + Result / Submit Certification / Validation|Handoff|Result / field-evidence-submitting-status`

- `SF`：`W.CERTIFICATION.STATUS.PENDING`、`W.CERTIFICATION.STATUS.APPROVED`、`W.CERTIFICATION.STATUS.REJECTED`、`W.CERTIFICATION.STATUS.EXPIRED`
- `R`：`W.CERTIFICATION.APPLY.NOT_SUBMITTED`

## 4. 后台绑定

### `A-00` Admin Auth / City Gate

路径：`A-00 / Auth & Scope State / Identity + Role + City / Login|City Select / Permission|Conflict / focus-selected-submitting`

- `G`：`A.AUTH.SESSION.REQUIRED`、`A.SCOPE.CITY.REQUIRED`

### `A-01` Settlement Ops

路径：`A-01 / Ops State / Batch + Payable + Queue + Reconciliation / Confirm|Cancel|Mark|Enqueue|Generate / Conflict|Partial|Result / row-selected-risk-action`

- `SF`：`A.SETTLEMENT.RECONCILIATION.GAP_FOUND`
- `R`：`A.SETTLEMENT.BATCH.PREPARED`、`A.SETTLEMENT.BATCH.CONFIRMED`、`A.SETTLEMENT.BATCH.CANCELLED`、`A.SETTLEMENT.PAYABLE.PAYABLE`、`A.SETTLEMENT.QUEUE.QUEUED`、`A.SETTLEMENT.RECONCILIATION.CLEAR`

### `A-02` Statement Detail

路径：`A-02 / Statement State / Amount + Line Items + Audit / Approve|Reject / Conflict|Result / version-risk-action-status`

- `SF`：`A.SETTLEMENT.STATEMENT.CREATED`、`A.SETTLEMENT.STATEMENT.APPROVED`、`A.SETTLEMENT.STATEMENT.REJECTED`

### `A-03` Export Review

路径：`A-03 / Export State / Hash + Metadata + Evidence / Metadata Drawer / Error|Result / integrity-status-selected`

- `R`：`A.SETTLEMENT.EXPORT.CREATED`

### `A-04` Governance Workbench

路径：`A-04 / Intent State / Risk + Evidence + Execution Boundary / Submit|Cancel|Archive / Permission|Conflict|Result / risk-action-status`

- `SF`：`A.GOVERNANCE.INTENT.BLOCKED`
- `R`：`A.GOVERNANCE.INTENT.DRAFT`、`A.GOVERNANCE.INTENT.READY_FOR_REVIEW`、`A.GOVERNANCE.INTENT.TERMINAL`

### `A-05` Order Trace

路径：`A-05 / Search Result / Search + Evidence Chain / Sensitive Evidence Drawer / Loading|Empty|Error / query-focus-selected`

- `SF`：`A.ORDER.TRACE.FOUND`、`A.ORDER.TRACE.NOT_FOUND`
- `R`：`A.ORDER.TRACE.SEARCH`

### `A-06` Withdrawal Review

路径：`A-06 / Selected Withdrawal / Queue + Detail + Audit / Approve|Reject|Mark Paid / Conflict|Duplicate|Result / row-selected-version-risk`

- `R`：`A.WITHDRAWAL.REVIEW.REQUESTED`、`A.WITHDRAWAL.REVIEW.APPROVED`、`A.WITHDRAWAL.REVIEW.REJECTED`、`A.WITHDRAWAL.REVIEW.MARKED_PAID`、`A.WITHDRAWAL.REVIEW.CANCELLED`

### `A-07` Aftersale Workbench

路径：`A-07 / Selected Case State / Queue + Detail + Timeline + Responsibility / Review|Assign|Decide|Compensate / Handoff|Conflict|Partial|Result / row-selected-owner-risk`

- `SF`：`A.REFUND.REVIEW.APPROVED`、`A.COMPLAINT.DETAIL.WAITING_CUSTOMER`、`A.COMPLAINT.DETAIL.RESOLVED`、`A.COMPLAINT.DETAIL.CLOSED_OR_REJECTED`
- `R`：`A.REFUND.REVIEW.REQUESTED`、`A.REVERSE.REVIEW.REQUESTED`、`A.REVERSE.REVIEW.APPROVED`、`A.REVERSE.REVIEW.REJECTED`、`A.REVERSE.REVIEW.APPLIED`、`A.COMPLAINT.QUEUE.SUBMITTED`、`A.COMPLAINT.DETAIL.TRIAGED`、`A.COMPLAINT.DETAIL.IN_PROGRESS`、`A.REPAIR.ORDER.REQUESTED`、`A.REPAIR.ORDER.ACTIVE`、`A.REPAIR.ORDER.COMPLETED_OR_CANCELLED`、`A.LIABILITY.DECISION.DRAFTING`、`A.COMPENSATION.INTENT.PROPOSED`、`A.COMPENSATION.INTENT.APPROVED_OR_REJECTED`

### `A-08` Enterprise

路径：`A-08 / Client State / Client + Credential + Price + Delivery + Bill / Create|Revoke|Configure|Issue / Permission|Partial|Result / tab-row-secret-status`

- `SF`：`A.ENTERPRISE.CLIENT.SUSPENDED_OR_CLOSED`、`A.ENTERPRISE.CREDENTIAL.ACTIVE`
- `R`：`A.ENTERPRISE.CLIENT.ACTIVE`、`A.ENTERPRISE.CREDENTIAL.REVOKED`、`A.ENTERPRISE.PRICE.ACTIVE`、`A.ENTERPRISE.WEBHOOK.ACTIVE_OR_PAUSED`、`A.ENTERPRISE.DELIVERY.PENDING_OR_RETRY`、`A.ENTERPRISE.DELIVERY.DELIVERED_OR_DEAD`、`A.ENTERPRISE.BILL.DRAFT`、`A.ENTERPRISE.BILL.ISSUED`

### `A-09` Dispatch Board

路径：`A-09 / Selected Dispatch State / Board + Candidate + Reason + Attempts / Retry|Manual Action / Conflict|Handoff|Result / row-selected-countdown-reason`

- `R`：`A.DISPATCH.BOARD.PENDING`、`A.DISPATCH.BOARD.QUEUED`、`A.DISPATCH.BOARD.OFFERING`、`A.DISPATCH.BOARD.ACCEPTED`、`A.DISPATCH.BOARD.REASSIGNING`、`A.DISPATCH.BOARD.NO_MATCH`、`A.DISPATCH.BOARD.MANUAL_REVIEW`、`A.DISPATCH.BOARD.TIMEOUT_OR_EXPIRED`、`A.DISPATCH.BOARD.FAILED_OR_REJECTED`、`A.DISPATCH.BOARD.COMPLETED`、`A.DISPATCH.BOARD.CANCELLED`

### `A-10` Platform Operations

路径：`A-10 / Operations or Certification State / Order + Catalog + Certification / Approve|Reject Certification / Permission|Conflict|Handoff|Result / tab-row-selected-risk`

- `SF`：`A.CERTIFICATION.REVIEW.PENDING`、`A.CERTIFICATION.REVIEW.APPROVED`、`A.CERTIFICATION.REVIEW.REJECTED`、`A.CERTIFICATION.REVIEW.EXPIRED`
- `R`：`A.ORDER.OPERATIONS.LIST`、`A.CATALOG.OPERATIONS.LIST`

### `A-11` Support Workbench

路径：`A-11 / Queue|Ticket|Conversation Mode / Queue + Detail + Messages + SLA / Claim|Assign|Resolve|Transfer|Close|Edit / Handoff|Conflict|Partial|Result / selected-unread-sending-sla`

- `SF`：`A.SUPPORT.TICKET.ESCALATED`、`A.SUPPORT.CONVERSATION.ACTIVE`
- `R`：`A.SUPPORT.WORKBENCH.QUEUE`、`A.SUPPORT.TICKET.PROCESSING`、`A.SUPPORT.TICKET.RESOLVED_OR_CLOSED`、`A.SUPPORT.CONVERSATION.QUEUEING`、`A.SUPPORT.CONVERSATION.TRANSFERRED_OR_CLOSED`、`A.SUPPORT.ROUTING.CONFIGURATION`、`A.SUPPORT.KNOWLEDGE.DRAFT_OR_REVIEW`、`A.SUPPORT.KNOWLEDGE.PUBLISHED_OR_ARCHIVED`

### `A-12` Support Quality

路径：`A-12 / Dashboard or Review / Metrics + Rubric + Sample / Create Rubric|Submit Review / Empty|Validation|Result / chart-row-selected-score`

- `R`：`A.SUPPORT.QUALITY.DASHBOARD`、`A.SUPPORT.QUALITY.REVIEW`

### `A-13` Review Moderation

路径：`A-13 / Moderation or Appeal / Queue + Content + History / Moderate|Resolve Appeal / Permission|Conflict|Result / row-selected-sensitive-status`

- `R`：`A.REVIEW.MODERATION.PENDING`、`A.REVIEW.MODERATION.VISIBLE_OR_HIDDEN`、`A.REVIEW.APPEAL.OPEN`、`A.REVIEW.APPEAL.RESOLVED`

### `A-14` Marketing Workbench

路径：`A-14 / Campaign|Rule|Coupon|Compensation State / Tabs + Detail + Audit / Review|Publish|Pause|Revoke|Grant|Resolve / Permission|Conflict|Partial|Result / tab-row-risk-action-status`

- `SF`：`A.MARKETING.CAMPAIGN.SCHEDULED_OR_ACTIVE`、`A.MARKETING.CAMPAIGN.TERMINAL`、`A.MARKETING.COMPENSATION.PENDING`
- `R`：`A.MARKETING.CAMPAIGN.DRAFT_OR_REVIEWED`、`A.MARKETING.RULE.DRAFT_OR_REVIEWED`、`A.MARKETING.RULE.PUBLISHED_OR_RETIRED`、`A.COUPON.DEFINITION.DRAFT`、`A.COUPON.DEFINITION.ACTIVE_OR_SUSPENDED`、`A.COUPON.DEFINITION.TERMINAL`、`A.COUPON.GRANT.LIFECYCLE`、`A.COUPON.GRANT.TERMINAL`、`A.MARKETING.COMPENSATION.RESOLVED`

## 5. 数量对账

| 端 | `G` | `SF` | `R` | `O` | Slice 合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 顾客端 | 1 | 19 | 38 | 4 | 62 |
| 师傅端 | 4 | 20 | 28 | 2 | 54 |
| 后台 | 2 | 22 | 74 | 0 | 98 |
| 合计 | 7 | 61 | 140 | 6 | 214 |

`O` 切片仍拥有所属 Base Frame；动作完成后必须回写 `R`、`SF` 或目标 Gate，不能以关闭浮层或 Toast 作为完成证据。
