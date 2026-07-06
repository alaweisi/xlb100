# Phase 15 Frontend Productization Execution Control

## 1. 文件定位

本文件是 Phase 15 前端产品化施工总控文件，用于 Codex 执行、人工监督、阶段验收和止损判断。

本文件不是历史报告，不是临时 prompt，也不是普通总结。后续 Codex 进入 Phase 15 施工前，必须先阅读本文件，并重新核对 `git status --short`、`git rev-parse HEAD`、`git branch --show-current`、`docs/CURRENT_STATE.md` 和实际目录状态。

本文以当前仓库事实、`docs/CURRENT_STATE.md`、`docs/reports/PHASE15_0_IMMEDIATE_STATE_AUDIT_AND_ADAPTIVE_PLAN.md`、架构强制规则和实际代码为依据。若外部 prompt、旧聊天记忆或蓝图与仓库事实冲突，以仓库事实为准，并停止汇报。

## 2. 当前即时工程状态

| App | 当前状态 | 施工判断 |
| --- | --- | --- |
| customer | Vite shell / Phase 0 Ready | 主施工对象，需进入真实产品 UI |
| worker | Vite shell / Phase 0 Ready | 主施工对象，需进入真实产品 UI |
| admin | 部分真实 Settlement/Governance 页面 | 先收 API_BASE hotfix，再统一治理 UI |
| dashboard | package/README placeholder / 地基阶段 | 先二次评估，不做假 MVP |
| oa | package/README placeholder / 地基阶段 | 先二次评估，不做假 MVP |

共享层状态：

- `packages/ui`：脚手架，只导出 `tokens`，无真实 components/layouts。
- `packages/api-client`：存在 customer、worker、admin、ledger、settlement、governance 等 client 文件；当前无 dashboard/oa client；需核查 `/api/api` 拼接风险。
- `packages/types` / `packages/config` / `packages/validators`：作为后续施工依赖，不得复制到三端 apps 内部。
- `backend`：已有较深业务承重链，但前端产品层未完全接上。

当前已知 dirty 风险：

- `apps/admin/src/pages/SettlementActionGovernancePage.tsx`
- `apps/admin/src/pages/SettlementExportReviewPage.tsx`
- `apps/admin/src/pages/SettlementOpsPage.tsx`
- `apps/admin/src/pages/SettlementStatementDetailPage.tsx`
- `apps/admin/src/apiBase.ts`
- `docs/reports/PHASE15_0_IMMEDIATE_STATE_AUDIT_AND_ADAPTIVE_PLAN.md`

Phase 15.0B 当前任务只允许新增或修改本文件：`docs/execution/PHASE15_FRONTEND_PRODUCTIZATION_EXECUTION_CONTROL.md`。

## 3. Phase 15 总目标

Phase 15 的目标不是重新做后端，也不是直接做五个漂亮前端，而是把当前项目从“云端可运行、产品不可见”推进到“前端产品层可见、核心路径可操作、浏览器 UAT 可验收”。

核心目标：

- customer 不再是 Phase 0 Ready。
- worker 不再是 Phase 0 Ready。
- admin 不再 Failed to fetch。
- Network 不请求 localhost / 127.0.0.1。
- 不出现 `/api/api`。
- customer / worker / admin 至少具备真实产品壳和最小业务闭环。
- dashboard / oa 不做假页面，等待真实 API 和产品闭环后再施工。
- production 继续 NO-GO，直到 staging 浏览器 UAT 通过。

## 4. 前置收尾：Phase 14F-hotfix

Phase 14F-hotfix 不算 Phase 15 主施工，但必须在 Phase 15 大规模施工前收尾，且必须与 Phase 15 UI 改动隔离。

目标：

- admin API_BASE 从 `http://localhost:3000` 改为正确同源路径。
- 确认不会拼成 `/api/api`。
- Settlement / Governance 页面不再 Failed to fetch。

允许修改：

- `apps/admin/src/apiBase.ts`
- `apps/admin/src/pages/SettlementActionGovernancePage.tsx`
- `apps/admin/src/pages/SettlementExportReviewPage.tsx`
- `apps/admin/src/pages/SettlementOpsPage.tsx`
- `apps/admin/src/pages/SettlementStatementDetailPage.tsx`

验收：

- `rg "http://localhost:3000"` 不再发现运行时代码残留。
- 最终请求 URL 为 `/api/internal/...` 或已确认的同源 API 路径。
- 不出现 `/api/api`。
- admin build 通过。
- staging 浏览器 Network 不再请求 localhost。

## 5. Phase 15 九个分部工程

### Phase 15.0：即时状态摸底

状态：已完成初步摸底。

目标：

- 掌握五应用、共享层、后端 API、测试、staging 的即时状态。
- 不依赖旧聊天结论。
- 每次重大施工前都要重新核对 git status、HEAD、dirty 文件和目录状态。

产物：

- `docs/reports/PHASE15_0_IMMEDIATE_STATE_AUDIT_AND_ADAPTIVE_PLAN.md`

验收：

