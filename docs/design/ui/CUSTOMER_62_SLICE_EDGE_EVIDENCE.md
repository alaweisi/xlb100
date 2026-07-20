# 顾客端 62 条切片 → Carrier → Edge 截图证据

本文件是顾客端视觉整改的验收索引。它不把 62 条业务切片误写成 62 个网址，而是把每条切片绑定到实际承载页面（Carrier）和真实 Edge 截图。

- 视觉权威：`docs/design/ui/phase25/references/customer-apple-liquid-glass-source.png`
- 目标画面：390×844 安装型移动 App
- 浏览器：Microsoft Edge
- 截图目录：`artifacts/design-qa/customer-edge-full-2026-07-20/`
- 自动报告：`artifacts/design-qa/customer-edge-full-2026-07-20/qa-report.json`
- 规则：每个 Carrier 至少一张正常状态、一张高风险状态；全部正式路由另做 1440 宽屏防退化门禁。

| # | 切片 ID | Carrier / 页面 | 正常状态截图 | 高风险状态截图 |
|---:|---|---|---|---|
| 1 | `C.AUTH.SESSION.REQUIRED` | C-00 登录门 | `C-00-auth-loading-390x844.png` | `C-00-auth-error-390x844.png` |
| 2 | `C.CATALOG.HOME.EMPTY` | C-01 首页 | `C-01-home-ready-390x844.png` | `C-01-home-empty-390x844.png` |
| 3 | `C.CATALOG.HOME.AVAILABLE` | C-01 首页 | `C-01-home-ready-390x844.png` | `C-01-home-empty-390x844.png` |
| 4 | `C.CATALOG.BROWSE.AVAILABLE` | C-02 服务浏览 | `C-02-services-ready-390x844.png` | `C-02-services-error-390x844.png` |
| 5 | `C.CATALOG.SEARCH.NO_RESULT` | C-02 服务浏览 | `C-02-services-ready-390x844.png` | `C-02-services-error-390x844.png` |
| 6 | `C.ORDER.QUOTE.READY` | C-03 预约下单 | `C-03-order-create-ready-390x844.png` | `C-03-order-create-quote-error-390x844.png` |
| 7 | `C.ORDER.QUOTE.INVALIDATED` | C-03 预约下单 | `C-03-order-create-ready-390x844.png` | `C-03-order-create-quote-error-390x844.png` |
| 8 | `C.ORDER.CREATE.PENDING_DISPATCH` | C-03 预约下单 | `C-03-order-create-ready-390x844.png` | `C-03-order-create-quote-error-390x844.png` |
| 9 | `C.ORDER.CREATE.INPUT` | C-03 预约下单 | `C-03-order-create-ready-390x844.png` | `C-03-order-create-quote-error-390x844.png` |
| 10 | `C.COUPON.SELECT.AVAILABLE` | C-03 预约下单 | `C-03-order-create-ready-390x844.png` | `C-03-order-create-quote-error-390x844.png` |
| 11 | `C.COUPON.SELECT.INELIGIBLE` | C-03 预约下单 | `C-03-order-create-ready-390x844.png` | `C-03-order-create-quote-error-390x844.png` |
| 12 | `C.ORDER.DETAIL.PENDING_DISPATCH` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 13 | `C.ORDER.DETAIL.SERVICE_COMPLETED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 14 | `C.ORDER.DETAIL.CANCELLED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 15 | `C.CONFIRMATION.DETAIL.DISPUTED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 16 | `C.PAYMENT.RESULT.PAID` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 17 | `C.PAYMENT.RESULT.FAILED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 18 | `C.PAYMENT.RESULT.CLOSED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 19 | `C.REFUND.REQUEST.APPROVED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 20 | `C.CONFIRMATION.DETAIL.PENDING` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 21 | `C.CONFIRMATION.DETAIL.CONFIRMED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 22 | `C.PAYMENT.CHECKOUT.PENDING` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 23 | `C.REVIEW.CREATE.ELIGIBLE` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 24 | `C.REVIEW.DETAIL.PENDING_MODERATION` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 25 | `C.REVIEW.DETAIL.VISIBLE` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 26 | `C.REVIEW.DETAIL.HIDDEN` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 27 | `C.REVIEW.APPEAL.OPEN` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 28 | `C.REVIEW.APPEAL.UPHELD` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 29 | `C.REVIEW.APPEAL.REJECTED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 30 | `C.REVIEW.APPEAL.WITHDRAWN` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 31 | `C.REFUND.REQUEST.REQUESTED` | C-04 我的订单 | `C-04-orders-ready-390x844.png` | `C-04-orders-empty-390x844.png` |
| 32 | `C.AFTERSALE.REVERSE.APPLIED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 33 | `C.AFTERSALE.COMPLAINT.WAITING_CUSTOMER` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 34 | `C.AFTERSALE.COMPLAINT.RESOLVED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 35 | `C.AFTERSALE.COMPLAINT.CLOSED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 36 | `C.AFTERSALE.COMPLAINT.REJECTED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 37 | `C.AFTERSALE.REVERSE.REQUESTED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 38 | `C.AFTERSALE.REVERSE.APPROVED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 39 | `C.AFTERSALE.REVERSE.REJECTED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 40 | `C.AFTERSALE.COMPLAINT.SUBMITTED` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 41 | `C.AFTERSALE.COMPLAINT.IN_PROGRESS` | C-05 售后服务 | `C-05-aftersale-ready-390x844.png` | `C-05-aftersale-error-390x844.png` |
| 42 | `C.SUPPORT.TICKET.ESCALATED` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 43 | `C.SUPPORT.CONVERSATION.CLOSED` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 44 | `C.SUPPORT.TICKET.OPEN` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 45 | `C.SUPPORT.TICKET.WAITING_REQUESTER` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 46 | `C.SUPPORT.TICKET.RESOLVED` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 47 | `C.SUPPORT.TICKET.CLOSED` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 48 | `C.SUPPORT.CONVERSATION.QUEUEING` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 49 | `C.SUPPORT.CONVERSATION.ACTIVE` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 50 | `C.SUPPORT.CONVERSATION.TRANSFERRED` | C-06 客服中心 | `C-06-support-ready-390x844.png` | `C-06-support-error-390x844.png` |
| 51 | `C.NOTIFICATION.INBOX.UNREAD` | C-07 消息中心 | `C-07-notifications-ready-390x844.png` | `C-07-notifications-error-390x844.png` |
| 52 | `C.NOTIFICATION.INBOX.READ` | C-07 消息中心 | `C-07-notifications-ready-390x844.png` | `C-07-notifications-error-390x844.png` |
| 53 | `C.NOTIFICATION.ARCHIVE.ARCHIVED` | C-07 消息中心 | `C-07-notifications-ready-390x844.png` | `C-07-notifications-error-390x844.png` |
| 54 | `C.COUPON.WALLET.AVAILABLE` | C-08 我的优惠券 | `C-08-coupons-ready-390x844.png` | `C-08-coupons-error-390x844.png` |
| 55 | `C.COUPON.WALLET.RESERVED` | C-08 我的优惠券 | `C-08-coupons-ready-390x844.png` | `C-08-coupons-error-390x844.png` |
| 56 | `C.COUPON.WALLET.REDEEMED` | C-08 我的优惠券 | `C-08-coupons-ready-390x844.png` | `C-08-coupons-error-390x844.png` |
| 57 | `C.COUPON.WALLET.TERMINAL` | C-08 我的优惠券 | `C-08-coupons-ready-390x844.png` | `C-08-coupons-error-390x844.png` |
| 58 | `C.PROFILE.DETAIL.DISPLAY` | C-09 我的 | `C-09-profile-ready-390x844.png` | `C-09-profile-error-390x844.png` |
| 59 | `C.PROFILE.EDIT.EDITING` | C-09 我的 | `C-09-profile-ready-390x844.png` | `C-09-profile-error-390x844.png` |
| 60 | `C.ADDRESS.EDIT.CREATING` | C-09 我的 | `C-09-profile-ready-390x844.png` | `C-09-profile-error-390x844.png` |
| 61 | `C.ADDRESS.EDIT.UPDATING` | C-09 我的 | `C-09-profile-ready-390x844.png` | `C-09-profile-error-390x844.png` |
| 62 | `C.ADDRESS.DELETE.CONFIRMING` | C-09 我的 | `C-09-profile-ready-390x844.png` | `C-09-profile-error-390x844.png` |

## 自动门禁结果

- 9 条正式顾客路由全部存在 `data-customer-shell="true"`。
- 390×844 下 20 个场景均无横向滚动。
- 已登录页面全部保留固定底部主导航；登录门也位于同一手机画布。
- 可见按钮、链接和表单控件触控高度均不小于 44px。
- 1440×900 下 9 条路由的 App 画布宽度均不超过 430px；`P0-order-create-wide-shell-1440x900.png` 证明下单页不会再铺满宽屏。

说明：截图证明 Carrier 的移动壳层、正常与高风险呈现；具体状态机与权限仍以现有 API、类型、单元测试和后端契约为准，本轮没有改造或伪造业务状态。
