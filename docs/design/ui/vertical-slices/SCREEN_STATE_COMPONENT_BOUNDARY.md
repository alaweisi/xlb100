# XLB 画面与状态组件边界标准

## 1. 目的

本标准定义一个纵向切片应当由完整画面、页面区域、详情面板、覆盖层、状态组件还是微型变体承载。

它解决三个问题：

1. 哪些状态变化必须让用户看到一个完整、可留证的场景；
2. 哪些状态只能在当前任务上下文中局部表达；
3. 哪些信息不能被降级为 Toast、StatusTag、禁用按钮或颜色差异。

范围基线见 [SLICE_SCOPE_BASELINE.md](./SLICE_SCOPE_BASELINE.md)，36 个承载容器的具体决议见 [SCREEN_STATE_COMPONENT_MATRIX.md](./SCREEN_STATE_COMPONENT_MATRIX.md)。

## 2. 核心原则

### 2.1 画面承载任务，组件表达状态

- **画面**回答：我是谁、我在处理什么、为什么来到这里、当前责任是什么、下一步去哪里；
- **状态组件**回答：这个对象或区域现在怎样、为什么这样、还能做什么；
- **动作组件**回答：当前契约允许执行哪些动作以及为什么不能执行其他动作；
- **微型变体**只负责视觉区分，不承担业务解释。

当一个组件开始承担新的用户目标、责任交接或完整恢复路径时，它已经越过组件边界，应升级为区域、覆盖层或完整画面。

### 2.2 同一 Slice ID 不因表达层级变化而改变

Slice ID 描述业务场景，不描述 Figma 节点类型。一个切片从 Drawer 升级为 State Frame 时，Slice ID 保持不变，只更新 `designBinding`。

### 2.3 不建立新的业务契约

本标准不是新的 TypeScript 状态模型。状态、动作、权限、原因、幂等和审计继续来自：

- `packages/types`；
- `packages/validators`；
- `@xlb/api-client`；
- 后端状态机和权限；
- `WorkflowUiBinding` / `WorkflowActionContract`。

## 3. 七级表达模型

| Code | 名称 | 定义 | 是否独立截图 | 是否拥有主动作 |
| --- | --- | --- | --- | --- |
| `GATE` | App / Shell Gate | 身份、账号、城市或全局权限阻断整个产品区域。 | 必须 | 可以，只限恢复或退出动作 |
| `FRAME` | Route / Workbench Frame | 稳定的信息架构容器，拥有标题、导航、主对象和主要任务。 | 必须 | 可以 |
| `STATE_FRAME` | Complete State Frame | 同一 Carrier 内，因业务状态导致任务、主动作、风险或交接明显改变的完整构图。 | 必须 | 可以 |
| `REGION` | Page Region / Detail Panel | 保留当前页面任务，只更新一个对象、证据、时间线或工作区。 | 视风险 | 可以，但不能改变页面主任务 |
| `OVERLAY` | Dialog / Drawer / Bottom Sheet | 在当前上下文中完成短而有边界的选择、确认、编辑或查看。 | 高风险时必须 | 可以，关闭后回到原任务 |
| `STATE_COMPONENT` | State Block / Banner / Action State | 表达 loading、empty、error、disabled、handoff、partial result 等局部状态。 | 通常不独立 | 只能提供恢复或局部动作 |
| `MICRO_VARIANT` | Tag / Badge / Icon / Tone | 颜色、标签、图标、按钮可用性、倒计时等微型差异。 | 否 | 不拥有独立业务动作 |

`FRAME` 是稳定容器；`STATE_FRAME` 是同一容器的完整业务状态版本。两者都属于“画面”。

## 4. 什么时候必须升级为完整画面

满足以下任意一条，默认使用 `GATE` 或 `STATE_FRAME`：

1. 用户的主要目标发生变化；
2. 页面主要对象发生变化，例如从订单列表进入单个订单详情；
3. 主动作发生变化，例如“等待师傅”变成“确认服务”或“处理争议”；
4. 下一责任角色或跨端交接发生变化；
5. 状态进入不可逆、终态或高风险分支；
6. 当前状态阻断整页任务，且用户必须先理解原因再恢复；
7. 结果需要成为测试、审计、客服或用户留证的完整证据；
8. 页面超过一半的业务信息层级或操作区需要重组；
9. 移动端覆盖层将形成多步骤、长表单、复杂证据或独立深链；
10. 后台操作需要独立 URL、可刷新恢复或可分享给其他操作员定位。

典型完整画面：