- 五应用状态已列表。
- `packages/ui` 状态已确认。
- api-client 风险已标记。
- dashboard / oa 已标记为暂不做假 MVP。
- production 结论为 NO-GO。

### Phase 15.0B：施工总控文件入仓

目标：

- 将本文件写入仓库。
- 作为 Phase 15 后续施工控制依据。
- 后续 Codex 每次执行前必须先读本文件。

产物：

- `docs/execution/PHASE15_FRONTEND_PRODUCTIZATION_EXECUTION_CONTROL.md`

允许修改：

- `docs/execution/PHASE15_FRONTEND_PRODUCTIZATION_EXECUTION_CONTROL.md`

禁止：

- 不改业务代码。
- 不改 `apps/**`。
- 不改 `packages/**`。
- 不改 `backend/**`。
- 不改 `db/**`。
- 不改 `deploy/**`。
- 不改 `infra/**`。
- 不动 production。

验收：

- 文件存在。
- 内容包含 9 个分部工程。
- 内容包含禁止项、验收项、止损规则。
- 本任务新增 diff 只包含该 Markdown 文件。

### Phase 15.1：packages/ui 最小 Design System

目标：补齐最小 UI 材料库，支撑 customer / worker / admin 的真实产品壳和业务页面。

必须优先补：

- Button
- Card
- Input
- Select
- Textarea
- FormField
- StatusTag
- Badge
- Table
- Modal
- Drawer
- Toast
- EmptyState
- ErrorState
- LoadingState
- Skeleton
- Timeline
- PriceText
- PageShell
- MobileShell
- AdminShell
- BottomNav
- TopBar
- SideNav

禁止：

- 不做复杂大屏组件。
- 不做 OA 假组件。
- 不引入大型 UI 框架。
- 不接业务 API。
- 不写业务页面。
- 不使用假数据。

验收：

- `import { Button, Card, PageShell, MobileShell, AdminShell } from "@xlb/ui"` 可用。
- `packages/ui` build/typecheck 通过。
- 原 `import { tokens } from "@xlb/ui"` 兼容。
- 有 README 说明组件职责边界。

### Phase 15.2：customer / worker 真实路由壳

目标：将 customer / worker 从 Phase 0 Ready 变成真实产品壳。

customer 路由壳：

- `/customer/`
- `/customer/services`
- `/customer/order/create`
- `/customer/orders`
- `/customer/profile`

worker 路由壳：

- `/worker/`
- `/worker/tasks`
- `/worker/certification`
- `/worker/wallet`

要求：

- 有真实 layout。
- 有 loading / empty / error / retry。
- 不请求 localhost。
- 不假造业务成功。
- 可以显示真实 empty state。
- 可以显示模块建设中，但不能显示 Phase 0 Ready。

验收：

- `/customer/` 不再出现 Phase 0 Ready。
- `/worker/` 不再出现 Phase 0 Ready。
- 子路由刷新不 404。
- Network 不请求 localhost / 127.0.0.1。
- 不出现 `/api/api`。

### Phase 15.3：C 端最小业务闭环

目标：让 C 端用户完成最小下单路径。

闭环：

选城 -> 服务目录 -> SKU -> 地址 -> 下单 -> 支付状态 -> 订单状态

页面：

- HomePage
- ServiceCatalogPage
- ServiceSkuListPage
- OrderCreatePage
- OrderListPage
- OrderDetailPage
- ProfilePage

要求：

- 接真实 API。
- `city_code` 必须进入下单链路。
- 支付状态以后端为准。
- 订单状态以后端为准。
- 不以前端假成功触发派单。
- 不用假数据冒充真实数据。

验收：

- C 端能看到真实服务目录或真实 empty state。
- 能创建订单或明确显示后端 API 缺口。
- 能查看订单列表 / 详情。
- 错误能展示，失败能 retry。
- 浏览器 Network 全走 `/api`。

### Phase 15.4：W 端最小业务闭环

目标：让 W 端师傅完成最小接单履约路径。

闭环：

服务城市 -> 资质状态 -> 任务池 -> 接单 -> 履约 -> 完成

页面：

- WorkerDashboardPage
- CertificationStatusPage
- CertificationApplyPage
- TaskPoolPage
- TaskDetailPage
- FulfillmentPage
- WalletPage

要求：

- W 端任务必须受服务城市 / 资质约束。
- 不能前端假造可接单。
- 接单和履约动作必须走真实 API。
- 任务状态以后端为准。
- 错误状态必须可见。

验收：

- `/worker/` 不再是占位。
- 资质状态真实展示或真实 empty/error。
- 任务池展示真实任务或真实 empty。
- 接单动作不假成功。
- 履约状态来自后端。

### Phase 15.5：admin 治理 UI 统一

目标：在已有 Settlement / Governance 页面基础上统一后台治理 UI。

范围：

- AdminShell
- Sidebar / TopBar
- 表格
- 筛选区
- 状态标签
- empty / error / loading
- `city_scope` 展示
- 审计入口

优先模块：

- Settlement
- Orders
- Workers
- Dispatch
- Ledger
- Aftersale
- Audit
- CityConfig

禁止：

