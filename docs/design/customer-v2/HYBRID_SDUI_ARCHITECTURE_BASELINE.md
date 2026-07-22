# Customer 商业级 Hybrid SDUI 可组合前端平台架构基线

> 状态：Architecture Baseline / Step 1
>
> 适用范围：仅 `apps/customer` 顾客端
>
> 基线来源：`a490e60b`（Customer UI V2 foundation）
>
> 后续共享契约、运行时、控制面和主页实现必须遵守本文；如需改变本基线，必须先形成明确的架构决策记录。

## 1. 正式定义

顾客端采用 **商业级 Hybrid Server-Driven UI（Hybrid SDUI）可组合前端平台架构**。

该平台是顾客端 UI 的核心编排与运行时引擎：服务端发布经过治理的页面清单（Manifest），客户端使用受控组件注册表、组合引擎、数据协调器、主题与资产运行时，将清单安全地解析并渲染为页面。

平台首先以顾客端主页作为完整垂直落地点，后续可扩展到服务发现、频道页和活动页等适合运营编排的展示界面。它不替代 SKU Catalog、订单状态机、支付、退款、售后、权限或其他后端业务工作流。

唯一可复述的架构要求是：

> 顾客端必须按照商业级 Hybrid SDUI 可组合前端平台架构建设，不是固定页面，不是 Demo；主页和运营展示采用服务端编排，交易流程采用固定安全模板。

## 2. 为什么必须是 Hybrid

纯固定页面无法满足运营排序、分群展示、灰度发布、动态下架和品牌更新；全量 SDUI 又会把交易安全、复杂交互和客户端可维护性暴露给远端配置。因此采用两种模式共存。

| 页面/能力 | 默认模式 | 允许动态控制 | 禁止动态控制 |
| --- | --- | --- | --- |
| 主页、推荐、频道、活动展示 | SDUI 组合页面 | 已注册组件的启停、排序、受控属性、数据引用、适用范围、主题和资产 | 任意脚本、任意组件、业务规则、金额、权限 |
| 服务发现与搜索结果 | Hybrid | 展示区块、推荐位、受控筛选呈现 | Catalog 事实、搜索权限、SKU 业务字段语义 |
| SKU 详情 | 固定模板 + 受控插槽 | 推荐、保障说明、活动展示插槽 | SKU 价格事实、服务标准、可售状态 |
| 创建订单、支付 | 固定安全模板 | 文案、允许的品牌 Token、非关键展示插槽 | 金额计算、支付动作、表单流程、确认规则 |
| 订单、履约、退款、售后、投诉 | 固定安全模板 | 非关键说明和主题 | 状态机、权限、证据、退款与补偿规则 |
| 账户、地址、认证 | 固定安全模板 | 主题和受控帮助内容 | 身份、授权、隐私和数据写入规则 |

“可组合”不等于所有页面都可随意编排；“Hybrid”就是展示灵活性与交易确定性的正式安全边界。

## 3. 平台逻辑拓扑

```text
运营发布/配置来源
        |
        v
Published Page Manifest + Theme/Asset Envelope
        |
        v
Manifest Delivery
  校验 -> 版本 -> 缓存 -> last-known-good -> 内置回退
        |
        v
Customer Composition Runtime
  CompositionEngine -> ComponentRegistry -> ActionRegistry
        |                     |
        |                     v
        |               已审核客户端组件白名单
        v
Data Coordinator -> @xlb/api-client -> 现有后端业务 API
        |
        v
Page Renderer + Design System + Theme/Brand/Asset Runtime
        |
        v
顾客端页面 + 曝光/交互/错误/性能观测
```

后端业务 API 继续决定业务事实；Manifest 只决定允许的 UI 组合与呈现。组合引擎不能成为绕过业务 API、共享类型或校验器的第二套业务系统。

## 4. 架构分层与职责

### 4.1 App Shell

- 负责应用启动、路由、会话门、城市上下文、全局错误边界和页面容器。
- 不直接解释运营配置，不承载具体业务区块 JSX。
- 固定交易页面仍由 App Shell 和路由装配。

### 4.2 Customer Design System

- 由 Design Tokens、UI Primitives、公共状态组件和可访问性规则构成。
- 所有 Customer 组件使用 Token，不在组件内部写死品牌颜色。
- 已确认视觉真相继续由 `VISUAL_AUTHORITY.md` 管理。

### 4.3 Customer Component Platform

- 业务组件是可复用、可测试、可观测的展示资产。
- 注册表只解析客户端预先注册并发布的组件类型。
- 每个组件声明受控属性、数据需求、动作能力、支持版本和降级行为。
- 通用 `CustomerComponentRegistry` 是现有基础能力；主页专用白名单和元数据能力在后续工程建立。

