# P9 Customer SDUI 可观测性基础设施

> 当前状态：foundation-only。P8 未完成，不得标记 P9 已开启或完成。

## 已允许提前施工

- 统一事件信封与顺序号。
- Manifest、组件、数据、动作、性能、异常事件分类。
- 内存限长缓冲与批量 Sink 接口。
- Sink 失败不阻断顾客流程，失败批次留在内存等待后续重试。
- 关闭式属性白名单；拒绝自由文本、手机号、地址、消息、Manifest 内容和业务载荷。
- 性能 Span 基础。
- 异常分类基础，不采集 message、stack 或任意 payload。
- 组件曝光阈值、最短可见时间和单实例单次曝光状态机。

## P8 前硬禁止

- 不修改 P3—P8 分支实现。
- 不接入根 ErrorBoundary、主页组件、数据协调器或动作注册表。
- 不建立未经确认的遥测后台端点。
- 不使用静态或虚假 Manifest 制造“已有完整埋点”的结论。
- 不把埋点成功作为业务成功条件。

## P8 后接入矩阵

| 来源 | 完整接入事件 |
| --- | --- |
| P3 Composition Runtime | validation、composition、component render/click、action dispatch |
| P4 Delivery | remote load、cache、LKG、builtin fallback、kill switch |
| P5 Data/Action | data load、dedupe、timeout、action result |
| P6 Control Plane | revision publish/resolve/rollback/retire 的服务端指标与审计关联 |
| P7 Presentation | theme、Logo、asset resolve/fallback |
| P8 Home | page view、首屏内容、真实组件曝光、交互与视觉性能 |

完整接入必须携带 `pageId`、`manifestId`、`manifestRevision`、组件类型、组件实例和结果状态；在 Manifest 尚未解析的失败事件中，Manifest 字段显式为 `null`。
