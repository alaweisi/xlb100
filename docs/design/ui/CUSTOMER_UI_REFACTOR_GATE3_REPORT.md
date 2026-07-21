# 顾客端全业务切片重构 — Gate 3 发现与下单合流报告

> 结论：**GATE 3 PASSED — READY FOR P4**
> 日期：2026-07-22
> 范围：仅顾客端服务发现、创建订单与优惠券；师傅端和后台管理端未纳入、未修改。

## 合流结果

| 顺序 | 分支工程 | 合流提交 | 结果 |
| --- | --- | --- | --- |
| A3 | 服务发现 | `6f42670b` | 通过真实 `GET /api/catalog` 展示城市范围内目录、筛选、SKU 选择和下单深链 |
| B3 | 创建订单 | `ed6214e8` | 四步预约、服务端报价、提交、订单回读与持久成功状态完成 |
| C3 | 优惠券 | `cd7ca1b7` | 可用/失效状态和报价深链完成；前端不计算或提前宣称优惠金额 |

合流严格执行 A → B → C，没有文本冲突。Gate3 串行审查额外修复了三项只有集成后才能稳定暴露的问题：下单页重复套用顾客端 Shell、窄屏“修改”按钮不足 44px，以及固定主操作条与底部导航发生遮挡。

## 验收结果

| 验收面 | 结果 |
| --- | --- |
| P3 聚焦单测 | 4 files / 20 tests passed |
| Customer typecheck | passed |
| Customer lint | passed |
| Customer production build | passed |
| A3 服务发现浏览器验收 | 1 passed；使用本地真实后端目录 API |
| B3 创建订单浏览器验收 | 1 passed；覆盖目录深链、报价、提交和服务端确认成功 |
| C3 优惠券浏览器验收 | 2 passed；覆盖可用与 stale 不可选状态 |
| 响应式与可访问性 | 320、390×844、430 无横向溢出；44px 触控、键盘焦点、reduced-motion、forced-colors 通过 |
| 角色边界 | Customer-only；没有 Worker/Admin 视觉或代码污染 |

## 证据入口

- 服务发现：`phase25/evidence/customer/customer-services-390x844-a3-01.report.json`
- 创建订单：`phase25/evidence/customer/customer-order-create-390x844-b3-01.report.json`
- 优惠券：`phase25/evidence/customer/CUSTOMER_COUPONS_QA_ROUND_01.md`
- 下单与主页对照：`phase25/evidence/customer/customer-order-create-home-comparison-390x844-b3-01.png`

本报告中的“部署”只表示本地集成分支已具备可运行的生产构建与浏览器验收结果；不包含 push、生产环境部署、真实 Provider 或公开发布。
