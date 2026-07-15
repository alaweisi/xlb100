# RT-P30-P31-001 — Phase 30 + Phase 31 首次 Release Train 草案

> 状态：`DRAFT`
> Human Approval：`WAITING_HUMAN_APPROVAL`
> Execution System：`BOOTSTRAP / NOT_ENABLED`
> 当前权限：`NO BUSINESS CONSTRUCTION AUTHORITY`

## 通俗说明

本批次计划让 Phase 30 的风险控制核心和 Phase 31 的只读 BI 核心在互不污染的工棚中准备候选，但公共契约、migration、总装、main 和 Lock 仍排队串行。当前只是把拟施工范围写成可审核草案；Human Owner 尚未批准，因此不得创建 Phase 30/31 业务 Work Unit、修改业务代码或进入 Integration Queue。

## 基线

- Train ID：`RT-P30-P31-001`
- 前置 Phase：Phase 29 `LOCKED`
- Base tag：`xlb-phase29-marketing-coupon`
- Base commit：`80921871baf8647b2d3b7c97f8c0fde2a88f9400`
- Base tag object：`b444aeb85c8d1264b21b38838524e21ceaea949e`
- 最大并行 WRITE 工程队：`3`

## 候选范围

| 候选 Work Unit | 可考虑的范围 | 必须等待/禁止 |
|---|---|---|
| Phase 30 Risk Core | 独立 rule revision、immutable signal/case、manual review、只读 evidence reference | 未冻结 Marketing/Review adapter；任何 Order/Payment/Ledger 等受保护域 action |
| Phase 31 BI Core | 基于已 Lock source 的 metric dictionary、read-only projection、freshness/stale contract | Risk/Marketing 新事件指标；未批准 Dashboard/transport/PII/financial policy |
| Contract/Test/Audit | frozen contract、test design、独立 fixtures lease、package audit | shared contract material change 后必须进入 `STALE` 并重新验证 |

## 永久串行边界

- Shared contract 最终 revision、canonical runtime、migration reservation ledger、shared schema replay；
- Integration Queue、global gates、`CURRENT_STATE`、phase registry、Lock report；
- main merge、governance metadata commit、canonical tag 与 Lock。

## 明确未授权

本草案不授权 Phase 30/31 runtime、migration、业务数据写入、main merge、Lock、push/deploy、production、Provider、subscriber activation、replay、backfill 或 purge。治理执行系统在 clean immutable candidate commit、独立只读审计和 Human 明确启用确认完成前保持 `NOT_ENABLED`。任何 L3/L4 扩大和最终 main/Lock 均须再次提交 Human Owner 明确裁决。

## Human 批准区

当前保持空白。只有 Human Owner 在看到最终 Work Unit、lease、环境隔离、证据与停线条件后明确写出批准，registry 才能由 `DRAFT / WAITING_HUMAN_APPROVAL` 转换为 `CHARTER_HUMAN_APPROVED`。
