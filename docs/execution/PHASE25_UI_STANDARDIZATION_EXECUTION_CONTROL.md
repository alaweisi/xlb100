# Phase 25 — 五系统 UI 标准化执行控制

## 当前状态

- Phase: 25
- Status: Gate 1B / IMPLEMENTATION VERIFIED — AWAITING HUMAN ACCEPTANCE
- Branch: `codex/phase25-ui-standardization`
- Runtime construction: AUTHORIZED FOR GATE 1B MATERIAL/ROLE RECIPES ONLY
- Production: NO-GO

> 2026-07-12 authorization update: Gate 1B has human acceptance; Gate 1C Runtime Resolver & Bridge is in progress. Only shared resolution and an app-agnostic bridge are authorized. App roots, routes/pages, API-client/backend work, campaign publication, and asset slots remain blocked.

> 2026-07-12 global authorization supersedes the preceding incremental authorization: all nine main Phase 25 Gates are authorized for construction, with dependency-aware parallel execution and one final unified human acceptance. This does not authorize backend business-semantic changes, database migrations, provider integrations, fake business data, or OA/Dashboard runtime construction before their readiness facts exist.

## 执行原则

1. 一次只开放一个 Gate。
2. 每个 Gate 必须有输入、允许文件、禁止文件、产物、自动验证、浏览器证据和人工接受。
3. Gate 未接受时，不得提前施工下一 Gate。
4. Customer 视觉服从用户液态玻璃 PNG；Customer 流程服从 Figma 与真实 API。
5. Worker/Admin 视觉与页面结构服从 Figma；业务动作服从真实契约。
6. OA/Dashboard 当前为占位目录；必须先通过 readiness gate，禁止用静态示例冒充工作流或实时数据。

## Gate 0 允许范围

允许：

- `docs/CURRENT_STATE.md`
- `docs/governance/**`
- `docs/architecture/25_XLB_FIVE_SYSTEM_UI_STANDARDIZATION.md`
- 本执行控制、Phase 25 entry report
- `docs/design/ui/phase25/**`
- Phase 25 governance gate 调整

禁止：

- `apps/**`、`packages/**` 页面或组件施工
- `backend/**`、`db/**`、`infra/**`、`deploy/**`
- migration、provider、生产配置、tag

## Gate 0 必须产物

- 五系统 source authority 表
- OA/Dashboard readiness gap 表
- 路由/页面矩阵
- workflow / API / state / action contract 清单
- UI token 与组件层级草案
- 视觉证据目录与命名标准
- Gate 1–6 顺序与 DoD
- Phase 25 boundary gate
- 人工接受记录
- Campaign、节日、满减展示的前后端边界与动态主题演进契约

## Phase 25 九个主步骤

1. Gate 0 — Source Freeze And Route Contract
2. Gate 1 — UI Foundation（内部依次执行 1A–1F）
3. Gate 2 — Customer Proof Screen
4. Gate 3 — Customer Full Workflow
5. Gate 4 — Worker Figma Fidelity
6. Gate 5 — Admin Figma Fidelity
7. Gate 6 — OA Readiness And Collaboration System
8. Gate 7 — Realtime Dashboard Readiness And Wallboard
9. Gate 8 — Five-System Closure

Gate 1 的 1A–1F 定义见 `docs/design/ui/phase25/PHASE25_CAMPAIGN_THEME_EVOLUTION.md`。节日活动是 UI 基础设施能力，不作为绕过 Gate 的独立页面施工。

Gate 1 还必须完整满足 `PHASE25_DESIGN_TOKEN_RUNTIME_THEMING_STANDARD.md`。其中 token schema、role/mode/campaign composition、运行时原子切换、安全 fallback、revision/缓存/kill switch、可访问性、性能和视觉回归是硬门禁，不得以页面截图好看代替。

### Gate 1A–1F 独立停线点

