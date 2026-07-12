# Phase 25 — 五系统 UI 与运行时主题多 Agent 审计

## 1. 审计范围与结论

2026-07-12 对本地仓库进行了三路只读审计：

1. Design Token-driven Runtime Theming 代码事实；
2. Customer/Worker/Admin/OA/Dashboard 工作流与路由事实；
3. Campaign、节日、满减展示、安全、发布和 QA 事实。

总判断：Phase 25 的方向正确，但当前代码只有 Phase 15.3T 主题骨架，不是完整运行时换肤系统；现有路由矩阵也还没有达到可自动校验的工作流契约粒度。Gate 0 必须先冻结这些差距，Gate 1 完成基础设施后才允许页面重构。

## 2. Runtime Theming 代码事实

- `ThemeProvider` 全仓尚未被 Customer/Worker/Admin App 根节点消费；
- `RuntimeThemeSurface` 当前只输出 `data-*` 与布局属性，未连接 `ThemeProvider`；
- 没有 app-level campaign bridge、Campaign API Client 或后端 Campaign resolution；
- `ThemeTokenTree` 和 `resolvedTokens` 接受任意键值树，缺 path/value allowlist、单位/范围校验和 prototype-safe merge；
- `style` 后合并可绕过 token；未知 theme 虽回退 default，但 DOM 仍标记请求的未知 id；
- 主题 JSON 与 `themeDefinitions.ts` 双份手工维护，runtime 实际读取 TypeScript，存在漂移；
- 缺 role/mode/revision/campaign/scope、原子切换、缓存、kill switch、观测、多标签一致和请求乱序保护；
- 三端与 `packages/ui` 仍存在大量可 token 化的 hex/rgba/inline style，必须先分类，不能机械替换安全状态色；
- 没有 Campaign/Theme unit、contract、visual、a11y 或 performance 测试。

## 3. Campaign 与活动代码事实

- 后端 Campaign 服务、迁移、真实 API、Admin 发布后台及专项测试不存在；
- `CampaignAppScope` 与 validator 只接受 Customer/Worker/Admin/all，OA/Dashboard 不可解析；
- 合同缺 priority/冲突消解、schema/revision、route/placement/audience、资产 manifest、kill switch 和 rollback；
- `imageUrl` 只校验 URL，未限制 scheme、origin、CSP、hash、MIME、字节和尺寸；
- `CampaignStatus` 现有 enum 与未来 reviewed/paused 发布生命周期尚未协调；不得在 UI 文档中假设后端已经支持；
- Customer campaign adapter 在 title 缺失时补写“限时活动”，属于本地编造活动事实，Gate 1 必须移除或改为不呈现；
- 满减、优惠资格与最终金额必须来自权威 quote/pricing result；视觉主题与价格活动可并行，但前端不解决二者冲突。

## 4. WorkflowUiBinding 与页面事实

### 4.1 共性

- `WorkflowActor` 目前只包含 Customer/Worker/Admin；
- `WorkflowUiBinding` 的 slot/theme metadata 尚不能表达 OA 审批/待办、Dashboard metric/freshness、resolved campaign revision/fallback；
- 当前 route matrix 是导航级自然语言清单，必须升级为可检查的 `surface × endpoint × state × action × permission × city × confirmation × idempotency × audit` 合同；
- 主题只能显示 workflow 事实，不能产生 action、disabled reason、金额或状态。

### 4.2 Customer

- binding 只覆盖 home/services/createOrder/orders/profile，缺 aftersale/support；
- orders binding 少报页面已有的确认服务、创建支付单、mock 支付、退款请求和评价动作；
- “all backend states”不可验，必须枚举 Order、Payment、Fulfillment、Reverse、Complaint、Repair、Compensation、Evidence、CSAT、Conversation 状态；
- 当前订单中心依赖本地保存的 orderIds 后逐笔 GET，不是权威全量订单列表，必须标为 partial；
- 缺登录/OTP/会话过期/未授权 page card。

### 4.3 Worker

- binding 缺 task detail、evidence、repairs、support；
- wallet/profile/certification 仍标 not-wired，但 App 已调用余额/银行卡/提现、location、certification API，绑定事实已陈旧；
- 在线/暂停未发现可靠可用性切换 API，不能因 Figma 有控件就伪装可执行；
- reject/timeout simulation 不得进入生产动作；
- 需枚举 Offer/Task、Fulfillment、Evidence、Repair、Withdrawal、Certification、location freshness/privacy 状态；
- 缺登录/OTP/会话过期 page card。

### 4.4 Admin

