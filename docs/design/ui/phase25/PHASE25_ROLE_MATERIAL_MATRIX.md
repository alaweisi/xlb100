# Phase 25 Gate 1B — Role Material Matrix

## 1. 范围与证据

本矩阵只冻结 Worker、Admin、OA、Dashboard 的角色材质契约，不实现页面、组件、App 根接入、Campaign bridge 或业务工作流。

施工前已人工查看以下本地归档证据：

| Evidence | Role | Contract fact |
| --- | --- | --- |
| `docs/design/figma/assets/images/foundations_1-23.png` | Shared | `390×844`、8pt spacing、16/24/28 radius、固定底部安全区、Noto Serif/Sans SC、JetBrains Mono、Worker Blue、Admin Purple |
| `docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png` | Worker | 深蓝移动工作台、在线状态、任务指标、扫描/抢单层级、固定底部导航 |
| `docs/design/figma/frames/admin/admin_dashboard_default_1-2875.png` | Admin | 紫色运营看板、指标/风险/快捷入口层级；桌面实现只允许密度适配，不改变模块与状态语义 |
| `docs/design/figma/manifest.json` readiness gaps | OA / Dashboard | 无独立产品画板；只能建立 blocked readiness contract，不能声明视觉完成 |

Figma 文件没有正式 variables/styles/components；因此所有 recipe 只能引用 Gate 1A canonical token path，不能把快照中观察到的数值复制为第二 token 源。

## 2. Recipe 固定规则

- token reference 使用裸 dot-path，例如 `role.worker.page`，禁止 `{token}`、CSS `var()` 或字面 CSS 值；
- `sourceAuthority` 指向本地可复验快照或 readiness gap，不依赖短期 Figma URL；
- `readiness=ready` 只表示该角色 recipe 有可审计视觉源，不表示页面或业务流程已完成；
- `protectedSemanticTokens` 必须来自 `PROTECTED_THEME_TOKEN_PATHS`，Campaign L4 不得覆盖；
- recipe 只选择表现语义，不推导在线资格、订单、金额、审批、告警或 realtime freshness；
- breakpoint 表示适配边界，不授权改变信息层级、动作顺序、权限或审计事实。

## 3. 角色矩阵

| Recipe | Readiness | Density / breakpoint | Material contract | Priority | Protected semantics |
| --- | --- | --- | --- | --- | --- |
| `worker-operational-dark` | ready | comfortable；`breakpoint.compact` 为源，`breakpoint.medium` 仅适配 | `role.worker.page/panel/text/muted`；固定底部安全区与 44px touch target | 户外可读性、粗体任务层级、warning/danger/stale 不依赖色彩装饰 | focus、info/success/warning/danger、loading/error/stale |
| `admin-dense-operations` | ready | dense；桌面 `breakpoint.wide`，`medium` 保留降级 | `role.admin.page/panel/text/muted`；12-column、compact controls、overlay/modal 层级 | 表格/筛选/抽屉长期操作、tabular numbers、紧凑行高、风险与过期可见 | focus、on-status text、全状态语义、stale |
| `oa-readiness` | **blocked** | dense / `breakpoint.wide` 仅为未来契约占位 | 只引用共享 semantic surface；无 `role.oa.*` 视觉 token | 未来待办/审批/通知必须优先 focus、warning/danger、loading/stale、审计数字 | focus 与完整状态语义 |
| `dashboard-readiness` | **blocked** | wallboard / `breakpoint.wallboard` | 只引用共享 semantic surface；无 `role.dashboard.*` 视觉 token | chart axis/grid、threshold、positive/negative、alert、freshness、tabular/display numbers | chart axis/grid/threshold/positive/negative 与状态语义 |

## 4. Worker 响应式与户外可读性

1. `390×844` 信息层级与固定底部导航是源事实；中宽视口只能扩展容器，不能把在线/暂停、任务资格或抢单动作重排成新流程。
2. 任务数字使用 `font.numeric`；主要任务与风险使用 canonical weight/status token，不把低对比 muted text 用于关键动作。
3. 触控动作至少引用 `size.touchTarget`；safe area 由 `safeArea.bottomNavigation` 与 `size.bottomNavigation` 表达。
4. forced colors、reduced motion、low power 通过 capability fallback recipe 处理；Worker 角色 recipe 不自行写媒体查询或 CSS 常量。

## 5. Admin 桌面密集操作

1. Figma 移动看板只决定模块、状态与动作层级；`breakpoint.medium/wide`、`grid.columnsWide`、`grid.gutterWide`、`grid.maxContent` 负责桌面密度适配。
2. 筛选、表格、批量审阅和详情抽屉使用 compact control 与 tight/normal line-height，但交互目标仍受 `size.touchTarget` 保护。
3. 金额、计数、SLA、revision 使用 `font.numeric`；错误、冲突、过期、审计风险读取 protected token，不使用 Campaign accent 替代。
4. overlay/modal 的 z-index 引用 canonical 路径；recipe 不创建抽屉或对话框，也不改变 Admin 权限与 city scope。

## 6. OA / Dashboard 阻断契约

OA 与 Dashboard 当前没有独立 Figma 产品画板、批准 shell、可执行 route matrix 或完整 API/realtime contract。因此：

- recipe 必须保持 `readiness: blocked`；
- 不得新增 `role.oa.*` 或 `role.dashboard.*` 视觉值来暗示设计已完成；
- OA 只预留键盘焦点、审批/通知状态和审计可读性要求；
- Dashboard 只预留 chart、alert、freshness、large-display 与 numeric 层级要求；
- FlowMap/root overview 不能当作 OA 或 Dashboard 独立视觉源；
- readiness 解除前禁止静态假待办、假审批、假指标、假时间戳、假断流/重连状态。

## 7. Gate 1B 验收断言

- Worker/Admin recipe 的 `sourceAuthority` 精确指向已查看的本地快照；
- OA/Dashboard 始终 blocked，且不引用不存在的角色视觉 token；
- 每个 recipe 的 surface/border/typography/layout/priority/protected token path 均可在 canonical `baseTokens` 中解析；
- protected 列表是 Gate 1A registry 的子集；
- Worker 户外可读性、Admin 桌面密度、Dashboard chart/alert/freshness 优先级均有 focused unit test；
- 本工作包没有触碰 App、页面、backend、database 或 Campaign runtime。
