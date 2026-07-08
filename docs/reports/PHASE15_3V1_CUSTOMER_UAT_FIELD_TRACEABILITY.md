# Phase 15.3V-1 Customer UAT Field Traceability (C端 /customer/*)

基于 `PHASE15_3V1_CUSTOMER_BACKEND_UI_CONTRACT_MAP.md`，输出 `/customer/`、`/customer/services`、`/customer/order/create` 在 UAT 折叠面板中的字段追溯关系。  
规则：若字段无真实后端字段且未有可验证来源，统一标记 `CONTRACT_MISSING`。

## A. UAT 字段映射表

| UAT 字段 | 合同/API 来源 | API 方法 | 适配器 ViewModel | 页面/组件 | 可追溯性 |
|---|---|---|---|---|---|
| `city_code` | 请求上下文 Header | 所有 C 端 API 均需 `x-xlb-city-code`（`catalog`,`quote`,`orders`,`payment`） | 页面状态 + 透传 | `/customer/`、`/customer/services`、`/customer/order/create` | `CityAware pages`、`LocationSearchBar` | 部分可追溯（不是响应字段，来源于请求 context） |
| `searchQuery` | URL query / 页面输入（无专用 search API） | `CONTRACT_MISSING` (`/api/catalog/search` 不存在) | 页面状态 | `/customer/services`（`q`） | `LocationSearchBar` | 前端态 |
| `matchedSkuCount` | 本地筛选结果长度（依赖 catalog 列表） | `customerApi.getCatalog()` + 本地筛选 | `CustomerServicesPage` 组合值 | `/customer/services` | `CustomerServicesTemplate` / `ServiceDiscoveryCard list` | 可追溯（derived） |
| `selectedSkuId` | 目录项选择结果 | `catalog` -> `skus[].skuId` | `getCatalogSkus()` 产出 `skuId` | `/customer/services`→`/customer/order/create` | `ServiceDiscoveryCard` / `ServiceSelectionSummary` | 可追溯 |
| `selectedSkuName` | 目录项选择结果 | `catalog` -> `skus[].name` | `getCatalogSkus()` 产出 `name` | `/customer/services`→`/customer/order/create` | `ServiceSelectionSummary` | 可追溯 |
| `quote` | 报价接口 | `customerApi.getPriceQuote(skuId)` (`GET /api/pricing/quote`) | `toCustomerQuoteViewModel()` | `/customer/order/create` | `CustomerQuoteCard` | 可追溯 |
| `createOrderPayload` | 订单创建请求体（仅真实字段） | `customerApi.createOrder(payload)` (`POST /api/orders`) | 页面组装 payload，不含 `cityCode` 字段 | `/customer/order/create` | 页面/Adapter 日志面板 | 部分可追溯（`cityCode` 非 body 字段） |
| `orderId` | 创建订单响应 | `customerApi.createOrder(payload)` | `order.orderId`（`OrderResponse`） | `/customer/order/create` | `OrderCard` / UAT 折叠面板 | 可追溯 |
| `paymentOrderId` | 创建支付单响应 | `customerApi.createPaymentOrder(request)` (`POST /api/payments/orders`) | `paymentOrder.paymentOrderId` | `/customer/order/create` | `OrderCard` / UAT 折叠面板 | 可追溯 |
| `orderDetail` | 订单详情读取 | `customerApi.getOrder(orderId)` (`GET /api/orders/:orderId`) | `OrderResponse` / `toOrderStatusViewModel()` | `/customer/order/create`（提交后复读） | `OrderCard` / `CustomerAnswerCard` | 可追溯 |
| `workflowState` | 规则绑定层（非独立字段） | `CONTRACT_MISSING` | `createCustomerWorkflowBinding().state` | `/customer/`、`/customer/services`、`/customer/order/create` | `WorkflowStatePanel`（仅 UAT） | 可追溯（Adapter 合成） |
| `availableActions` | 规则绑定层（非独立字段） | `CONTRACT_MISSING` | `createCustomerWorkflowBinding().availableActions[]` | `/customer/`、`/customer/services`、`/customer/order/create` | `ActionDock` / `WorkflowStatePanel`（仅 UAT） | 可追溯（Adapter 合成） |
| `disabledReason` | 规则绑定层（非独立字段） | `CONTRACT_MISSING` | `createCustomerWorkflowBinding().disabledReasons[]` | `/customer/`、`/customer/services`、`/customer/order/create` | `WorkflowStatePanel`（仅 UAT） | 可追溯（Adapter 合成） |
| `catalog source endpoint` | 目录源接口 | `customerApi.getCatalog()` (`GET /api/catalog`) | `getCatalogSkus()` 映射 | `/customer/`、`/customer/services` | `LocationSearchBar` + 列表 | 可追溯 |
| `searchMode` | 查询执行策略（非 API 字段） | `CONTRACT_MISSING`（无 search API） | 页面本地判定（`q` 存在且使用客户端筛选） | `/customer/services` | `LocationSearchBar` / UAT 面板 | 前端态 |

