# 25 — XLB 五系统 UI 标准化架构

## 1. Phase 目标

Phase 25 把 Customer、Worker、Admin、OA、Dashboard 的前端建设从页面级临时修改或占位目录改造成可审计、可复用、可回归的 UI 工程。五端当前均已有独立运行时；其中 Customer、Worker、Admin 是可安装移动 App，OA 是桌面网页总后台，Dashboard 是总部只读实时大屏。端形态的最终边界以 `01_XLB_FIVE_SURFACE_CONSTITUTION.md` 为准。

## 2. 设计事实优先级

| 端 | 视觉事实源 | 工作流事实源 | 冲突处理 |
| --- | --- | --- | --- |
| Customer | Apple 服务卡片与液态玻璃产品语言 | Customer API、订单/履约/售后状态机 | 产品设计决定表达；API 与状态机决定可执行能力 |
| Worker | 深色高辨识任务工作台产品语言 | Worker API、任务/履约/资质状态机 | 产品设计决定表达；后端决定数据和动作 |
| Admin | 移动运营 App 产品语言 | Admin API、city scope、权限、审计与治理契约 | 保留完整业务语义，布局适配触控短任务 |
| OA | Admin 全部业务能力的桌面宽屏适配 | 独立 OA OTP、`appType=oa` 令牌、`__global__` 总部账号与显式城市过滤 | 与 Admin 使用同一业务事实，权限级别更高，不建立第二套业务数据 |
| Dashboard | 1920×1080 总部实时运营大屏 | 独立 Dashboard 令牌、MySQL 只读运营聚合、health/readiness/system-status | 只展示真实聚合；断流或失败时显式降级，不以静态数字补位 |

当前设计采用 code-first 产品设计。历史 Figma、PNG 与导出切片仅保留为历史参考，不再构成页面、流程、状态或视觉验收的权威输入。

## 3. Apple 风格液态玻璃定义

Phase 25 所称“液态玻璃”不是简单 `blur()`：

- 背景具有暖色环境光与可感知的层次；
- 卡片使用半透明材质、边缘高光、内外双层描边和柔和投影；
- 前景文本与图标保持清晰，不因透明材质降低信息可读性；
- 滚动内容与固定导航具有不同的深度层级；
- 按压、聚焦、禁用、加载、错误、成功状态使用同一材质体系；
- `prefers-reduced-motion`、高对比和不支持 backdrop filter 的环境有明确降级；
- 装饰不替代真实信息，不制造不存在的业务结果。

## 4. 五层工程模型

```text
Design Sources
  -> Role Tokens
  -> Primitives / Patterns
  -> Shells / Templates
  -> Route Pages + Workflow Adapters
  -> Browser Evidence + Design QA
```

### 4.1 Role Tokens

`packages/ui/src/tokens` 与角色级 styles 统一管理颜色、材质、字体、间距、圆角、描边、阴影、模糊、层级、动效与安全区。页面不得散落创建新的视觉常量。

### 4.2 Primitives / Patterns

组件必须无业务语义，至少覆盖 Button、IconButton、GlassCard、SearchField、Tabs、StatusTag、FormField、Dialog、BottomSheet、Toast、Loading、Empty、Error、Timeline、ActionDock。

### 4.3 Shells / Templates

- Customer：390px mobile-first，五项主导航，液态玻璃固定导航与安全区。
- Worker：按 Figma 的深蓝任务大厅/履约壳。
- Admin：390px mobile-first 可安装运营 App，底部导航、触控卡片、分步表单与移动详情页。
- OA：桌面宽屏总后台，支持键盘、侧栏、批量操作与高密信息架构。
- Dashboard：1920×1080 总部只读大屏，突出健康度、新鲜度、断流与告警状态。

任何 route template 脱离对应 role shell 渲染都属于 Gate 失败。

### 4.4 Route Pages / Adapters

页面只组合 UI 和调用 app adapter。业务动作、禁用原因、城市范围、权限、审计、幂等、确认要求必须来自现有契约和 `@xlb/api-client`。

