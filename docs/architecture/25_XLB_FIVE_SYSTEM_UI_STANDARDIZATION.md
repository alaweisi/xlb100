# 25 — XLB 五系统 UI 标准化架构

## 1. Phase 目标

Phase 25 把 Customer、Worker、Admin、OA、Dashboard 的前端建设从页面级临时修改或占位目录改造成可审计、可复用、可回归的 UI 工程。前三个系统已有运行时；OA 与 Dashboard 当前仍是占位目录，必须先通过 readiness gate。

## 2. 设计事实优先级

| 端 | 视觉事实源 | 工作流事实源 | 冲突处理 |
| --- | --- | --- | --- |
| Customer | 用户提供的 Apple 风格液态玻璃服务卡片 PNG | Figma Customer 画板、Flow Map、当前 API/Workflow Binding | PNG 决定视觉；Figma 决定流程与状态；API 决定可执行能力 |
| Worker | Figma Worker 画板及本地导出 | Worker API、任务/履约/资质状态机 | Figma 决定视觉与页面结构；后端决定数据和动作 |
| Admin | Figma Admin 画板及本地导出 | Admin API、city scope、权限、审计与治理契约 | Figma 决定视觉；权限/审计边界不可被视觉覆盖 |
| OA | Phase 25 待确认的 OA 产品画板；不得从 Admin 页面臆造 | 待批准的审批、任务、通知、组织与审计契约 | 没有产品画板和 API 契约时只允许设计与 gap report |
| Dashboard | Phase 25 待确认的大屏画板；现有 Figma Flow Map 只作信息架构参考 | 待批准的指标字典、聚合 API、刷新/推送和数据新鲜度契约 | 没有实时数据源时禁止静态数字冒充实时大屏 |

Customer 视觉源归档到 `docs/design/ui/phase25/references/`。Figma 文件为 `WrIq7mTPz9zB5EJkftS3sY`，根节点 `1:2`；仓库快照位于 `docs/design/figma/`。

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
- Admin：按 Figma 的桌面运营壳、侧栏、顶部栏、工具区、表格与详情区。

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

OA 目标能力包括工作台、待办、审批、任务、通知、组织协作、流程详情与审计轨迹。Gate 6 前必须产出：

- 角色与组织边界；
- 审批/任务/通知状态机；
- API 与 `@xlb/api-client` 契约；
- 与 Admin、Support、Aftersale 的只读/编排边界；
- 独立产品画板和桌面响应式规范。

在上述事实源缺失时，`apps/oa` 保持占位，不得生成静态假待办或假审批。

### 5.5 Realtime Dashboard

Dashboard 目标能力包括全局态势、城市切片、订单/派单/履约/客服/财务只读指标、趋势、告警、数据新鲜度与断流状态。Gate 7 前必须产出：

- 指标字典、口径、单位、时间窗口与维度；
- 聚合查询或事件投影来源；
- pull / SSE / WebSocket 选择与刷新频率；
- stale、disconnected、partial、loading、empty、error 状态；
- 大屏分辨率、缩放和自动轮播规范；
- 权限、城市范围、隐私和敏感指标边界。

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

### Gate 5 — Admin Figma Fidelity

- 按 Figma 完成 Admin 运营与治理页面；
- 桌面断点、密集表格、详情、权限、审计和错误状态通过验收。

### Gate 6 — OA Readiness And Collaboration System

- 先完成 OA 产品定义、独立设计源和 contract-first gap closure；
- readiness 未通过时只交付设计/gap report，不构造假 UI；
- readiness 通过后建立 OA shell、流程页面、权限与审计证据。
- Gate 6A 只负责 readiness/design/contract gap；Gate 6B 仅在 OA identity/workflow/API 契约通过独立授权后施工 runtime。

### Gate 7 — Realtime Dashboard Readiness And Wallboard

- 先冻结指标字典、实时架构、刷新/推送与 stale 策略；
- readiness 未通过时只交付设计/gap report，不展示假实时数字；
- readiness 通过后建立 dashboard shell、数据适配、实时状态和大屏视觉回归。
- Gate 7A 只负责指标/实时架构 readiness；Gate 7B 仅在 metric/read-model/transport 契约通过独立授权后施工 runtime。

### Gate 8 — Five-System Closure

- 五系统 browser E2E、视觉回归、响应式、键盘、焦点、对比度、加载/空/错状态；
- Dashboard 数据新鲜度、断流、重连和指标口径证据；
- full typecheck/build/test/preflight；
- 独立审计、报告、人工验收、合并与 tag。
- 合法出口一：Customer/Worker/Admin 运行时闭环，OA/Dashboard 以明确 readiness-blocked 报告退出；合法出口二：前置契约另行获批后完成五系统运行时闭环。禁止为了名称上的“五系统”伪造运行时。

## 7. 绝对边界

- 不新增或修改数据库 migration；
- 不修改订单、支付、派单、履约、账本、结算、退款、售后或客服状态机；
- 不接入真实支付、地图、OSS、短信或其他 Provider；
- 不用 mock 数据冒充真实业务；
- 不在用户页面显示 UAT、API、Phase、workflow、mock、not-wired 等工程词；
- 不以截图背景方式伪造可交互页面；
- 不允许“边写边定标准”，必须先通过当前 Gate。
- OA/Dashboard readiness 未通过前，不得新增其 `src` 运行时代码。

## 8. 动态活动与节日演进

Phase 25 不允许按页面临时硬编码春节、红灯笼、祝福语、满减或其他营销表现。动态活动统一遵循 `docs/design/ui/phase25/PHASE25_CAMPAIGN_THEME_EVOLUTION.md`：后端决议活动范围、时间、资格与价格，前端通过 app-level bridge 消费 resolved campaign，并按 `base -> role -> campaign -> route/state` 顺序合并视觉层。

Gate 1 进一步拆为 1A Token Taxonomy、1B Material System、1C Campaign Contract Bridge、1D Asset Slots、1E Components And Shells、1F Gallery And Tests。六个工作包全部通过后，才能进入 Gate 2 Customer proof screen。

Design Token-driven Runtime Theming 是五系统共同的强制基础设施，完整分层、解析算法、发布/回滚、安全、性能与验收标准见 `docs/design/ui/phase25/PHASE25_DESIGN_TOKEN_RUNTIME_THEMING_STANDARD.md`。任何页面若直接硬编码可由 token 表达的视觉常量、绕过 role theme，或让主题改变业务语义，均视为 Gate 失败。
