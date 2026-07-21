# 顾客端 62 条业务切片设计 QA

final result: passed

- 唯一视觉母版：`docs/design/ui/visual-authority/customer-home-search-dominant-candidate-2026-07-21.png`
- 实现首页：`artifacts/design-qa/customer-edge-full-2026-07-20/C-01-home-ready-390x844.png`
- 母版并排对照：`artifacts/design-qa/customer-edge-full-2026-07-20/C-01-home-locked-reference-vs-implementation.png`
- 全页面正常状态：`artifacts/design-qa/customer-edge-full-2026-07-20/customer-all-carriers-after-iteration-1.png`
- 全页面高风险状态：`artifacts/design-qa/customer-edge-full-2026-07-20/customer-high-risk-states-after-iteration-1.png`
- 浏览器：Microsoft Edge
- 目标画面：390×844 安装型移动 App

## UI Master 八阶段记录

1. Ground：读取项目规则、现有 Customer Shell、真实 API、62 条切片总账与正式服务目录。
2. Brief：统一顾客端全部业务页面，不改变真实业务、金额、权限和状态机。
3. Visual target：锁定用户确认的奶油色主页为唯一母版；搜索优先、城市仅显示杭州。
4. Plan slice：62 条切片归并到 C-00 至 C-09 十个 Carrier，逐个覆盖正常和最高风险状态。
5. Implement：统一奶油底、深绿文字、橙色主操作、轻量液态玻璃导航/控制；复用真实 16 类图标和 `@xlb/ui`。
6. Verify：Customer 与 UI 类型检查、Customer 生产构建、40 项相关测试通过；风险检查为普通改动。
7. Render and compare：Edge 生成 21 张手机截图和 9 条宽屏防退化检查，并与母版并排复核。
8. Handoff：完整证据与 62 条切片映射保存在仓库，生产发布条件另行按真实环境门禁判定。

## 最终结论

- 9 条已登录正式路由全部继承统一 Customer App Shell；登录门也位于同一 390×844 手机画布。
- 无横向滚动、无桌面全宽表单、无小于 44px 的已识别触控目标。
- 主页 16 类服务、推荐服务、搜索、客服、消息、订单、我的均连接现有真实路由和 API。
- 师傅区域保持只读橱窗，只显示别名、认证、评分与技能；没有电话、聊天、预约、选人、派单或定位入口。
- 正常、加载、空、错误、校验、提交与结果状态沿用现有状态机；本轮未虚构业务。
- Edge 对照后未发现仍需阻止交付的 P0、P1 或 P2 视觉问题。
