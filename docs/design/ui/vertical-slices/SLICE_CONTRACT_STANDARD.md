# XLB 三端纵向切片标准

## 1. 目的

本标准用于顾客端、师傅端和后台的全部业务场景设计。它把“一个页面”收敛为可验证的业务切片，使每个画面都能追溯到真实后端状态、用户目标、可执行动作、角色交接和异常恢复路径。

本标准中的关键词：

- **必须**：缺失时不得进入高保真设计或实现。
- **应当**：默认执行；偏离时必须记录原因。
- **可以**：按场景需要使用。

## 2. 标准定义

> 纵向切片是：一个确定角色在一个确定业务状态下，为完成一个明确目标而获得的完整产品场景。它包含进入条件、权威业务事实、可执行动作、操作反馈、异常恢复，以及操作后下一责任角色看到的状态。

一个切片必须同时稳定以下五件事：

1. **Actor**：当前是谁在使用；
2. **Goal**：当前用户要完成什么；
3. **State**：后端认定当前发生了什么；
4. **Action**：当前允许、禁止或等待什么；
5. **Handoff**：完成后由谁继续处理。

缺少其中任何一项的内容只能是页面草图、组件示例或视觉探索，不能登记为正式业务切片。

## 3. 切片不是什么

切片不等同于：

- 一个浏览器 route；同一路由可以包含多个切片；
- 一个 API endpoint；一个切片可以读取多个接口；
- 一个 Figma Frame；一个切片可以包含主画面、Dialog 和 Bottom Sheet；
- 一个组件 Variant；按钮 Loading 通常不是独立切片；
- 一个后端状态字符串；相同状态在不同角色或目标下可能是不同切片；
- 一张“好看但没有后端来源”的静态效果图。

## 4. 何时必须拆出新切片

任一条件发生变化时，必须评估并默认建立新切片：

| 变化 | 示例 | 是否独立切片 |
| --- | --- | --- |
| 当前角色变化 | 顾客等待接单 / 师傅决定是否接单 | 必须 |
| 用户目标变化 | 查看订单 / 确认服务完成 | 必须 |
| 主操作变化 | “开始服务”变为“提交完工” | 必须 |
| 后端业务状态变化 | `accepted` 变为 `in_progress` | 通常必须 |
| 责任角色变化 | 师傅完工后转由顾客确认 | 必须 |
| 恢复路径变化 | 普通失败可重试 / 任务已被他人接走只能返回 | 必须 |
| 权限或城市范围变化 | 可操作 / 无权限 / 城市不匹配 | 必须 |
| 仅视觉反馈变化 | 按钮 Default / Pressed | 组件 Variant |
| 短暂请求状态变化 | 页面数据刷新 Loading | 默认组件状态 |
| 页面结构与行为均未变化 | 同一状态下文案轻微调整 | 不拆分 |

### 4.1 完整画面与组件状态

以下情况必须设计完整画面：

- 页面主叙事、主操作或责任角色改变；
- 用户需要作出业务决策；
- 权限、状态冲突或失败改变后续路径；
- 页面需要新的信息层级才能完成任务；
- 该状态是跨端交接的发送端或接收端。

以下情况默认进入组件 Variant，不重复制作完整画面：

- Button 的 Default、Pressed、Loading；
- 输入框 Focus、Invalid；
- 通用 Skeleton、Toast、Badge；
- 不改变恢复路径的短暂网络请求状态。

所有业务场景必须登记；纯视觉微状态可以通过组件覆盖，不要求复制整页。

## 5. 切片层级

| 层级 | 定义 | 设计产物 |
| --- | --- | --- |
| `business-scene` | 用户目标、业务状态和主操作完整成立 | 独立 Frame |
| `decision-scene` | 确认、审核、选择、争议等业务决策 | Frame、Dialog 或 Bottom Sheet |
| `handoff-scene` | 一个角色完成后，另一角色接管 | 发送端和接收端各有画面 |
| `recovery-scene` | 冲突、失败、超时、权限问题改变恢复路径 | 独立 Frame 或强业务 Modal |
| `ui-variant` | 不改变业务意义的视觉状态 | Component Variant |

每条正式切片必须声明 `sliceLevel`。`ui-variant` 不得冒充业务流程完成证据。

## 6. Slice ID 与命名

### 6.1 Slice ID

格式：

```text
<ACTOR>.<DOMAIN>.<SCENARIO>.<STATE>[.<VARIANT>]
```

Actor 代码：

| 代码 | 角色 |
| --- | --- |
| `C` | 顾客 customer |
| `W` | 师傅 worker |
| `A` | 后台 admin / operator / auditor |
| `X` | 跨端 handoff 或全局系统状态 |

