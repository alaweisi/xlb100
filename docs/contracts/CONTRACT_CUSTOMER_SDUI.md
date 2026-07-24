# Customer Hybrid SDUI 共享契约

> 状态：v1 / Customer SDUI Step 2
>
> 适用范围：顾客端可组合页面；v1 仅开放 `customer.home`

## 唯一事实源

- TypeScript 类型与白名单常量：`packages/types/src/customerSdui.ts`
- Zod 严格校验：`packages/validators/src/customerSduiSchema.ts`
- 兼容性与安全边界测试：`tests/contract/customerSdui.contract.test.ts`

应用、后端和后续运营控制面不得复制 Manifest 类型或自行扩展字符串。新增 Schema、组件、数据键或动作键，必须先对共享契约做显式的兼容版本变更。

## v1 契约组成

```text
CustomerSduiManifestEnvelope
  -> resolution / kill switch / cache TTL / scope proof
  -> CustomerSduiPageManifest | null
       -> schema + component contract version
       -> page scope + immutable revision + content hash
       -> stable basis-point rollout policy
       -> typed component instances
       -> allowlisted data sources
       -> application-owned actions
       -> publication window
       -> LKG -> builtin fallback policy
```

Manifest 只描述可展示内容。Catalog、价格、订单状态、权限、支付、退款和售后事实仍由既有后端 API 决定。

## 组件白名单

v1 主页只接受：

- `location_header`
- `search_bar`
- `service_grid`
- `promotion_banner`
- `recommend_list`
- `worker_nearby`
- `trust_guarantee`
- `bottom_navigation`

每种组件都有独立、严格、无透传字段的 Props 契约和固定区域。`location_header`、`search_bar`、`bottom_navigation` 是保护性主页壳：必须各有且仅有一个并保持启用；运营内容组件可以通过 Manifest 启停、排序和组合。

## 数据与动作

数据引用只允许共享 `CUSTOMER_SDUI_DATA_KEYS` 中的数据键，并使用每个数据键独立的参数 Schema。组件通过 `dataRef` 引用同一 Manifest 中的数据源；组件不能指定 URL，也不能直接请求 API。

动作只允许共享 `CUSTOMER_SDUI_ACTION_KEYS` 中的应用动作键。Manifest 只能将组件交互槽绑定到一个动作引用，不能提供脚本、动态 import、外部 URL、路由字符串或任意执行参数。具体执行由后续 `ActionRegistry` 接管，后端继续做权限和业务有效性判断。

## 严格校验与拒绝规则

客户端和服务端必须使用同一校验器，并至少拒绝：

- 未支持的 Schema 或组件契约版本；
- 未注册组件、数据键和动作键；
- Props、数据参数或顶层对象中的未知字段；
- 重复组件、数据、动作标识或同区域重复顺序；
- 找不到目标的数据与动作引用；
- 组件插槽绑定了不属于该组件的数据键或动作键；
- 错误组件区域、被停用的保护性主页壳或无有效内容区；
- 非法城市、重复作用域、反向客户端版本区间；
- 超出 1—10000 基点的灰度比例或不安全的分桶种子；
- 错误生效/过期时间和非 SHA-256 内容摘要；
- 非 published 响应携带远端 Manifest；
- kill switch 响应携带缓存 TTL 或远端 Manifest；
- Envelope 与 Manifest 使用不同回退策略。

## 兼容策略

- `schemaVersion` 描述 Manifest 总体结构；`componentContractVersion` 描述组件输入能力，两者独立演进。
- v1 使用关闭集合和严格对象校验，不做“忽略未知字段”的静默前向兼容。
- 客户端不认识的版本必须拒绝远端内容并进入 LKG/内置主页回退。
- 已发布修订不可原地改写；内容变化使用新 `revision` 和新 `contentHashSha256`。
- 新增组件代码仍需正常开发、测试和客户端发布；只有客户端注册后，运营配置才能动态启用。

## 本步骤不实现的内容

本契约同时定义控制面后续必须使用的草稿、审核、发布、下架、回滚、Kill Switch、CAS版本和幂等请求形状，但不实现这些操作。

本契约不包含 React 渲染、Registry、Composition Engine、网络加载、缓存、数据请求、动作执行、后端发布存储或运营编辑器。这些能力分别由后续第3—7工程依赖本契约实现。