- 当前没有统一 Admin WorkflowUiBinding adapter；
- route matrix 漏 statement detail；support 内的 routing config/knowledge base、platform operations 内的订单/SKU/认证，以及 enterprise 的 client/credential/agreement/webhook/delivery/bill 都要作为独立 surface 建合同；
- 每个 mutation 必须逐项记录 expectedVersion、idempotency、confirm、audit、city 和 role，不能只写“status update”；
- 缺登录/会话过期/权限拒绝 page card。

### 4.5 OA 与 Dashboard

- 两者均只有 placeholder package，无 src/runtime/API client/专用契约；
- OA 必须先定义 identity、organization、task、approval、notification、read model、decision audit/idempotency 和 orchestration-only 边界；
- Dashboard 必须先定义 metric dictionary、aggregate API、event-time/observed-at、refresh/stale threshold、late/out-of-order、no-data≠0、reconnect、privacy 和 snapshot consistency；
- Dashboard 保持只读；`acknowledged` 只能展示其他系统产生的事实，不能在大屏执行确认。

## 5. Gate 结构修正

Phase 25 保持九个主 Gate，但内部必须按真实前置条件执行：

- Gate 0A：自动抽取 route/surface inventory；
- Gate 0B：建立精确 workflow contract matrix；
- Gate 0C：冻结视觉源、readiness、动态主题标准与禁止项；
- Gate 1A–1F：Token Contract、Material/Recipes、Runtime Resolver/Bridge、Presentation/Assets、Components/Shells、Gallery/Gates；
- Gate 2–5：Customer proof、Customer、Worker、Admin；
- Gate 6A/7A：OA/Dashboard readiness 和 gap closure；
- Gate 6B/7B：仅在独立业务/API 契约获批后进入 runtime；
- Gate 8：按真实授权范围 closure。

Gate 8 有两种合法出口：

1. Customer/Worker/Admin 运行时闭环，OA/Dashboard readiness 报告明确 blocked；或
2. OA/Dashboard 前置契约另行获批后，完成五系统运行时闭环。

不得为了“五系统都完成”的表面结果伪造 OA 工作流或 Dashboard 实时数据。

## 6. Gate 1A–1F 强制产物

| Work package | 产物 | 失败即停止条件 |
| --- | --- | --- |
| 1A Token Contract | 单一 canonical token 源、typed schema、L0–L7、protected tokens、campaign allowlist、hardcode lint | 双源漂移、任意 token、活动可覆盖安全语义 |
| 1B Material/Recipes | 五端 role recipes、Customer glass、fallback、safe area、breakpoints、chart/alert | 无对比/forced-colors/reduced-motion/no-filter 降级 |
| 1C Resolver/Bridge | types→validators→api-client→app bridge、纯 resolver、scope proof、revision、TTL、race/cache/kill switch、原子提交 | ThemeProvider 与 App 仍断链或主题能改变 workflow |
| 1D Presentation/Assets | `CampaignPresentation`、`AssetManifest`、slot/CTA schema、CSP/integrity/尺寸/fallback | 任意 URL/HTML/CSS/JS/SVG 或素材导致核心任务阻断 |
| 1E Components/Shells | primitives/patterns/templates/shells 全部读取 semantic/component tokens，三端根接入 | 页面继续散落可 token 化硬编码或绕过 role shell |
| 1F Gallery/Gates | role×mode×campaign×state×viewport gallery，unit/contract/security/a11y/visual/perf/soak | 无同视口视觉证据、无业务语义不变量或未锁性能阈值 |

## 7. 八类硬测试矩阵

1. 合同/解析：精确时间边界、scope、priority/tie、revoked、unknown version、quote revision/requote；
2. 安全：token key/value fuzz、prototype pollution、CSS/HTML/JS/SVG 注入、资产 CSP/hash/MIME/size、CTA allowlist；
3. 业务不变量：切换前后 API payload、actions、disabled reason、金额、状态、权限、审计一致；
4. 素材：所有 slot 的 ratio/bytes/format/integrity/alt/fallback/z-index/pointer-events/srcset；
5. 可访问性：4.5:1/3:1、键盘、读屏、200% zoom、forced-colors、reduced-motion、无闪烁、非颜色唯一语义；
6. 性能：首屏不阻塞、resolver/switch p95、payload/image budget、CLS、低端 blur、Dashboard 长时 soak；
7. 发布/回滚：draft/preview/review/schedule/active/revoke、immutable revision、canary、known-good、kill switch、缓存失效、多标签和审计；
8. 分层测试：unit、contract、bridge integration、component、E2E、visual、security fuzz、offline/slow/404/tamper/race/clock chaos。

## 8. 当前准入结论

Gate 0 文档可以继续完善；运行时 UI、`packages/ui` token 重构、Campaign API、OA/Dashboard runtime 仍未授权。下一施工单元必须是 Gate 1A Token Contract，而不是直接重画页面。