### 4.4 UI Manifest Contract

- Manifest 是页面结构的服务端发布契约，不是任意 JSON 渲染器。
- 必须具有 Schema 版本、页面标识、修订号、作用域、组件实例、数据引用、动作引用、生效窗口和回退语义。
- 必须通过 `packages/types` 与 `packages/validators` 建立唯一共享事实，不能在 App 内复制类型或校验逻辑。
- 字段、枚举和严格校验规则属于第2工程，本工程只冻结职责和边界。

### 4.5 Composition Runtime

- `HomeCompositionEngine` 负责验证后的清单解析、条件判定、排序、能力匹配和组件树生成。
- `HomeComponentRegistry` 负责主页组件白名单解析，不执行远端代码。
- `HomeRenderer` 负责渲染边界、实例级错误隔离、占位和降级。
- `ActionRegistry` 只接受应用拥有的动作键；Manifest 不得携带可执行脚本或任意 URL 行为。

### 4.6 Data Orchestration

- `HomeDataCoordinator` 根据受控数据键调用现有适配器与 `@xlb/api-client`。
- 组件只接收已经归一化的 ViewModel，不直接发起 API 请求。
- 请求聚合、去重、取消、缓存、超时和局部失败由协调层处理。
- Catalog、订单、价格和权限事实仍来自现有后端契约。

### 4.7 Operations Control Plane

- 负责草稿、校验、审核、预览、定时、灰度、发布、下架、回滚和审计记录。
- 顾客端只消费“已发布、可读取”的解析结果，不承担运营写入能力。
- 本次 Customer UI 范围不包含 Admin/OA 可视化编辑器；控制面 API 与存储属于后续独立高风险工程。

### 4.8 Theme / Brand / Asset Runtime

- 品牌 Logo 必须通过 `BrandLogo` 组件提供，当前默认值为 `xlb100`，可由受控品牌配置替换。
- 换肤只允许覆盖白名单 Token，不得改变状态色、焦点、权限或交易含义。
- 远端资产必须遵守来源白名单、完整性、体积、尺寸、无障碍文本和回退策略。
- 仓库现有 Runtime Theme 类型、校验器和 Resolver 可复用，但当前没有 Customer SDUI 交付 API。

### 4.9 Reliability

- 页面必须具备远端当前版本、last-known-good、本地内置安全版本三层回退。
- 单个组件失败不得导致整个主页白屏。
- 未知组件、未知动作、无效属性、过期配置和作用域不匹配必须拒绝或安全降级。
- Kill switch 能够在不发版的情况下停用远端编排并恢复内置安全主页。

### 4.10 Observability

- 所有观测事件携带页面、Manifest 修订、组件类型、组件实例和结果状态。
- 至少覆盖加载、校验、回退、渲染、曝光、点击、动作、数据失败和性能。
- 观测失败不能阻断顾客主流程；不得采集 Manifest 未授权的个人信息。

## 5. “热插拔”的正式安全含义

顾客端的热插拔是 **配置驱动地启用、停用、排序或替换客户端已注册组件**，不是远程下载并执行任意 JavaScript。

允许：

- 将 `service_grid` 从第2位调整到第1位。
- 对指定城市或版本启用 `recommend_list`。
- 下架一个发生数据故障的区块。
- 用注册表中兼容的新组件类型替换旧类型。
- 切换允许的品牌 Logo、主题 Token 和已校验资产。

禁止：

- Manifest 携带脚本、表达式求值器或动态 `import()` 地址。
- Manifest 直接指定任意 API URL、数据库字段或支付动作。
- 未注册组件绕过注册表进入渲染树。
- 运营配置改变订单状态、金额、优惠资格、权限或退款规则。

新增组件代码仍然需要正常开发、测试和客户端发布；发布后才可以由 Manifest 动态启用。

## 6. 数据、动作与业务工作流边界

```text
Manifest              决定“展示哪个受控组件”
Component Registry    决定“客户端是否认识并允许该组件”
Data Coordinator      决定“该组件可读取哪个受控数据源”
Action Registry       决定“该组件可触发哪个应用动作”
Backend Workflow      决定“业务动作是否成立以及产生什么结果”
```

- UI 编排不复制后端状态机。
- UI 条件不能被当作授权判断。
- 客户端显示价格不构成金额事实，提交结果以现有业务 API 为准。
- 页面配置不得直接写服务类目；正式类目只来自官方 Catalog 与 API。
- 所有跨包契约继续经过 `packages/types`、`packages/validators` 和 `@xlb/api-client`。

## 7. 生命周期与版本治理

目标生命周期：