- **1A Token Contract**：单一 token 源、typed schema、protected token 集、campaign allowlist、hardcode lint；
- **1B Material And Recipes**：五端 role recipe、Customer glass 与所有可访问/能力降级；
- **1C Runtime Resolver And Bridge**：共享契约、纯 resolver、app bridge、scope/revision/cache/race/kill switch 与原子切换；
- **1D Presentation And Assets**：受控活动槽位、可信资产 manifest、CTA action key 与失败降级；
- **1E Components And Shells**：共享组件/五端 shell 消费语义 token，三端 App 根接入；
- **1F Gallery And Gates**：角色×模式×活动×状态×视口证据，以及业务不变量、安全、a11y、视觉、性能、长稳测试。

任一工作包未通过即停止，后续工作包和 Gate 2 不得提前施工。

## 页面开工卡

每个页面开工前必须填写：

```text
route:
role:
visual source:
workflow source:
API source:
states:
actions:
city/role/audit constraints:
components:
viewport(s):
source screenshot:
implementation screenshot:
design QA status:
```

任何字段缺失，该页面不得施工。

## 视觉证据规范

- Customer 主视口：390×844；长页另存 full-page 证据。
- Worker：以 Figma 画板尺寸和实际移动断点双重验证。
- Admin：1440×900 主证据，补充 1280px 与最小支持宽度。
- OA：1440×900 主证据，补充 1280px；审批与任务详情必须有键盘证据。
- Dashboard：1920×1080 与目标大屏分辨率；必须记录数据时间戳、刷新周期、stale/断流/重连证据。
- 文件名：`<role>-<route>-<state>-<viewport>-<iteration>.png`。
- 对比必须同 route、同状态、同内容、同视口；浏览器 chrome 不参与评分。
- 每次 P0/P1/P2 修复必须保留前后截图与记录。

## UI 质量门槛

- 字体、字号、字重、行高、截断符合源；
- spacing、grid、圆角、描边、阴影、材质层级符合源；
- 图标来自批准的图标库或源资产；
- 触控目标、键盘焦点、语义标签、对比度和 reduced motion 可验证；
- loading / empty / error / disabled / success 不破坏布局；
- 用户可见文案为业务语言；
- `design-qa.md` 必须为 `final result: passed`。

## Gate 0 退出条件

1. Phase 25 governance gate 通过。
2. 文档引用和素材路径完整。
3. `git diff --check` 通过。
4. 架构 preflight 在可用依赖范围内通过；外部依赖阻塞必须明确记录。
5. 人工明确接受 Gate 0，授权进入 Gate 1。

## Gate 0 接受记录

- Accepted: 2026-07-12
- Human instruction: `接受 Gate 0，进入 Gate 1A`
- Entered work unit: Gate 1A Token Contract
- Still forbidden: Gate 1B material recipes、Gate 1C runtime bridge、App 根接入、页面重构、Campaign 后端/API、OA/Dashboard runtime

## Gate 1A 允许范围

- `packages/ui/src/tokens/**` 的 canonical token contract、生成与安全解析基础；
- `packages/types` / `packages/validators` 的纯共享 runtime-theme contract 与 validator；
- Gate 1A focused unit/contract/security tests；
- token 双源一致性、protected token、unknown key/value、prototype pollution 与可 token 化硬编码门禁；
- Phase 25 状态、执行文档、报告与 gate scripts。

Gate 1A 不允许接入 App 根节点、请求 Campaign API、修改后台业务状态机、制作页面、实现 OA/Dashboard runtime 或进入 Gate 1B–1F。

## Gate 1A 接受记录

- Accepted: 2026-07-12
- Human instruction: `接受 Gate 1A，进入 Gate 1B`
- Entered work unit: Gate 1B Material & Role Recipes

## Gate 1B 允许范围

- Customer 液态玻璃材质 recipe，严格服从用户源图；
- Worker/Admin 角色 recipe，严格服从已归档 Figma 快照；
- OA/Dashboard readiness-only recipe，不伪造独立视觉源或运行时；
- typography、density、breakpoint、safe area、navigation depth、chart/alert priority 等 token reference；
- no-backdrop-filter、forced-colors、reduced-motion、low-power fallback recipe；
- Gate 1B focused unit/security tests、报告与门禁。

仍禁止 App 根接入、页面/组件施工、API Client、Campaign bridge、后端/数据库、素材生成和 Gate 1C–1F。
