# P9 Customer SDUI 可观测性真实接入

> 当前状态：P8 `0f7fa01f` 与 P9 foundation `be101c83` 已通过双祖先
> merge 汇合。本文描述真实运行时接线，不代表已有遥测后台端点。

## 真实事件来源

| 来源 | 接入事件 |
| --- | --- |
| HomePage | page view、Manifest 加载起止、Composition/Data 性能、主页异常 |
| HomeManifestDelivery | remote/fresh-cache/LKG/builtin、offline、kill-switch、circuit、server fallback，以及真实 transport timeout |
| HomeCompositionEngine | Manifest/组件能力校验结果、ready/degraded/rejected、有限 issue 汇总 |
| HomeDataCoordinator | source 开始、fresh cache、stale fallback、成功、错误、timeout、coalesced，以及 batch 状态/计数 |
| HomeRenderer | 真实直接槽位 DOM render、slot isolation error、可见曝光 |
| HomeActionRegistry | 真实 invoke、成功、失败、拒绝和耗时；不读取 payload |
| CustomerPresentationProvider | BrandLogo/asset 的 default/loading/ready/asset-failure 回调 |

## 隐私与低基数

- 关闭式事件名、结果、属性键和 shared contract 枚举。
- 不采集搜索原文、精确地址、token、用户标识、action payload、Manifest props、
  data source ID、request ID、异常 message/stack。
- Error name/code 归一到有限集合；未知值落为 `OtherError`/`unknown`。
- 组件实例 ID 经格式和长度限制后仅用于事件关联；指标属性只包含关闭式
  component type、region 和 `0..999` order。
- Composition issue 只记录数量和首个关闭式 issue code，不记录 message。
- Data batch 只记录有限状态计数，不记录业务值或标识符。

## 流量与失败隔离

- 采样在 page-view client 创建时一次决定，避免同一页面内逐事件随机失真。
- 默认采样率 `0.1`，可用 `VITE_CUSTOMER_TELEMETRY_SAMPLE_RATE` 在 `0..1`
  内调整。
- 默认队列上限 200、批次 20、两秒 flush；达到批次立即 flush。
- 页面隐藏和 `pagehide` 最多 drain 四个批次。
- Sink 失败将批次放回限长队列；溢出时按可计算的最旧事件丢弃策略处理。
- 遥测回调、采样、序列化和发送失败均不得传播到 Delivery、Data、Action 或
  Render 主流程。

## 网络事实

仓库没有 Customer SDUI 遥测接收 API，因此默认使用 Noop Sink。只有部署环境
显式配置同源 `VITE_CUSTOMER_TELEMETRY_ENDPOINT` 时，浏览器才使用 Beacon，
Beacon 不可用或拒绝后才使用 `fetch(..., keepalive: true)`。跨域端点被拒绝。
