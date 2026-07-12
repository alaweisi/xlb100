# Phase 25 — 五系统 UI 标准化进入报告

## 状态

- Branch: `codex/phase25-ui-standardization`
- Base: `main@fb055b1`
- Status: **GATE 0 DESIGN IN PROGRESS**
- Runtime UI construction: not authorized
- Migration: none

## 进入原因

现有 Customer、Worker、Admin 虽具备真实业务入口，但视觉实现出现页面级临时修改、role shell 漏接、样式入口缺失、工程文案外露，以及“构建通过被误当作设计通过”等问题；OA 与 Dashboard 仍是占位目录。继续逐页修补或直接造假页面会扩大漂移，因此由用户明确授权创建 Phase 25，先建立五系统统一 UI 工程与施工纪律。

## 已确认设计方向

- Customer：用户提供的 Apple 服务卡片液态玻璃视觉为主；Figma 只提供工作流、页面展开关系和状态参考。
- Worker：Figma 全盘视觉与流程映射。
- Admin：Figma 全盘视觉与流程映射。
- OA：纳入 Phase 25，但当前仅为占位；先完成产品画板、审批/任务/通知契约与 readiness。
- Dashboard：纳入 Phase 25，但当前仅为占位；先完成指标字典、实时数据源、刷新/推送和 stale 策略。
- 五系统动作、数据、权限、城市范围、审计和状态仍以现有后端契约为准。

## Gate 0 交付

- Phase 25 正式注册与 CURRENT_STATE 进入记录；
- 五系统 UI 标准化架构；
- Gate 0–8 执行顺序；
- 页面开工卡、截图证据与 Design QA 标准；
- 明确禁止 Gate 0 期间继续修改页面代码。

## 未授权内容

Gate 0 尚未得到人工接受，因此 tokens、组件、shell、Customer/Worker/Admin 页面、浏览器 E2E 和视觉回归均未进入正式施工。此前零散 UI 试做已保存到命名 stash `rejected pre-phase25 ui spike 2026-07-12`，不属于 Phase 25 基线。

## 动态活动事实补充

本地仓库已存在 Campaign 类型/校验器、ThemeProvider、主题注册表和春节/双11 token 骨架；后端 Campaign 服务、真实 API、活动管理页面和素材 manifest 尚未实现。`CampaignAppScope` 当前仅覆盖 Customer/Worker/Admin，尚未覆盖 OA/Dashboard。Phase 25 已增加动态主题演进契约，前端不得硬编码节日时间或计算满减，真实活动和价格必须由后端决议。
