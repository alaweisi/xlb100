# Phase 25 — Design Token-driven Runtime Theming Standard

## 1. 定位

Design Token-driven Runtime Theming（基于设计令牌的运行时动态换肤系统）是 Phase 25 五系统 UI 的核心基础设施，不是单页样式工具。

UI 的固定构造公式：

```text
WorkflowUiBinding（后端业务事实）
+ Shell / Template（信息架构）
+ Design Tokens（视觉语义）
+ Campaign Presentation（已决议活动呈现）
= Runtime Page（可验证页面）
```

页面是后台工作流的展示与操作界面。主题只改变视觉表达，绝不改变工作流事实、按钮权限、状态机、金额、审计或幂等语义。

## 2. Token 分层与优先级

解析顺序必须固定且可测试，后层只能覆盖允许的视觉键：

```text
L0 Foundation primitives
  -> L1 Semantic tokens
  -> L2 Role tokens
  -> L3 Mode tokens
  -> L4 Campaign overlay
  -> L5 Component tokens
  -> L6 State tokens
  -> L7 Accessibility/runtime overrides
```

| Layer | 示例 | 所有者 |
| --- | --- | --- |
| L0 Foundation | color palette、font scale、spacing、radius、elevation、motion duration | `packages/ui` |
| L1 Semantic | `surface.page`、`text.primary`、`action.primary`、`status.danger` | `packages/ui` |
| L2 Role | Customer Home visual truth、Worker task shell、Admin/OA desktop、Dashboard wallboard | `packages/ui` role theme |
| L3 Mode | light、dark、high-contrast、large-display | theme resolver |
| L4 Campaign | Spring Festival、Double 11、运营活动视觉覆盖 | resolved campaign bridge |
| L5 Component | service-card、order-card、data-table、metric-tile | component recipe |
| L6 State | hover、pressed、focus、disabled、loading、error、success、stale | component/state contract |
| L7 Runtime | reduced-motion、no-backdrop-filter、forced-colors、low-power | runtime capability adapter |

不得以全局活动色覆盖 `status.danger`、`status.warning`、焦点可见性、Dashboard 告警等级等安全语义。

## 3. Token 领域

Gate 1A 至少冻结以下领域，避免页面自行发明常量：

- `color`：brand、accent、neutral、semantic status；
- `surface`：page、panel、glass、elevated、overlay、scrim；
- `text`：primary、secondary、muted、inverse、link、on-status；
- `border`：subtle、strong、focus、glass-highlight、glass-inner；
- `typography`：family、size、weight、line-height、letter-spacing、numeric；
- `space`、`size`、`grid`、`breakpoint`、`safeArea`；
- `radius`、`stroke`、`shadow`、`blur`、`opacity`、`zIndex`；
- `motion`：duration、easing、distance、spring preset；
- `icon`：size、stroke、optical alignment；
- `state`：hover、pressed、selected、disabled、loading、success、warning、error；
- `chart`：series、axis、grid、threshold、positive/negative、color-blind-safe palette；
- `glass`：tint、saturation、backdrop blur、edge highlight、inner stroke、ambient shadow；
- `campaign`：accent、ambient、banner、badge、decoration intensity。

基础 token 的名字表达语义，不表达具体页面或节日。禁止 `homeRed`、`springLanternMargin`、`orderBlue` 这类页面/活动耦合命名。

Token 必须有且只有一个 canonical source；TypeScript、JSON、CSS variables、文档表和 Figma variable mapping 均应由该源生成或受一致性 gate 校验。每个 token 需要稳定路径、数据类型、允许单位/范围、alias 关系、适用角色、弃用策略和 schema version。`focus`、`danger`、`warning`、Dashboard alert/freshness 等 protected tokens 不得被 Campaign L4 覆盖。

## 4. Runtime Theme Envelope

Gate 1C 应先形成共享类型与 validator 评审稿，再进入代码。正式运行时 envelope 至少必须表达：

