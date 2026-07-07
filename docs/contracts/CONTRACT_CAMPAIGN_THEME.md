# CONTRACT_CAMPAIGN_THEME

## Purpose

Campaign 是活动/节日视觉的唯一来源；前端不得靠本地时间、路由、用户行为、或城市规则推断活动状态。

本合同定义 `Campaign` 与前端运行时主题之间的边界：
- 后端负责活动窗口、状态、city/app 适配和主题决议；
- 前端只消费 resolved campaign 的视觉结果；
- `campaign` 不参与业务流程决策。

## Campaign 字段

| field | type | 规则 |
| --- | --- | --- |
| `id` | string | 后端活动主键 |
| `name` | string | 运营展示名，不做业务判断 |
| `themeId` | `CampaignThemeId` | 仅作视觉主题引用 |
| `cityScope` | `CampaignCityScope` | 复用 city_scope 模型 |
| `appScope` | `CampaignAppScope` | `customer/worker/admin/all` |
| `startAt` | datetime | 后端时间窗口输入 |
| `endAt` | datetime | 后端时间窗口输入 |
| `discountRuleId` | string? | 仅引用后端定价/支付规则，前端不得计算 |
| `bannerContent` | object? | 活动横幅内容（可选） |
| `status` | enum | `draft/scheduled/active/ended/revoked` |

## Hard Boundary

1. Campaign 只允许控制：
   - `themeId`
   - `bannerContent`
   - 可见的活动视觉呈现
2. Campaign 不得控制：
   - 订单创建、支付、派单、结算、退款
   - 权限、审计、幂等、验签、业务状态流转
3. `discountRuleId` 只允许传递；前端不得解析金额、不得本地计算折扣。
4. `packages/ui` 不发起 campaign API。
5. `ThemeProvider` 只做 token 注入和 fallback，不能读取 city/time/date 进行活动判断。

## Consumption contract

允许前端消费流程：

1. 后端返回 active campaign（含 status / cityScope / appScope / 时间窗口 / themeId）。
2. App-level 桥接层将已决议结果转为 themeId。
3. `ThemeProvider` 合并 `default + theme override` 并注入 CSS tokens。
4. 页面 UI 仅消费 token 与 `WorkflowUiBinding`，不再执行业务判定。

默认主题始终是 safe fallback。

## Forbidden frontend behavior

- 禁止前端硬编码 `春节`、`双11`、`国庆`、`中秋` 或具体活动窗口判断。
- 禁止前端通过 `new Date()` 决定活动是否激活。
- 禁止前端在 packages/ui 中承载 campaign 业务规则。

## 管理约束

Admin 的后续 campaign 操作必须遵守 city_scope 与现有权限边界。
本阶段不实现 campaign 后端能力，仅补齐契约与可消费约束。
