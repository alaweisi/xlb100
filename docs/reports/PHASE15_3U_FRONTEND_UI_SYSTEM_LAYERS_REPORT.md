# Phase 15.3U Frontend UI System Layers Report

## Scope

本阶段为 docs-only 架构治理，不修改任何应用代码、后端、数据库、部署或 infra。

允许修改文件：
- `docs/contracts/CONTRACT_FRONTEND_UI_SYSTEM_LAYERS.md`
- `docs/contracts/CONTRACT_CAMPAIGN_THEME.md`
- `docs/design/ui/XLB100_FRONTEND_UI_IMPLEMENTATION_PLAYBOOK.md`
- `docs/frontend/FRONTEND_WORKFLOW_THEME_ROUTE_MATRIX.md`
- `packages/ui/COMPONENT_MANIFEST.md`
- `docs/reports/PHASE15_3U_FRONTEND_UI_SYSTEM_LAYERS_REPORT.md`
- `docs/execution/PHASE15_PROGRESS.md`

## Results

- 新增 `CONTRACT_FRONTEND_UI_SYSTEM_LAYERS.md`：明确前端分层边界与数据流。  
  - 后端 → Contract → Adapter → 组件 → 路由页面 的职责链路。  
  - 明确声明 `Adapter` 为唯一业务翻译层。  
  - 明确 `ThemeProvider` 不请求后端、不判断日期、不读取 city/date/business state。  
- 完善 `CONTRACT_CAMPAIGN_THEME.md`：强化 Campaign-only 视觉约束与实施边界。  
  - Campaign 只决定 `themeId`、`bannerContent` 与视觉存在。  
  - `discountRuleId` 仅透传。  
- 补充 `XLB100_FRONTEND_UI_IMPLEMENTATION_PLAYBOOK.md`：固化页面组装公式与三大约束。  
  - 动作来源 = `WorkflowUiBinding + 后端`;  
  - 主题来源 = Campaign/Theme tokens;  
  - 组件层只做渲染。  
- 更新 `FRONTEND_WORKFLOW_THEME_ROUTE_MATRIX.md`：为 C/W/admin 路由给出 workflow、Figma source、theme surface、adapter、组件及 campaign 支持状态。  
- 新增 `packages/ui/COMPONENT_MANIFEST.md`：声明 `packages/ui` 组件边界，不允许业务逻辑或 backend API 调用。  

## Hard Governance Conclusions

1. `packages/ui` 不得变成业务模块。  
2. `apps` 不得凭 Figma 直接发明动作；按钮来源必须可回溯 backend workflow。  
3. `ThemeProvider` 必须始终是视觉注入器，不做活动时间/业务判断。  
4. Campaign 目前仅限主题/文案资产接入，不承接订单、支付、派单、结算、退款逻辑。  
5. Admin Settlement/Governance 的视觉源缺失与业务约束需继续按现阶段文档限制处理。  

## Verification

- `git diff --stat` 与 `git status --short` 将用于收口。  
- 当前阶段未执行代码构建、测试或部署（按用户要求 docs-only）。  
- 未新增依赖。  
- 未触碰 `apps/**`, `backend/**`, `db/**`, `deploy/**`, `infra/**`, production 配置。

## 下一步建议

- 进入真实代码实现阶段前，先以本次契约作为验收闸口，确保每个 C/W 路由 binding 都能说明：  
  `workflow source + adapter source + theme source + components + verification source`.