```text
Draft -> Validate -> Review -> Preview -> Schedule/Publish
      -> Resolve by scope -> Deliver -> Validate on client
      -> Render/Observe -> Roll back or Retire
```

必须遵守：

- Schema 版本与内容修订号分离。
- 客户端声明支持的 Schema/组件能力，服务端只下发兼容内容。
- 发布是不可变修订；修正通过新修订完成，不原地改写已发布内容。
- 灰度、城市、语言和客户端版本作用域由服务端解析，客户端仍要防御性复核。
- 缓存键必须包含页面、作用域和修订身份，不能跨城市或用户上下文串用。
- 回滚指向已验证修订；没有可用远端修订时使用内置安全主页。

## 8. 代码所有权目标

以下是目标边界，不代表第1工程现在创建这些实现：

```text
packages/types
  Customer SDUI 共享类型（第2工程）

packages/validators
  Customer SDUI 严格校验器（第2工程）

packages/customer-components
  foundation/  tokens/  common/
  home/        service/ order/ user/ ...
  registry metadata and component exports

apps/customer/src/platform/sdui
  delivery/ composition/ data/ actions/ telemetry/ fallback/

apps/customer/src/features/home
  Home page adapter, ViewModels and composition entry

backend
  Published manifest resolution and operations control plane（第6工程）
```

业务组件不得直接依赖后端实现；后端不得认识 React 组件实现，只认识共享的组件类型标识和受控配置契约。

## 9. 十个施工步骤与依赖

| 步骤 | 工程 | 硬依赖 | 可并行关系 | 完成门槛 |
| --- | --- | --- | --- | --- |
| 1 | 架构重新定基线 | Customer V2 foundation | 必须单独完成 | 本文、总计划、边界和门禁冻结 |
| 2 | SDUI 共享契约 | 1 | 必须在1后串行 | types + validators + 兼容性测试 |
| 3 | 前端组合运行时 | 2 | 与5、6、7并行 | Engine/Registry/Renderer/Action 边界通过测试 |
| 4 | Manifest 交付与容灾 | 2、3接口稳定 | 可与6、7并行 | 缓存、LKG、内置回退、kill switch |
| 5 | 数据与动作协调 | 2 | 与3、6、7并行 | 受控数据键、请求治理、动作白名单 |
| 6 | 服务端运营控制面 | 2 | 与3、5、7并行 | 发布读取闭环、审核/灰度/回滚；高风险确认 |
| 7 | 主题、品牌与资产运行时 | 2 | 与3、5、6并行 | Token/Logo/资产白名单及回退 |
| 8 | 动态主页垂直落地 | 3、4、5、6、7 | 汇合后串行 | 批准 PNG 视觉 + 真实 Manifest 运行闭环 |
| 9 | 完整可观测性 | 3—8事件点 | 基础设施可提前，完整接入在8后 | 事件、指标、诊断和版本关联 |
| 10 | 集成、故障演练与验收 | 1—9 | 必须最后串行 | 故障矩阵、回滚、性能、安全、视觉验收通过 |

仓库同时最多三个写入单元。步骤1和2是不可并行的架构门禁；步骤8不得以静态页面或本地假 Manifest 冒充商业闭环；步骤10通过前不得宣称平台完成。

## 10. 当前状态与差距

截至本基线：

- 已完成 Customer V2 视觉基础、Token、`BrandLogo`、公共状态组件和通用注册表雏形。
- 旧顾客端页面已经从 foundation 清除，尚未形成新的固定主页，因此现在补齐架构不会产生页面迁移返工。
- 仓库已有可复用的 Runtime Theme 类型、严格校验和纯 Resolver。
- 尚不存在 Customer `HomePageManifest` 共享契约、主页专用注册表、组合引擎、Manifest Delivery、数据协调器、Customer 发布 API 或运营控制面。
- 后续不能直接进入主页 JSX 施工；必须先完成第2—7工程的集成门槛。

## 11. 第1工程完成标准

第1工程只在以下条件全部满足时完成：

1. Hybrid SDUI 成为 Customer UI V2 的正式目标架构。
2. 动态页面与固定安全模板的边界明确。
3. Manifest、组件、数据、动作、主题、控制面、可靠性与观测职责明确。
4. 热插拔被限定为已注册组件白名单，不允许远端任意代码。
5. 后端业务事实与 UI 编排职责隔离。
6. 十个施工步骤、硬依赖、并行关系和高风险门禁明确。
7. 当前已具备能力与缺失能力被如实记录。
8. 本工程不提前创建第2工程共享契约或第3工程运行时代码。

满足以上标准后，第2工程可以开始；在第2工程完成前，步骤3—7不得并行开工。