### 4.5 Evidence / QA

每个页面必须保存同视口源图、实现截图、对比记录与修复历史。Dashboard 还必须保存时间戳、刷新周期、断流/过期状态和数据源证据。类型检查或构建成功不能代替设计验收。

## 5. 页面矩阵

### 5.1 Customer

| Route | 任务 | 视觉基准 | 必须覆盖状态 |
| --- | --- | --- | --- |
| `/customer/` | 找服务、进入下单 | 用户 PNG | loading / empty / error / available |
| `/customer/services` | 搜索、分类、选择 SKU | PNG 延展 + Figma workflow | query / filter / no-result / selected |
| `/customer/order/create` | 报价、地址、时间、数量、创建 | PNG 延展 + Figma CreateOrder | validation / quoting / submitting / success / error |
| `/customer/orders` | 列表、详情、支付/确认/评价入口 | PNG 延展 + Figma Orders/Detail | all backend order states |
| `/customer/aftersale` | 取消、改期、投诉、维修协同 | PNG 延展 + Phase 17 flow | guarded / actionable / processing / completed |
| `/customer/support` | 工单、会话、评价 | PNG 延展 + Phase 24 flow | open / assigned / realtime / resolved |
| `/customer/profile` | 账户、地址、设置 | PNG 延展 + Figma workflow | loading / edit / validation / saved / error |

### 5.2 Worker

`/worker/`、`/worker/tasks`、任务详情、履约、证据、维修协同、钱包/收入、资质、个人设置均按 Figma 画板映射；没有真实 API 的状态必须诚实呈现，不填充示例收益或任务。

### 5.3 Admin

订单池、派单、师傅、SKU/定价、售后投诉、客服工作台、企业、结算、审计、设置与报表按 Figma Admin 体系映射。所有城市范围、角色权限和审计入口保持可见。

### 5.4 OA

OA 已建立桌面运行时、独立登录和总部全局授权，并直接复用 Admin 的完整业务页面、共享类型、校验器和 API Client。Admin 与 OA 对同一订单、派单、售后、客服、结算和治理对象读取同一事实源；差异只存在于载体、身份范围和权限等级。OA 不另建重复业务表、重复状态机或第二套统计口径。后续若新增组织、审批或协作域，必须先有正式后端契约，不能用静态待办或假审批补位。

### 5.5 Realtime Dashboard

Dashboard 当前能力包括总部总览、城市切片、订单/派单/客服/售后只读指标、系统健康、数据新鲜度与断流状态。当前正式口径为：

- 今日订单、进行中订单、今日完成、待派单、待处理客服、待处理售后；
- MySQL 只读聚合为唯一业务数据源，并同时返回按城市分组结果；
- 每 15 秒 pull，45 秒未更新进入 stale；聚合缺失进入 disconnected，部分系统探针失败进入 partial；
- stale、disconnected、partial、loading、empty、error 状态；
- 大屏分辨率、缩放和自动轮播规范；
- 独立 `appType=dashboard` 总部只读令牌，不复用 OA/Admin 会话。

Dashboard 只读，不得触发订单、派单、支付、账本、结算、退款或客服业务状态变更。

## 6. Phase 25 Gate

### Gate 0 — Source Freeze And Route Contract

- 冻结五系统设计源、素材清单、readiness 状态和页面矩阵；
- 为每个 route 建立 workflow / API / state / action / component / screenshot contract；
- 清除或隔离 Phase 25 之前未通过视觉验收的试做；
- 人工接受后才进入 UI 代码施工。
- Gate 0 内部依次完成 0A route/surface inventory、0B exact workflow contract matrix、0C source/readiness/theme freeze；仅有导航级 route 名称不满足退出条件。

### Gate 1 — UI Foundation

- tokens、字体、图标、材质、primitives、patterns 与 role shells；
- 组件展示页覆盖所有状态；
- UI 包 typecheck/build/unit/a11y gate。

### Gate 2 — Customer Proof Screen

- 只做 `/customer/`；
- 390×844 同视口比较；
- P0/P1/P2 清零并经人工接受后才扩展 Customer 页面。