- 身份失效、账号 suspended/disabled；
- 订单等待派单、服务完成、取消；
- 顾客确认 disputed；
- 支付 paid/failed/closed；
- 师傅履约 accepted/in_progress/completed/cancelled；
- 认证 approved/rejected/expired；
- 后台无城市范围、整页无权限；
- 高风险流程的明确终态。

## 5. 什么时候保持为页面区域

满足全部条件时使用 `REGION`：

- 用户仍在完成同一个主要任务；
- 页面主对象或工作队列不变；
- 新信息是证据、时间线、详情、子对象或局部结果；
- 区域关闭或切换后不丢失任务上下文；
- 不需要独立深链或刷新恢复；
- 局部动作失败不会使整个页面事实失效。

典型区域：

- 订单详情中的评价和退款申请记录；
- 履约详情中的证据列表与顾客确认状态；
- 售后详情中的时间线、责任决定和补偿意向；
- 后台选中行后的详情面板；
- Dispatch 的候选师傅、reason 和 attempt history；
- Support 工作台中的对话记录和 SLA 面板。

如果 Region 开始承载独立导航、多个步骤或跨角色责任，应升级为 `STATE_FRAME` 或独立 `FRAME`。

## 6. Dialog、Drawer 与 Bottom Sheet 的边界

### 6.1 Dialog

使用场景：

- 高风险或不可直接撤销动作的二次确认；
- 409 版本冲突后的“刷新事实 / 放弃本地输入”决策；
- 批准、拒绝、关闭、标记付款、发布等需要明确责任的动作；
- 内容短、选择有限、完成后返回原页面。

不得使用 Dialog 承载：

- 长时间阅读；
- 多步骤流程；
- 大型表单；
- 需要独立 URL 的对象详情；
- 用户必须在多个区域之间比较的信息。

### 6.2 Drawer

后台优先使用 Drawer 查看选中对象的扩展详情、证据或只读上下文。适合“列表不离场、详情可切换”的任务。

当对象需要独立深链、刷新恢复、多人协作定位或复杂编辑时，Drawer 必须升级为 Detail Frame。

### 6.3 Bottom Sheet

顾客端和师傅端优先使用 Bottom Sheet 完成：

- 优惠券、地址、时间等单次选择；
- 短说明、短备注或一次确认；
- 当前对象的有限动作菜单。

当 Sheet 出现多步骤、长证据、键盘长期占用或复杂恢复时，应升级为完整页面。

### 6.4 Overlay 的通用约束

- 关闭后必须回到原 Carrier 和原业务对象；
- 必须有明确标题、关闭方式和主次动作；
- 高风险动作必须显示对象、结果、原因和责任边界；
- 提交中禁止重复操作，但不能只靠 disabled 表达；
- 失败后保留安全输入，并提供恢复路径；
- 生产实现必须具备 `role="dialog"`、`aria-modal`、焦点进入/归还、Escape/关闭策略和背景交互隔离。

## 7. 状态组件的边界

### 7.1 状态组件可以承担

- 局部 loading、empty、error；
- 局部权限或动作不可用原因；
- 数据新鲜度、来源、范围和时间；
- 幂等重复结果；
- 部分成功的逐项结果；
- 下一责任角色和预计恢复方式；
- 当前页面不变时的短时网络状态。

### 7.2 状态组件不能独自承担

- 支付、退款、提现、结算等最终业务结果；
- 整页身份或权限阻断；
- 顾客争议、投诉解决、认证拒绝等责任变化；
- 用户必须保存或向客服举证的结果；
- 需要主动作或跨端交接的场景；
- 业务状态机中的不可逆终态。

### 7.3 状态组件最小内容合同

每个非装饰状态组件至少回答：

| 字段 | 要求 |
| --- | --- |
| `kind` | loading / empty / error / offline / unauthorized / forbidden / conflict / validation / duplicate / partial / not-wired / handoff / result。 |
| `scope` | app / page / region / object / action。 |
| `title` | 用户能直接理解的当前状态。 |
| `description` | 发生原因或仍未知的事实；不得推断。 |
| `source` | API、状态机、权限、Provider Envelope 或本地网络。 |
| `reasonCode` | 后端返回时必须保留；未知时明确未知。 |
| `primaryAction` | 当前最安全的恢复或继续动作。 |
| `secondaryAction` | 可选返回、联系客服、查看详情。 |
| `reference` | 需要留证时显示业务 ID、时间或 Trace ID。 |
| `accessibility` | live region、busy、alert、焦点和读屏顺序。 |

这些字段是设计检查项，不新增共享 TypeScript 契约。

## 8. 全局状态的升级规则

