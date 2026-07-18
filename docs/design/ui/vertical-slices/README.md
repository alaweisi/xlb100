# XLB 三端纵向切片

本目录定义喜乐帮三端 UI 的业务场景切片标准。它回答三个问题：

1. 什么情况下必须建立一个独立切片；
2. 每个切片必须记录哪些后端事实、产品判断和设计证据；
3. 一个切片达到什么条件后才能进入 Figma、代码实现和验收。

## 当前文件

- `SLICE_CONTRACT_STANDARD.md`：切片定义、边界、编号、必填字段和验收规则。
- `SLICE_CONTRACT_TEMPLATE.md`：创建顾客端、师傅端或后台切片时直接复制的模板。
- `SLICE_LEDGER.md`：顾客端、师傅端和后台的全量场景索引、跨端交接与 UI 缺口总账。
- `SLICE_SCOPE_BASELINE.md`：三端正式范围、36 个承载容器、优先级、跨端主链、缺口归属和施工批次。
- `SCREEN_STATE_COMPONENT_BOUNDARY.md`：完整画面、页面区域、Overlay、状态组件和微型变体的统一判定标准。
- `SCREEN_STATE_COMPONENT_MATRIX.md`：36 个 Carrier 的 Base Frame、State Frame、Region 和 Overlay 具体边界。
- `FRAME_MAP.md`：36 个 Base、7 个 Gate 状态和 61 个业务 State Frame 的顶层画面地图。
- `FRAME_MAP_SLICE_BINDINGS.md`：214 条 Slice ID 到页面、状态、区域、浮层、状态组件和微状态的唯一绑定。
- `INTERACTION_STATE_INVENTORY.md`：三端操作生命周期、全局状态、Overlay、输入、设备、深链和无障碍清单。
- `../production-control/`：214 条切片的真实代码、中文、API、测试、Edge 证据和最终验收控制面。纵向切片目录负责定义，生产总控负责证明交付。

## 阶段状态

| 阶段 | 状态 | 完成依据 |
| --- | --- | --- |
| 一、每个切片的标准定义 | `COMPLETE`（2026-07-17） | 正式标准、单片模板、三端候选总账、跨端交接、DoR/DoD 和一致性检查均已完成。 |
| 二、三端全量切片范围 | `COMPLETE`（2026-07-17） | 214 条切片全部完成范围决议，并映射到 36 个承载容器、20 条交接、三级优先级和 B0～B5 施工批次。 |
| 三、画面与状态组件的边界 | `COMPLETE`（2026-07-17） | 七级表达模型、全局升级规则、三端 36 个 Carrier 边界矩阵、现有组件复用边界和组件库缺口均已确定。 |
| 四、Frame Map 与交互状态清单 | `COMPLETE`（2026-07-17） | 214 条切片逐一绑定；顶层 Frame 确定为 104；36 个 Carrier 的动作、浮层、持久结果、运行态、设备态和无障碍清单完成。 |

第一至第四阶段均作为已关闭基线；只有发现新的后端事实、标准矛盾或经确认的范围变更时才修订。总账中的 `BOUND` 表示事实链已接通，不表示最终视觉设计或代码实现已经完成。

## 与现有契约的关系

```text
后端状态机 / API / 权限
  -> Slice Contract（为什么存在这个场景、角色如何交接）
  -> WorkflowUiBinding（状态和动作如何进入页面）
  -> Figma Frame / Component Variant（如何表达）
  -> apps/customer | apps/worker | apps/admin（如何实现）
  -> 测试与截图证据（如何证明）
```

本目录不替代：

- `docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md`
- `packages/types/src/workflowUiBinding.ts`
- `packages/types`、`packages/validators`、`@xlb/api-client` 中的业务契约

Figma 与 PNG 是视觉参考和设计证据，不是业务状态、权限或可执行动作的事实来源。
