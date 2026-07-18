# XLB UI 生产总控基线报告

> 本报告只陈述可验证事实。`DEFINED` 不等于已实现，控制台可打开不等于商业切片已交付。

## 总体状态

| 指标 | 当前值 | 发布要求 |
| --- | ---: | ---: |
| 正式切片 | 214 | 214 |
| Carrier | 36 | 36 |
| 顶层画面计划 | 104 | 104 |
| 中文完成 | 7 | 214 |
| 真实商业链路资料完整 | 7 | 214 |
| Edge 证据完整 | 7 | 214 |
| Base Frame 已验收 | 0 | 36 |
| 最终 ACCEPTED | 0 | 214 |
| 可见英文违规 | 987 | 0 |

## 三端范围

| 端 | 切片数 |
| --- | ---: |
| customer | 62 |
| worker | 54 |
| admin | 98 |

## 四道门禁

1. **全中文**：未通过。
2. **214 条可追踪并最终验收**：未通过。
3. **全量效果可查看**：未通过。
4. **真实商业 App**：未通过。

## 结构错误

- 无。214 条绑定与机器总账结构一致。

## 首批可见英文债务（最多显示 30 条）

- `apps/customer/src/app/App.tsx:174`：code
- `apps/customer/src/app/App.tsx:175`：login
- `apps/customer/src/pages/CustomerAftersalePage.tsx:154`：Phase 17
- `apps/customer/src/pages/CustomerAftersalePage.tsx:177`：reschedule
- `apps/customer/src/pages/CustomerAftersalePage.tsx:214`：Service Evidence
- `apps/customer/src/pages/CustomerAftersalePage.tsx:214`：Private local/mock storage
- `apps/customer/src/pages/CustomerAftersalePage.tsx:216`：Confirmation note
- `apps/customer/src/pages/CustomerAftersalePage.tsx:217`：Complaint for dispute
- `apps/customer/src/pages/CustomerAftersalePage.tsx:219`：Select an existing complaint
- `apps/customer/src/pages/CustomerAftersalePage.tsx:223`：No fulfillment evidence yet
- `apps/customer/src/pages/CustomerAftersalePage.tsx:227`：awaiting worker completion
- `apps/customer/src/pages/CustomerAftersalePage.tsx:229`：No evidence nodes
- `apps/customer/src/pages/CustomerAftersalePage.tsx:230`：Node
- `apps/customer/src/pages/CustomerAftersalePage.tsx:231`：File
- `apps/customer/src/pages/CustomerAftersalePage.tsx:232`：Storage
- `apps/customer/src/pages/CustomerAftersalePage.tsx:233`：Scan
- `apps/customer/src/pages/CustomerAftersalePage.tsx:235`：pending
- `apps/customer/src/pages/CustomerAftersalePage.tsx:236`：Confirm evidence
- `apps/customer/src/pages/CustomerAftersalePage.tsx:237`：Dispute with complaint
- `apps/customer/src/pages/CustomerCouponsPage.tsx:57`：loading
- `apps/customer/src/pages/CustomerCouponsPage.tsx:58`：error
- `apps/customer/src/pages/CustomerCouponsPage.tsx:64`：success
- `apps/customer/src/pages/CustomerCouponsPage.tsx:65`：available
- `apps/customer/src/pages/CustomerCouponsPage.tsx:67`：success
- `apps/customer/src/pages/CustomerHomePage.tsx:94`：success
- `apps/customer/src/pages/CustomerHomePage.tsx:149`：loading
- `apps/customer/src/pages/CustomerHomePage.tsx:157`：error
- `apps/customer/src/pages/CustomerHomePage.tsx:168`：success
- `apps/customer/src/pages/CustomerNotificationsPage.tsx:140`：Real API
- `apps/customer/src/pages/CustomerNotificationsPage.tsx:141`：Notification view

完整清单：`UI_LANGUAGE_VIOLATIONS.json`。