- 不重写已有可用 Settlement 逻辑。
- 不绕过 `city_scope`。
- 不绕过后台审计。
- 不把治理页面做成假静态页。

验收：

- admin 不再 Failed to fetch。
- 不请求 localhost。
- `city_scope` 可见。
- 列表、详情、筛选、错误状态统一。
- 关键操作有审计提示或审计入口。

### Phase 15.6：dashboard / oa 二次评估

目标：重新判断 dashboard / oa 是否具备真实施工条件。

必须检查：

- 是否有完整 Vite / src / routes。
- 是否有真实 API client。
- 是否有 backend 指标 API / OA workflow API。
- 是否有真实数据来源。
- 是否有产品闭环。

判断：

- 若无真实 API，不做假大屏 / 假 OA。
- 若有真实 API，再进入 MVP 设计。
- 若只是目录占位，继续作为后续扩展，不阻塞 C/W/A 主线。

产物：

- dashboard/oa readiness 报告。
- 是否进入 Phase 15.7 的结论。

### Phase 15.7：dashboard / oa MVP，条件触发

触发条件：只有 Phase 15.6 证明 dashboard / oa 有真实 API、真实数据、真实业务闭环后，才允许施工。

dashboard MVP 可包含：

- 系统健康
- 订单指标
- 派单指标
- 支付 / 账务指标
- 城市指标

oa MVP 可包含：

- 工作台
- 审批
- 任务
- 通知
- 内部流程

禁止：

- 无 API 时做静态假大屏。
- 无流程时做假 OA。
- 用 mock 数据冒充生产数据。

验收：

- 数据来自真实 API。
- 空状态真实。
- 错误可见。
- 不请求 localhost。
- 不影响 customer / worker / admin 主闭环。

### Phase 15.8：五应用 staging 浏览器 UAT

目标：完成 Phase 15 的产品可见验收。

必须检查：

- `/customer/` 不出现 Phase 0 Ready。
- `/worker/` 不出现 Phase 0 Ready。
- `/admin/` 不出现 Failed to fetch。
- Network 不请求 localhost。
- Network 不请求 127.0.0.1。
- 不出现 `/api/api`。
- 子路由刷新不 404。
- loading / empty / error / retry 正常。
- C 端核心路径可操作。
- W 端核心路径可操作。
- A 端核心治理页面可操作。
- dashboard / oa 若未进入 MVP，必须明确显示为延期 / 未启用，而不是假页面。

验收产物：

- staging smoke 结果。
- 浏览器 UAT 记录。
- Network 截图或文字记录。
- production 重新评估结论。

## 6. 全局禁止项

- 禁止动 production。
- 禁止打 production tag。
- 禁止创建 production env。
- 禁止用假数据冒充真实业务。
- 禁止把 Phase 0 Ready 换成另一个假页面。
- 禁止绕过 `city_code` / `city_scope` / RequestContext / ScopedExecutor。
- 禁止裸 `db.query` / `db.execute`。
- 禁止前端支付成功直接触发派单。
- 禁止 Ledger 实时读取 City Config。
- 禁止全国一条派单 Stream。
- 禁止混提交 admin hotfix 和 Phase 15 UI 改动。
- 禁止 Codex 未摸底直接施工。
- 禁止迁移或复制旧 SDJ99 半成品代码。
- 禁止新增 `@sdj99` / `sdj99` 命名。

## 7. 每次施工前检查

- `git status --short`
- `git rev-parse HEAD`
- `git branch --show-current`
- 是否有 dirty。
- dirty 是否属于当前阶段。
- 当前阶段允许改哪些文件。
- 当前阶段禁止改哪些文件。
- 是否需要先停止。
- 是否已阅读 `docs/CURRENT_STATE.md`。
- 是否已阅读本文件。

## 8. 每次施工后验收

- `git diff --stat`
- 修改文件是否符合范围。
- build 是否通过。
- typecheck 是否通过。
- test 是否通过。
- staging 是否部署。
- 浏览器是否验证。
- Network 是否无 localhost。
- 是否无 `/api/api`。
- 是否仍 production NO-GO。

## 9. 止损规则

发现以下情况必须停止：

- dirty 文件超出阶段范围。
- 出现未知业务代码修改。
- 出现 production 修改。
- 出现 `/api/api`。
- 出现 localhost 请求。
- customer / worker 仍 Phase 0 Ready 却声称完成。
- dashboard / oa 无 API 却做静态假页面。
- build/typecheck 失败仍继续。
- 没有浏览器验证却声称可上线。
- 外部 prompt 与 `docs/CURRENT_STATE.md`、本文件、实际代码冲突。

## 10. 当前 production 结论

当前 production 继续 NO-GO。

原因：

- customer / worker 真实 UI 未完成。
- admin hotfix 未完全验证。
- `packages/ui` 仍待补。
- dashboard / oa 仍需二次评估。
- 缺真实浏览器 UAT。
- 缺 no-localhost / no-Phase0 / no-api-api gate。

在 Phase 15.8 完成 staging 浏览器 UAT 且上述 gate 均通过前，不得发布 production，不得创建 production env，不得打 production tag。
