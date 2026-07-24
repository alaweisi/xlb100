# Customer Home Manifest Delivery

状态：P4 本地交付层。该模块不实现主页视觉，不拥有或复制 Customer SDUI Schema。

## 边界

- `@xlb/types`：唯一 Manifest/Envelope 类型来源。
- `@xlb/validators`：唯一严格运行时校验来源。
- P3 Composition Runtime：消费本模块交付的已验证 Manifest。
- P5 Data Coordinator：消费 Manifest 中已经校验的数据源定义。
- P6 ApiClient：通过适配器实现 `HomeManifestTransport`；P4 不改写共享 ApiClient。

当前适配接缝：

```ts
interface HomeManifestTransport {
  load(context: HomeManifestRequestContext, signal: AbortSignal): Promise<unknown>;
}
```

Transport 只负责远端读取，Delivery 使用共享 Envelope Schema 拒绝非法响应。P6
提供的 ETag、响应元数据与 `notModified` 条件读取将在 P3—P7 统一汇合时由专用适配器
接入；在共享 ApiClient 契约冻结前，本模块不复制临时返回类型。

## 交付决策

```text
有效新鲜缓存
  -> fresh cache

离线 / 熔断开启
  -> compatible LKG within maximumStaleSeconds
  -> builtin safe manifest

远端请求
  -> bounded timeout + AbortSignal
  -> shared Envelope validation
  -> scope / locale / app-version / active-window compatibility
  -> authoritative remote manifest + replace cache

非法响应 / 超时 / 网络失败 / 服务端回退
  -> compatible LKG
  -> builtin safe manifest

Kill Switch
  -> clear cached remote manifest
  -> builtin safe manifest
```

## 安全与可靠性约束

- 同一 Delivery 实例采用 latest-wins；旧请求被取消后不得写缓存或累计熔断失败。
- 默认远端等待上限为 5 秒，可按运行环境配置；超时主动中止并累计上游失败。
- 默认连续三次上游失败开启熔断，30 秒后允许半开探测。
- 缓存按页面、城市、语言和客户端版本隔离。
- LKG 必须重新通过共享 Manifest Schema 与客户端兼容检查。
- 缓存 TTL 不得超过共享 Envelope 契约允许的 3600 秒。
- 服务端发布结果是权威来源，合法旧修订可以覆盖当前缓存，从而支持控制面回滚。
- Kill Switch 响应不得缓存，并清除对应作用域的既有 LKG。
- 内置 Manifest 只保留受保护主页壳和 Catalog 服务入口，不携带正式服务内容。

## 非本步骤范围

- P8 主页组件视觉与布局。
- P6 共享 ApiClient 的 ETag/304 返回契约。
- 控制面发布、鉴权、数据库存储。
- 内容哈希重算；当前共享契约只冻结了 SHA-256 字段格式，尚未定义跨端规范化序列化算法。