| 状态 | 默认表达 | 升级为完整画面的条件 | 禁止做法 |
| --- | --- | --- | --- |
| `loading` | Skeleton 或区域 `LoadingState` | 首次加载阻断整页、长任务需要阶段说明 | 无限 Spinner、隐藏已有安全数据 |
| `empty` | 区域 `EmptyState` | Empty 代表资格阻断、作用域错误或必须先完成前置任务 | 把 API 错误当空数据 |
| `offline/timeout` | Banner + Retry | 无缓存且整页不可完成、提交结果未知 | 宣称提交失败或成功 |
| `401` | `GATE` | 始终升级为身份恢复画面 | 在原页只弹 Toast |
| `403` | `DisabledReasonText` 或 Region | 整页无权限、账号 suspended/disabled | 隐藏原因、仅灰掉按钮 |
| `409` | Conflict Region / Dialog | 服务端事实使整页任务或本地编辑失效 | 自动覆盖服务端事实 |
| `422` | Field Error / Form Region | 多字段或对象级规则使整个任务不可提交 | 只显示通用“失败” |
| 重复提交 | Inline Info / Existing Result | 返回的既有结果需要完整留证 | 当作错误或重复创建成功 |
| 部分成功 | Result Region | 多对象结果、资金或责任存在分叉 | 只弹“成功”Toast |
| `not-wired` | `NotWiredState` | 能力是当前页面主目标且完全不可用 | 伪造按钮、假数据或成功页 |
| handoff | Handoff Region | 责任已跨端转移且本端进入等待主状态 | 只写“已提交”不说明谁接手 |

## 9. Toast、Tag 与禁用按钮

### 9.1 Toast

Toast 只能作为补充反馈：

- 非关键保存成功；
- 页面已有持久结果区域时的即时提醒；
- 不需要用户回看或举证的信息。

支付成功、退款批准、提现标记、投诉解决、认证结果、部分成功、未知提交结果不得只使用 Toast。

### 9.2 StatusTag / StateBadge

Tag 只回答“状态叫什么”。当用户还需要知道原因、可执行动作、影响或下一责任人时，必须搭配 Region、State Block 或完整画面。

颜色不是唯一信号；必须有文字，并满足对比度和高对比模式。

### 9.3 Disabled Button

禁用动作必须同时提供：

- 可见原因；
- 来自后端或当前输入的事实依据；
- 可恢复时的恢复路径；
- 不可恢复时的替代动作。

优先复用 `DisabledReasonText` 与 `ActionDock`。不得只依赖 `title`、Tooltip 或按钮灰度。

## 10. 三端布局边界

### 10.1 顾客端

- Route Frame 保留顶栏、内容层和安全区导航；
- 一个移动画面只保留一个主要决策中心；
- 复杂详情使用纵向单列，不用桌面式多栏；
- 选择和短编辑使用 Bottom Sheet；
- 终态、争议和恢复使用 State Frame；
- Action Dock 在存在关键动作时固定且不遮挡内容。

### 10.2 师傅端

- Hall、Task Detail、Repair、Wallet 是不同工作情境，不互相嵌套；
- 抢单 Offer 使用 Bottom Sheet，但 accepted 后进入 Task Detail；
- 履约主动作与证据状态始终在同一视野或相邻区域；
- suspended、disabled、certification result 使用 Full-state；
- 位置、资格、任务状态不得只用颜色区分。

### 10.3 后台

- 列表、详情和审计证据采用主从结构；
- 当前队列和筛选上下文应保留，详情优先 Region/Drawer；
- 需要独立定位、刷新恢复或复杂编辑时使用 Detail Frame；
- 高风险 mutation 使用 Dialog，并显示 scope、对象、expectedVersion、审计和非执行边界；
- 多状态表格以行状态 + 选中详情表达，不为每个枚举建立新 Route；
- 整页无权限、无城市范围和关键冲突使用 State Frame。

## 11. 现有 `@xlb/ui` 复用边界

