# CONTRACT_FRONTEND_UI_SYSTEM_LAYERS

## 目标

定义 XLB100 前端的 UI 系统分层边界，使后端业务数据、WorkflowUiBinding、Campaign Theme、Design Tokens、`packages/ui` 组件与页面路由之间形成稳定、可验证的映射。

## 分层总图

1. 数据与决策源（Backend）
   - 订单、支付、派单、结算、退款、权限、审计、幂等都由后端业务域提供。
   - 后端返回的 workflow / 状态 / 可执行动作是唯一业务行为依据。

2. 契约层（Contracts）
   - `packages/types`、`packages/validators` 定义统一结构。
   - `CONTRACT_WORKFLOW_UI_BINDING.md` 约束 `WorkflowUiBinding`、`WorkflowActionContract`、`disabled reason`、`workflow state` 等语义。
   - `CONTRACT_RUNTIME_THEMING_TOKENS.md`、`CONTRACT_CAMPAIGN_THEME.md` 约束运行时视觉语义。

3. 适配层（Adapters，唯一业务翻译层）
   - 仅在 `apps/*` 路由层（不在本阶段改）从后端 API / workflow 结果构建 `WorkflowUiBinding`。
   - 适配层负责：
     - 明确 `backendSource` 与 `route` 映射关系；
     - 将后端结果转为统一字段（`workflowName`、`state`、`availableActions`、`disabledReasons`、`uiSlots`、`notWiredPolicy`）。
     - 保持工程事实（如 `city_code`）与业务字段透明传递到 UAT 面板，不在业务口径里混入 UI 推断。
   - 适配层之外不得新增前端发明业务动作、状态、审核口径、权限口径、幂等口径。

4. 表达层（packages/ui）
   - `packages/ui` 只负责：
     - 组件渲染（如 `ActionDock`, `WorkflowTimeline`, `NotWiredState`）
     - token 注入与 `ThemeProvider` 处理；
     - 与 `Design Tokens` 一致的视觉输出。
   - 不能承载业务逻辑分支：不接订单、支付、派单、审批、审核、签名、鉴权计算。

5. 路由页面层（apps/* route pages）
   - 页面只消费上述三类输入：
     - `WorkflowUiBinding`（来自适配层）
     - Figma 路由框架
     - 运行时主题 tokens（由 `ThemeProvider` 提供）
   - 页面不得直接调用 campaign API、直接判断节日、直接编码活动规则或折扣逻辑。

## 关键边界规则（强制）

### Adapter 唯一业务翻译层
- 业务动作（按钮、入口、禁用原因）必须来自 `WorkflowActionContract` 和后端 workflow API。  
- 前端不能凭 Figma 或本地常量“补齐”动作，也不能自行把 not-wired 状态转为可执行动作。

### Campaign / Theme 分离
- `activeTheme` 仅为视觉皮肤（`themeId` + token overrides + banner）和活动视觉素材。
- Campaign 不得决定业务流程、订单金额、支付状态、接单资格、派单规则、结算、退款、权限、审计、幂等。

### ThemeProvider 禁止后端行为
- `ThemeProvider` 不发起任何网络请求，不读取 `city_code`，不做 `new Date()` 活动判断，不做业务分支。
- 只允许处理 token resolution、CSS 变量写入、回退策略（`default`）。

### 路由输出约束
- 路由最终渲染应可追溯：
  - 后端输入 → Adapter 映射 → Binding 输出 → UI 组件 → DOM 展示。
- 任何跨层耦合必须在报告中体现并可复核。

## 与现有架构的关系

- `CONTRACT_WORKFLOW_UI_BINDING.md` 提供动作/状态源头，确保“Button from Backend”。
- `CONTRACT_CAMPAIGN_THEME.md` 提供活动主题源头，确保“Theme from Campaign”。
- `CONTRACT_RUNTIME_THEMING_TOKENS.md` 提供 tokens 约束，确保主题切换仅影响视觉。
- `XLB100_FRONTEND_UI_IMPLEMENTATION_PLAYBOOK.md` 与 `FRONTEND_WORKFLOW_THEME_ROUTE_MATRIX.md` 保证工程执行闭环。

## 验收指标（可审计）

1. 每条 C/W 路由必须记录 adapter source 与 workflow source。
2. 所有动作按钮与禁用文案必须可回溯到后端可执行动作/工作流事实。
3. 主题切换不触发业务状态变化（订单/支付/派单/结算/退款/权限/审计/幂等）。
4. 真实设备壳与桌面 Figma 预览模式可通过 shell 与文档策略独立验证。