规则：

- 全部使用大写 ASCII 与点分段；
- `DOMAIN` 使用项目正式领域名，如 `ORDER`、`FULFILLMENT`、`SUPPORT`；
- `STATE` 优先使用后端精确状态的可读大写形式；
- Slice ID 一经进入实现和证据命名，不因视觉改版而变化；
- 不使用旧项目名称、Figma 层名或中文拼音作为 ID。

示例：

```text
C.ORDER.CREATE.QUOTE_READY
C.ORDER.DETAIL.PENDING_DISPATCH
W.FULFILLMENT.TASK_DETAIL.IN_PROGRESS
W.TASK_ACCEPT.RESULT.ALREADY_TAKEN
A.SUPPORT.TICKET.WAITING_REQUESTER
X.FULFILLMENT.COMPLETE.CUSTOMER_CONFIRMATION_HANDOFF
```

### 6.2 Figma Frame 名

格式：

```text
Actor / Domain / Scenario / State
```

示例：

```text
Customer / Order / Create / QuoteReady
Worker / Fulfillment / TaskDetail / InProgress
Admin / Support / TicketDetail / WaitingRequester
```

Frame description 必须包含 Slice ID。Figma 名称可以优化可读性，但不得替代稳定 ID。

## 7. Slice Contract 必填字段

### 7.1 身份与范围

| 字段 | 要求 |
| --- | --- |
| `sliceId` | 稳定唯一 ID。 |
| `title` | 面向团队的中文场景名。 |
| `sliceLevel` | 五种切片层级之一。 |
| `actor` | `customer`、`worker`、`admin` 或 `cross-role`。 |
| `role` | 精确身份，如 customer、worker、operator、auditor。 |
| `domain` | 后端正式业务领域。 |
| `route` | route 或 route pattern。 |
| `surface` | page、dialog、bottom-sheet、drawer 或 component。 |
| `priority` | P0 核心主链、P1 关键异常、P2 补充场景。 |

### 7.2 用户目标与进入条件

| 字段 | 要求 |
| --- | --- |
| `userGoal` | 用用户语言描述此刻要完成的唯一主要目标。 |
| `entryTrigger` | 从哪里、因什么事件进入。 |
| `preconditions` | 身份、城市、前序状态、必要数据。 |
| `entrySliceIds` | 可以进入本切片的前序 Slice ID。 |

### 7.3 后端事实

| 字段 | 要求 |
| --- | --- |
| `workflowName` | 对应 `WorkflowUiBinding.workflowName`。 |
| `backendState` | 精确后端状态；无状态时说明读模型来源。 |
| `stateSource` | backend、api-contract、frontend-derived-from-api 或 not-wired-policy。 |
| `contractDocs` | 相关正式契约文档。 |
| `endpoints` | 读取和操作接口，注明 HTTP method。 |
| `modules` | 对应 backend module / service / state machine。 |
| `identitySource` | 当前身份的权威来源。 |
| `cityScope` | 城市范围来源及是否必需。 |
| `permissionSource` | 权限、资格、角色判断来源。 |
| `authoritativeFacts` | 画面可以展示的价格、人员、时间、状态、金额等真实字段。 |
| `forbiddenClaims` | 后端不能证明、页面不得声称的内容。 |

禁止为了完成视觉稿而补造正式服务类目、价格、师傅、收入、经营指标或成功状态。

### 7.4 状态叙事

每个切片必须回答：

| 字段 | 用户应得到的答案 |
| --- | --- |
| `currentStep` | 我现在处于哪一步？ |
| `currentOwner` | 现在由谁处理？ |
| `nextAvailableStep` | 下一步是什么？ |
| `blockedReason` | 为什么暂时不能继续？ |
| `estimatedTime` | 大概多久；只能来自 SLA 或后端事实。 |
| `recoveryPath` | 出问题后如何恢复？ |
| `terminal` | 是否为该业务流程终态。 |

### 7.5 动作合同

所有业务按钮、工具栏动作、表格行操作和 Bottom CTA 必须登记：

| 字段 | 要求 |
| --- | --- |
| `actionId` | 稳定动作 ID。 |
| `label` | 用户可理解的文案。 |
| `kind` | primary、secondary、tertiary 或 destructive。 |
| `enabled` | 只能由后端/API/明确 not-wired policy 决定。 |
| `disabledReasonCode` | `enabled=false` 时必填。 |
| `endpoint` / `method` | 可执行动作必填。 |
| `confirmRequired` | 是否需要二次确认。 |
| `idempotencyRequired` | 是否要求幂等键。 |
| `auditRequired` | 是否必须进入审计。 |
| `cityScopeRequired` | 是否依赖城市范围。 |
| `successTransition` | 成功后的后端状态或接收切片。 |
| `failurePresentation` | 失败如何展示。 |
| `recoveryAction` | 用户可以采取的恢复动作。 |