```ts
interface RuntimeThemeEnvelope {
  schemaVersion: string;
  revision: string;
  resolvedThemeId: string;
  role: "customer" | "worker" | "admin" | "oa" | "dashboard";
  mode: "light" | "dark" | "high-contrast" | "large-display";
  campaignId: string | null;
  campaignRevision: string | null;
  cityScopeProof: string;
  routeScope: string | null;
  placementScope: string[];
  tokenOverrides: AllowedThemeTokenOverrides;
  presentation: CampaignPresentation | null;
  effectiveAt: string;
  expiresAt: string | null;
  cacheTtlSeconds: number;
  resolutionReason: string;
  killSwitchActive: boolean;
  fallbackThemeId: "default";
}
```

该结构是 Gate 0 设计方向，不授权当前修改共享运行时契约。正式实现必须通过 `packages/types`、`packages/validators`、`@xlb/api-client` 与后端 contract review。

`tokenOverrides` 必须使用 `AllowedCampaignTokenOverrides` 级别的 L4 专用 allowlist schema，不接受泛化任意 key/value 树。业务状态、权限、路由、API 地址、价格、HTML、脚本和事件处理器不得进入主题 envelope。可信来源、防重放和 TTL 上限在 contract review 时一并冻结。

## 5. 确定性解析算法

同一输入必须产生同一 token snapshot：

1. 加载编译期 default foundation；
2. 合并 role theme；
3. 合并 mode theme；
4. 使用 prototype-safe、immutable merge 校验并合并后端已决议 campaign overlay；
5. 组件读取 semantic/component token；
6. 应用 state token；
7. 最后应用 accessibility/runtime capability override；
8. 生成带真实 resolved `data-theme-id`、`data-theme-revision`、`data-theme-role` 的原子 CSS variable 集；不得把被拒绝的请求 theme id 标为已生效。

解析失败、未知版本、未知主题、无效 token 或超时都必须回落 default，记录非敏感诊断，不让页面白屏。

## 6. 运行时切换与稳定性

- 首屏使用内置 default，避免依赖远端主题才能渲染；
- 活动主题加载成功后一次性原子替换 CSS variables，不逐项闪烁；
- 缓存键至少包含 role、city、mode、campaign revision；身份或 city 改变后不得复用错误 scope；
- 过期、revoked、kill switch 或 envelope 校验失败立即回落；
- 多标签页使用受控 revision 通知保持一致；
- 主题切换不重置表单、滚动、路由、查询缓存或正在执行的 workflow action；
- 城市/身份/角色切换时取消旧请求并拒绝 late response；多请求竞态以当前 scope 与 revision 为准；
- 关键素材预声明尺寸并预加载，素材失败只降级装饰，不阻断核心任务；
- 不支持 backdrop filter 时使用批准的不透明材质 fallback；
- reduced-motion 和 forced-colors 优先级高于活动动画与品牌装饰。

## 7. 五系统主题能力

| System | Base Role Theme | Runtime Theme重点 |
| --- | --- | --- |
| Customer | 唯一主页真相派生的暖奶油、墨绿、明亮陶橙、3D 类目图像与功能层玻璃 | 安全区、4×4 类目、五项导航、活动覆盖层、报价可读性 |
| Worker | Figma 深蓝任务/履约体系 | 户外可读性、任务优先级、在线/暂停、证据上传状态 |
| Admin | Figma 桌面运营体系 | 高密表格、详情/抽屉、权限/审计、长期操作可读性 |
| OA | 待批准协作系统 | 待办/审批/通知状态、组织与审计；readiness 前不建运行时 |
| Dashboard | 待批准实时大屏 | 大屏模式、图表 palette、告警/新鲜度优先；readiness 前不造假数据 |

五端共享 foundation 和 semantic token，但不强迫共用同一布局密度、材质或组件 recipe。

## 8. 与后台业务工作流的结合

每个页面必须先有 `WorkflowUiBinding`，至少包含：

- backend state 与用户可读状态；
- available actions 与 disabled reason；
- loading/empty/error/conflict/expired/stale；
- permission、city scope、audit、confirmation、idempotency；
- authoritative amount、currency、quote revision 和失效原因（涉及价格时）；
- realtime freshness/source state（Dashboard/客服实时会话时）。

Token 只把这些事实映射为一致视觉：例如 warning 色表达后端 warning 状态，但不能根据颜色推导或改变状态。

## 9. 发布、预览与回滚

完整能力必须考虑：