### Gate 3 — Customer Full Workflow

- 完成另外六个 route；
- 验证搜索→SKU→下单→订单→售后/客服→个人资料链路；
- 不修改后端语义。

### Gate 4 — Worker Figma Fidelity

- 按 Figma 完成 Worker 全流程与状态；
- 任务、履约、证据、资质、钱包边界均使用真实 API 事实。

### Gate 5 — Admin Mobile App Fidelity

- 按 Figma 的业务模块与状态语义完成 Admin 运营与治理页面；
- 390×844 主视口、触控目标、移动导航、卡片/列表/详情、权限、审计和错误状态通过验收。

### Gate 6 — OA Readiness And Collaboration System

- 先完成 OA 产品定义、独立设计源和 contract-first gap closure；
- readiness 未通过时只交付设计/gap report，不构造假 UI；
- OA 桌面 shell、专用总部身份和 Admin 全部业务能力复用已落地；后续新增组织/审批域仍需独立契约与审计证据。
- Gate 6A 只负责 readiness/design/contract gap；Gate 6B 仅在 OA identity/workflow/API 契约通过独立授权后施工 runtime。

### Gate 7 — Realtime Dashboard Readiness And Wallboard

- 先冻结指标字典、实时架构、刷新/推送与 stale 策略；
- readiness 未通过时只交付设计/gap report，不展示假实时数字；
- 已建立 Dashboard 独立认证、MySQL 只读运营聚合、15 秒轮询、城市明细、系统健康和实时降级状态；新增指标仍须先进入共享指标合同。
- Gate 7A 只负责指标/实时架构 readiness；Gate 7B 仅在 metric/read-model/transport 契约通过独立授权后施工 runtime。

### Gate 8 — Five-System Closure

- 五系统 browser E2E、视觉回归、响应式、键盘、焦点、对比度、加载/空/错状态；
- Dashboard 数据新鲜度、断流、重连和指标口径证据；
- full typecheck/build/test/preflight；
- 独立审计、报告、人工验收、合并与 tag。
- 五端运行时、构建与部署映射必须齐备；OA 权限与 Dashboard 业务指标可在诚实降级状态下独立列出缺口。禁止为了名称上的“五端”伪造权限、审批、实时指标或业务成功状态。

## 7. 绝对边界

- 不新增或修改数据库 migration；
- 不修改订单、支付、派单、履约、账本、结算、退款、售后或客服状态机；
- 不接入真实支付、地图、OSS、短信或其他 Provider；
- 不用 mock 数据冒充真实业务；
- 不在用户页面显示 UAT、API、Phase、workflow、mock、not-wired 等工程词；
- 不以截图背景方式伪造可交互页面；
- 不允许“边写边定标准”，必须先通过当前 Gate。
- OA/Dashboard 已按五端宪法建立正式运行时；新增业务域或指标仍须先有共享合同和后端事实源。

## 8. 动态活动与节日演进

Phase 25 不允许按页面临时硬编码春节、红灯笼、祝福语、满减或其他营销表现。动态活动统一遵循 `docs/design/ui/phase25/PHASE25_CAMPAIGN_THEME_EVOLUTION.md`：后端决议活动范围、时间、资格与价格，前端通过 app-level bridge 消费 resolved campaign，并按 `base -> role -> campaign -> route/state` 顺序合并视觉层。

Gate 1 进一步拆为 1A Token Taxonomy、1B Material System、1C Campaign Contract Bridge、1D Asset Slots、1E Components And Shells、1F Gallery And Tests。六个工作包全部通过后，才能进入 Gate 2 Customer proof screen。

Design Token-driven Runtime Theming 是五系统共同的强制基础设施，完整分层、解析算法、发布/回滚、安全、性能与验收标准见 `docs/design/ui/phase25/PHASE25_DESIGN_TOKEN_RUNTIME_THEMING_STANDARD.md`。任何页面若直接硬编码可由 token 表达的视觉常量、绕过 role theme，或让主题改变业务语义，均视为 Gate 失败。