不得因为 Figma 中按钮是高亮状态而推断 `enabled=true`。

### 7.6 跨端交接

每个非终态切片必须说明是否发生角色交接：

| 字段 | 要求 |
| --- | --- |
| `handoffType` | none、same-actor、cross-actor 或 system-worker。 |
| `nextActor` | 下一责任角色。 |
| `triggerEvent` | 引发交接的状态变化或平台事件。 |
| `receivingSliceId` | 接收端对应切片。 |
| `sharedBusinessId` | 两端用于关联的 orderId、fulfillmentId、ticketId 等。 |
| `factsTransferred` | 两端必须保持一致的状态、时间、金额和证据。 |
| `freshnessExpectation` | 即时、轮询、刷新或允许延迟。 |
| `notificationEffect` | 是否产生站内通知、未读数或客服消息。 |

跨端画面不得使用不同订单编号、金额、状态名称或时间线解释同一事实。

### 7.7 异常与恢复

每个业务切片至少评估以下情况：

- 首次加载失败；
- 空数据；
- 弱网、离线和请求超时；
- `401` 身份失效；
- `403` 权限或城市范围拒绝；
- `409` 状态冲突或任务被其他人处理；
- `422` 输入或业务校验失败；
- 重复提交和幂等命中；
- 后端成功但通知或刷新延迟；
- 能力尚未接线。

每项必须登记 `presentation`、`userCopy`、`allowedActions` 和 `recoverySliceId`。不适用时写明原因，不得留空。

### 7.8 设计绑定

| 字段 | 要求 |
| --- | --- |
| `figmaBinding` | exact、partial、derived 或 DESIGN_SOURCE_MISSING。 |
| `figmaPage` | 目标 Figma Page。 |
| `frameName` | 规范 Frame 名。 |
| `nodeId` | 已建立后填写。 |
| `referenceSources` | 参考 Figma、PNG、现有代码画面。 |
| `referenceOnly` | 哪些内容只参考、不继承。 |
| `viewport` | 顾客/师傅移动端、后台桌面端的目标尺寸。 |
| `uiSlots` | 对应 `WorkflowUiBinding.uiSlots`。 |
| `components` | 优先复用 `packages/ui` 的组件。 |
| `tokens` | 角色主题和语义 Token。 |
| `responsiveRules` | 安全区、折叠、滚动、桌面密度规则。 |
| `motionFeedback` | 必要的动效、触觉、声音及 reduced-motion 规则。 |

参考设计只能影响视觉表达，不得改变状态机、权限、金额、城市范围或动作可用性。

### 7.9 文案与无障碍

必须登记：

- 页面标题、状态标题、解释文案；
- Primary CTA、Secondary CTA、禁用原因；
- Loading、Empty、Error、Success 文案；
- 屏幕阅读器标题和动态状态播报；
- 焦点顺序、键盘操作和焦点回归；
- 触控目标、对比度和文字缩放；
- 不能只靠颜色表达的状态。

不使用 `Real API`、`not-wired`、状态枚举、traceId 等工程术语作为用户文案。

### 7.10 验收证据

| 字段 | 要求 |
| --- | --- |
| `fixture` | 使用什么合法测试数据进入该状态。 |
| `apiEvidence` | 哪个响应或测试证明业务事实。 |
| `figmaEvidence` | Frame/node 和组件 Variant。 |
| `screenshotEvidence` | 规定 viewport 的截图路径。 |
| `interactionEvidence` | 主操作、确认、失败和恢复的验证。 |
| `accessibilityEvidence` | 键盘、焦点、语义和对比度检查。 |
| `crossActorEvidence` | 发送端和接收端的同一业务 ID 证明。 |

## 8. 三端特有要求

### 8.1 顾客端

每个切片必须让顾客理解：当前进度、下一步、等待谁、预计时间、金额依据和求助入口。不得暴露内部状态机或运营术语。

### 8.2 师傅端

每个切片必须明确：是否可接单、资格与城市范围、当前任务动作、时间/地址、凭证要求、弱网策略和收入事实。高频现场操作应当单手可达，并避免误触完成。

### 8.3 后台

