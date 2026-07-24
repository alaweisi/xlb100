# Customer SDUI telemetry

P9 已从基础设施阶段接入真实 Customer Home 运行时。

- 事件只来自 HomePage、Delivery、Composition、DataCoordinator、Renderer、
  ActionRegistry 和 Presentation 的真实返回值或回调。
- 事件信封、事件名、结果、属性键、组件类型、数据键和动作键均为关闭式契约。
- 不接收 action payload、搜索原文、地址、token、用户标识、Manifest props、
  sourceId/requestId、异常 message 或 stack。
- 组件实例 ID 只作为事件关联字段；指标属性只使用受限的组件类型、region 和
  `0..999` order。
- 默认按 page view 采样，内存队列限长、分批发送；失败批次留在限长队列中，
  所有发送错误 fail-open。
- 页面隐藏和 `pagehide` 会触发有限批次 flush。
- 只有配置显式、同源的 `VITE_CUSTOMER_TELEMETRY_ENDPOINT` 才会建立网络 Sink；
  未配置时使用 Noop Sink，不伪造后端采集能力。