| 现有组件 | 正确职责 | 不得承担 | 进入正式实现前要求 |
| --- | --- | --- | --- |
| `LoadingState` / `Skeleton` | 局部或整页加载占位 | 未知时长的业务进度承诺 | 增加正确 busy/live 语义并避免布局跳动 |
| `EmptyState` | 成功请求后的空集合或无记录 | API 失败、无权限、资格阻断 | 文案说明范围并提供合理下一步 |
| `ErrorState` / `ApiErrorPanel` | 错误事实与恢复 | 业务终态、无数据 | 保留后端 detail/reason/trace，避免暴露敏感信息 |
| `NotWiredState` | 真实能力尚未接线 | 假成功、普通空状态 | 明确 capability 和替代路径 |
| `StatusTag` / `StateBadge` | 状态标签 | 原因、结果证据、动作 | 文本 + 非颜色信号 |
| `DisabledReasonText` | 禁用原因 | 完整权限页 | 与动作同区显示 |
| `ActionDock` | 展示契约允许动作 | 自行推断 enabled | 继续绑定 `WorkflowActionContract` |
| `WorkflowTimeline` | 业务进度和交接 | 虚构未来时间或完成状态 | 每项来自后端事实 |
| `GuardrailCard` | 风险、范围、非执行边界 | 普通装饰卡片 | 高风险后台页面常驻可见 |
| `BottomSheet` | 移动端短选择/短操作 | 长表单、独立流程 | 已有 dialog 语义；补齐焦点与返回策略 |
| `Modal` | 后台短确认 | 长详情、复杂流程 | 当前实现缺少完整 dialog 语义、关闭与焦点管理，生产前必须补齐 |
| `Drawer` | 后台上下文详情 | 需要独立深链的复杂对象 | 当前实现缺少完整 dialog/region 语义、关闭与焦点管理，生产前必须补齐 |
| `Toast` | 补充即时反馈 | 唯一业务结果 | 持久结果必须同时存在于页面 |
| `AppErrorBoundary` | 未捕获前端异常兜底 | API 业务错误 | 提供安全刷新/返回，不伪装成业务失败 |

### 11.1 状态组件库缺口

当前 `@xlb/ui` 尚没有以下独立、统一的状态组件：

- `PermissionState`；
- `ConflictState`；
- `OfflineState`；
- `DuplicateState`；
- `PartialResultState`；
- `HandoffState`；
- `PersistentResultState`。

这些名称代表阶段三确认的组件职责，不代表已经存在代码。后续组件库施工应在 `@xlb/ui` 中统一实现，页面不得各自复制一套；实现时继续消费现有后端/`WorkflowUiBinding` 事实，不新增业务状态枚举。

## 12. Figma 建模规则

### 12.1 Frame 命名

```text
<Carrier ID> / <Route Name> / Base
<Carrier ID> / <Route Name> / <Slice ID>
```

示例：

```text
C-04 / Orders / Base
C-04 / Orders / C.PAYMENT.RESULT.CLOSED
W-10 / Certification / W.CERTIFICATION.STATUS.REJECTED
A-07 / Aftersale / A.REFUND.REVIEW.REQUESTED
```

### 12.2 Overlay 命名

```text
<Carrier ID> / O / <Action Name> / <State>
```

### 12.3 State Component 命名

```text
StateBlock / Kind=<kind> / Scope=<scope> / Tone=<tone>
ActionState / Enabled=<true|false> / Reason=<reason-code>
HandoffState / Actor=<customer|worker|admin|system>
```

### 12.4 Figma 禁止项

- 不把同一业务状态复制为多个无 Slice ID 的孤立 Frame；
- 不用图层名替代 Slice ID；
- 不把 loading/error/empty 复制成无法维护的静态卡片；
- 不根据视觉稿推断按钮 enabled、金额、成功或权限；
- 不让装饰主题覆盖状态色、焦点、错误和风险语义。

## 13. 边界决策记录

当设计师与工程师对表达层级存在分歧时，Slice Contract 的 `designBinding` 必须记录：

| 字段 | 内容 |
| --- | --- |
| `carrierId` | 36 个正式 Carrier 之一。 |
| `representation` | GATE / FRAME / STATE_FRAME / REGION / OVERLAY / STATE_COMPONENT / MICRO_VARIANT。 |
| `boundaryReason` | 目标、动作、风险、交接、证据或上下文依据。 |
| `parentFrame` | 非完整画面时所属 Frame。 |
| `escalationRule` | 何种事实出现时升级为完整画面。 |
| `evidenceRequired` | 是否需要独立截图、交互或无障碍证据。 |

## 14. Boundary Definition of Done

- [x] 每个正式 Carrier 有一个 Base Frame 定义；
- [x] 每个切片有且只有一个主要表达层级；
- [x] 每个 State Frame 说明为什么不能降级为组件；
- [x] 每个 Overlay 有关闭、返回、失败和重复提交策略；
- [x] 每个状态组件标明 scope、原因、动作和可访问性；
- [x] Toast、Tag、颜色和 disabled 不独自承担业务结果；
- [x] 401、403、409、422、离线、重复和部分成功均按升级规则处理；
- [x] 顾客端、师傅端和后台使用各自正确的 Shell 与密度；
- [x] Figma Frame、组件和代码都能追溯到 Carrier ID / Slice ID；
- [x] 未引入新的业务契约、正式服务类目或虚构成功状态。