- draft -> preview -> reviewed -> scheduled -> active -> paused/revoked -> ended；
- Admin 按角色、城市、系统、route/placement、viewport 预览；
- 发布前进行 schema、token allowlist、素材完整性、对比度、截图回归检查；
- revision 不可变，发布和撤销具有审计记录；
- 支持小范围 scope/canary，不由前端随机决定资格；
- 一键 kill switch 回落 default；
- 回滚只切换到已验证 revision，不修改业务数据；
- 监测 theme resolve failure、fallback rate、asset failure、切换耗时和 CLS。

在后端 Campaign/Admin 能力未获正式 Phase 授权前，Phase 25 只实现安全的消费端基础与本地受控主题，不伪造发布后台。

## 10. 安全边界

- 只接受 HTTPS 或同源的批准资产；生产策略需 CSP、类型/大小限制、完整性或可信 manifest；
- 禁止远端 HTML/CSS/JS、事件表达式、任意 SVG/XML 注入；
- token 值需按类型、范围、枚举和长度验证；
- 拒绝 `url()`、`var()`、`expression()`、HTML/JS/data URL、`__proto__`、`constructor` 和其他可逃逸 CSS/token schema 的输入；
- 不把用户身份、手机号、订单详情或权限信息写入主题缓存和日志；
- 活动 CTA 只引用 allowlisted action/route key，由应用映射，不直接执行远端 URL；
- Dashboard/OA 的主题 scope 必须经过显式权限和契约扩展。

## 11. 性能预算

Gate 1F 必须冻结可测阈值，至少覆盖：

- default theme 首屏无网络依赖；
- theme switch 不触发整页 React 重挂载；
- token 解析和 CSS variable 注入有明确耗时预算；
- 活动装饰不造成可感知 CLS；
- 图片按槽位提供尺寸、格式和响应式资源；
- blur、shadow、动画在目标低端设备和 Dashboard 大屏持续运行时不过载；
- Dashboard 长时运行无无界缓存、定时器或动画资源增长。

具体数值在 Gate 1 基准测试后锁定，不能凭空承诺。

## 12. Gate 1F 验收矩阵

自动化与浏览器证据至少覆盖：

- default / spring-festival / double11 / unknown / invalid / revoked；
- Customer/Worker/Admin role theme；OA/Dashboard 在 readiness 后加入；
- light/dark/high-contrast/forced-colors/reduced-motion/no-backdrop-filter；
- loading/empty/error/disabled/success/conflict/stale/disconnected；
- city/role/route scope 切换与缓存隔离；
- 原子切换、刷新恢复、离线 fallback、kill switch、资产失败；
- token snapshot、schema rejection、组件视觉回归、键盘和屏幕阅读器；
- 主题变化不改变 API payload、available actions、报价、状态机或审计字段；
- 同视口源图 + 实现截图合并比对，P0/P1/P2 清零后人工接受。

## 13. 当前代码差距

当前 `packages/ui` 的 token 树和 `ThemeProvider` 是可用骨架，但距离本标准仍有差距：

- token 领域不完整，缺 role/mode/component/state/chart/glass/campaign 体系；
- `ThemeTokenTree` 允许任意字符串键，尚无远端覆盖 allowlist；
- 注册主题只有 default/spring-festival/double11；
- 缺 revision、原子更新、缓存、kill switch、观测与多标签一致性；
- Campaign app scope 校验只覆盖 Customer/Worker/Admin；
- 后端 Campaign resolution 和 `@xlb/api-client` bridge 尚未实现；
- 缺组件 gallery、视觉 snapshot、可访问性和性能证据。
- `RuntimeThemeSurface` 与 `ThemeProvider` 当前断链，三端 App 根节点均未消费 `ThemeProvider`；
- JSON 与 TypeScript 主题双源维护，存在漂移；`resolvedTokens` 与后合并 `style` 尚可绕过严格 token 契约；
- Customer campaign adapter 会在活动标题缺失时本地补写“限时活动”，违反活动事实不得由前端编造的原则。

以上差距全部进入 Gate 1 的 1A–1F；在 Gate 0 人工接受前，不修改 `apps/**` 或 `packages/**` 运行时代码。