## B. CONTRACT_MISSING 缺口清单（V-1 交付线内）

| 缺口 ID | 缺口字段 / 能力 | 影响 | 当前承载方式 | 风险 | 推荐处理 |
|---|---|---|---|---|---|
| `CONTRACT_MISSING-01` | `/api/catalog/search` | `/customer/services` 无服务端检索接口，搜索质量受客户端筛选范围影响 | `GET /api/catalog` + `useMemo` 客户端过滤 + `q` query | 大 catalog 端的检索性能与语义一致性依赖后端 | 记录 `searchMode=client-filter`，限制一次性 catalog 结果范围；后续接入服务端搜索后回切 |
| `CONTRACT_MISSING-02` | `estimated_price` / `inspection_fee` / `final_price` | UAT 清单中报价分解字段无法真实展示 | `PriceQuoteResponse` 未提供这些字段 | 前端避免硬编码“估价/上门费/实付”衍生值 | 在 UAT 字段中标记 `N/A` 并固定展示 `basePrice/priceType/currency` |
| `CONTRACT_MISSING-03` | `workflowState` / `availableActions` / `disabledReason` 后端直接字段 | 无法按 REST contract 原始响应展示 | `workflowBindings` 由前端/适配层注入 | 与后端真实状态定义一致性依赖绑定层维持 | 文案上保持 UAT 区隔，并保持可追溯注释 |
| `CONTRACT_MISSING-04` | 支付结果流状态（成功/失败明细） | 无真实回调与状态流事件接入 | 目前仅 `POST /api/payments/orders` + mock webhook 辅助 | 支付链路不能宣称真实完成 | UAT 仅展示 `paymentOrderId` 与 `paymentOrder.status` |
| `CONTRACT_MISSING-05` | 真实订单列表 contract（本阶段） | `/customer/orders` 列表链路仍非主链路 | “回读详情”作为验证，不作为列表主数据源 | 无法提供完整订单历史 | 当前阶段不新增列表 contract，限定到详情态 |

## C. 仅 UAT 面板可见字段与可公开字段建议

- UAT 可见（验收/排障）：
  - `city_code`
  - `searchQuery`
  - `matchedSkuCount`
  - `catalog source endpoint`
  - `searchMode`
  - `selectedSkuId`
  - `selectedSkuName`
  - `quote`
  - `createOrderPayload`
  - `orderId`
  - `paymentOrderId`
  - `orderDetail`
  - `workflowState`
  - `availableActions`
  - `disabledReason`
- 用户主界面默认隐藏（仅开发验收字段）：
  - 接口术语与技术词汇：`API source`、`client-filter`、`mock`、`fake`、`dummy`、`contract missing`、`workflowState`、`disabledReason` 等；其中前端展示中仅保留友好业务文案。

## D. 本次扫描结论

- `catalog->pricing->order->paymentOrder->orderDetail` 的主链路已具备真实后端来源。  
- `/customer/services` 查询链路存在唯一明显缺口：无服务端检索 API。  
- `workflowState/availableActions/disabledReason` 不可标为 API 原生字段；应持续说明“由 workflow binding 提供”。  
- UAT 面板必须保留上述合同缺口标记，避免“已验证”但字段造假。