每个切片必须明确：当前城市与角色范围、队列来源、是否可操作、风险级别、审计要求、确认要求、原始失败原因和操作历史。后台默认采用桌面工作台，不以参考 Figma 的手机画板作为正式布局依据。

## 9. 全局状态包

以下状态建立共享组件规范，但每个业务切片仍需声明采用方式：

| 状态 | 标准行为 |
| --- | --- |
| Loading | 保留页面骨架，避免制造假业务数据。 |
| Empty | 说明为什么为空，并提供合法下一步。 |
| Error | 显示用户可理解原因和恢复动作。 |
| Offline | 保留未提交内容；高风险动作不得假成功。 |
| Stale | 明确最后更新时间和刷新入口。 |
| Permission denied | 说明范围问题，不泄露无权数据。 |
| Conflict | 刷新权威状态，解释记录已变化。 |
| Not wired | 产品化说明能力暂不可用，不展示假按钮。 |
| Partial success | 区分主业务成功与通知、刷新等次要失败。 |

## 10. 与 WorkflowUiBinding 的映射

Slice Contract 是产品场景总账；`WorkflowUiBinding` 是运行时页面绑定。两者必须保持以下对应：

| Slice Contract | WorkflowUiBinding |
| --- | --- |
| `actor`、`route`、`workflowName` | 同名字段 |
| `backendState`、`stateSource` | `state` |
| 动作合同 | `availableActions` |
| 禁用原因 | `disabledReasons` |
| 状态叙事 | customer/worker facing answer 与 copy |
| 设计绑定 | `figmaBinding`、`uiSlots`、`packagesUiComponents` |
| 主题与 Token | `runtimeThemeTokens` |
| 未接线能力 | `notWiredPolicy` |

不得在 Slice 文档与运行时 Binding 中维护两个互相冲突的状态或动作定义。后端契约变化时，两处必须在同一变更中同步。

## 11. Definition of Ready

进入高保真设计前，切片必须满足：

- [ ] Slice ID 唯一且命名合规；
- [ ] 用户目标和进入条件明确；
- [ ] 后端状态、接口、权限和城市范围有来源；
- [ ] 可展示事实与禁止声称内容已分开；
- [ ] 所有动作有 Action Contract；
- [ ] 前序、后序和跨端交接已映射；
- [ ] 关键异常及恢复路径已定义；
- [ ] Figma 参考状态和“只参考内容”已记录；
- [ ] 合法测试数据可进入该状态；
- [ ] 不需要凭空创造正式服务类目或业务规则。

任一项缺失时，只能继续产品分析或低保真探索。

## 12. Definition of Done

切片完成必须满足：

- [ ] 完整画面或指定组件 Variant 已完成；
- [ ] Frame 名称和 Slice ID 可追溯；
- [ ] 主操作、次操作、禁用原因和确认逻辑一致；
- [ ] Loading、Empty、Error、Conflict 等适用状态已覆盖；
- [ ] 发送端和接收端使用相同业务事实；
- [ ] 没有假价格、假人员、假状态、假指标或本地假成功；
- [ ] 复用现有 Token 和组件，新增组件有复用理由；
- [ ] 移动端安全区、后台桌面密度和响应式规则已验证；
- [ ] 交互、无障碍和截图证据齐全；
- [ ] 对应 WorkflowUiBinding 与实现没有事实漂移。

## 13. 标准示例

```yaml
sliceId: C.ORDER.DETAIL.PENDING_DISPATCH
title: 顾客查看待派单订单
sliceLevel: business-scene
actor: customer
role: customer
domain: order
route: /customer/orders?orderId=:orderId
surface: page
priority: P0

userGoal: 了解订单当前进度以及接下来需要做什么
entryTrigger: 下单成功后进入订单详情，或从订单列表打开
preconditions:
  - 已登录顾客身份
  - cityCode 与订单范围一致
  - orderId 属于当前顾客

workflowName: customer.order.detail
backendState: pending_dispatch
stateSource: backend
endpoints:
  - GET /api/orders/:orderId
authoritativeFacts:
  - orderId
  - order.status
  - price snapshot
  - service address and schedule
forbiddenClaims:
  - 尚未确认的师傅姓名或到达时间
  - 后端未返回的派单成功状态

currentStep: 订单正在等待派单
currentOwner: platform
nextAvailableStep: 等待师傅接单，或进入合法的取消/求助路径
terminal: false

handoffType: cross-actor
nextActor: worker
triggerEvent: 后端产生可接任务并由合格师傅接单
sharedBusinessId: orderId
receivingSliceId: W.TASK_POOL.ORDER.AVAILABLE
```

完整登记使用 `SLICE_CONTRACT_TEMPLATE.md`。
