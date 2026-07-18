# XLB 三端交互状态清单

## 1. 产物定位

本清单定义 214 条业务切片进入真实 App 操作后必须覆盖的交互状态。它不增加业务切片，而是为 [FRAME_MAP_SLICE_BINDINGS.md](./FRAME_MAP_SLICE_BINDINGS.md) 中的每个 Slice ID 补齐：进入、读取、输入、确认、提交、恢复、返回、跨端交接和无障碍行为。

适用范围：

- 顾客端移动 App；
- 师傅端移动工作台；
- 后台桌面工作台；
- 页面、State Frame、Region、Dialog、Drawer、Bottom Sheet 和共享状态组件。

## 2. 单次操作的标准生命周期

每个可执行动作必须从以下状态中声明适用项：

| 阶段 | 交互状态 | 必须可见的事实 | 用户可执行动作 |
| --- | --- | --- | --- |
| 进入 | `restoring` | 正在恢复目标 Route、对象 ID、筛选或未提交安全输入。 | 取消恢复或返回安全入口。 |
| 读取 | `loading` | 结构占位，不制造业务数据。 | 可取消的长请求允许返回。 |
| 就绪 | `ready` | 权威状态、更新时间、允许动作和禁用原因。 | 执行后端允许的动作。 |
| 输入 | `editing-pristine` | 尚未修改。 | 输入、选择、关闭。 |
| 输入 | `editing-dirty` | 有未保存内容。 | 保存、放弃；离开时按风险确认。 |
| 校验 | `validating` | 正在进行本地或服务端校验。 | 不重复提交。 |
| 校验 | `invalid` | 字段与对象级原因、定位和修复路径。 | 修改后重试。 |
| 确认 | `confirming` | 对象、影响、不可逆性、金额/范围和下一责任人。 | 确认或取消。 |
| 提交 | `submitting` | 正在提交；幂等键保持稳定。 | 禁止重复；允许安全取消时才显示取消。 |
| 已受理 | `accepted-pending-result` | 服务端已受理但最终状态尚未确定。 | 查看进度、刷新或返回持久结果区。 |
| 成功 | `committed` | 权威结果、业务 ID、时间和下一步。 | 进入后续切片。 |
| 交接 | `handed-off` | 当前由谁处理、接收端事实和预期刷新方式。 | 查看进度、通知或求助。 |
| 失败 | `failed-recoverable` | 原因、保留的安全输入和重试条件。 | 重试、修改或返回。 |
| 失败 | `failed-terminal` | 不可继续的权威结果和替代路径。 | 查看详情、联系客服或返回。 |
| 未知 | `result-unknown` | 请求可能已到达服务端，不能声称成功或失败。 | 查询既有结果、刷新权威对象。 |
| 冲突 | `conflicted` | 服务端版本、变化摘要和本地输入影响。 | 刷新事实或放弃本地输入。 |
| 重复 | `duplicate-resolved` | 已存在的业务结果。 | 打开既有结果，不再次创建。 |
| 部分完成 | `partial` | 每个对象/步骤的 outcome。 | 只重试失败子集或进入人工处理。 |

## 3. 全局状态组件清单

| Kind | Page | Region | Action / Overlay | 焦点与播报 | 升级条件 |
| --- | --- | --- | --- | --- | --- |
| `loading` | 首屏 Skeleton，标题保持稳定。 | 局部骨架，不遮蔽其他安全事实。 | 按钮显示提交文案。 | `aria-busy=true`；完成后播报新标题。 | 长任务、阶段进度或结果未知。 |
| `empty` | 说明查询范围与合法下一步。 | 对应列表/Panel 空。 | 不适用。 | 焦点落到空状态标题或下一步。 | 资格、城市、权限或前置任务阻断。 |
| `offline` | 无缓存时说明页面不可完成。 | 顶部 Banner + 缓存事实 + 更新时间。 | 未提交输入保留。 | 网络变化使用礼貌播报。 | Mutation 结果未知。 |
| `timeout-before-submit` | 读取失败，可安全重试。 | 局部失败。 | 保留输入。 | 焦点进入恢复动作。 | 主任务首次读取不可用。 |
| `result-unknown` | 持久结果画面。 | Action Result Region。 | Overlay 关闭但不回报失败。 | 使用 `role=status`，查询完成后更新。 | 支付、退款、提现、审核、派单等高风险动作。 |
| `unauthorized` | 进入身份 Gate，保存原目标。 | 不使用局部 401。 | Overlay 关闭并进入 Gate。 | 焦点进入认证标题。 | 始终升级 Gate。 |
| `forbidden` | 整页 PermissionState。 | 局部内容遮蔽并说明范围。 | 禁用原因与替代动作。 | `role=alert` 用于主动操作后的拒绝。 | 账号、角色、城市阻断主任务。 |
| `conflict` | 主对象或整页事实失效。 | Conflict Region。 | Conflict Dialog。 | 焦点进入变化摘要。 | 需要丢弃本地输入或重新加载主对象。 |
| `validation` | 对象级摘要定位各字段。 | Form Summary。 | Field Error。 | 首个错误获焦；错误与字段关联。 | 多区域共同修复。 |
| `duplicate` | 打开既有关键结果。 | Existing Result Block。 | 阻止再次提交。 | 播报“已存在”而非“失败”。 | 关键金额/责任结果需要留证。 |
| `partial` | 批量结果总览。 | 每项 outcome。 | 只重试失败子集。 | 先播报总计，再逐项可读。 | 资金、责任或交接分叉。 |
| `handoff` | 本端主任务变为等待。 | 显示接收角色和刷新方式。 | 不作为 Toast。 | 标题先说明“等待谁”。 | 下一责任角色改变主任务。 |
| `result` | 关键成功、失败、关闭或终态。 | 非关键保存结果。 | Toast 只补充。 | 焦点进入结果标题。 | 需要回看、举证、客服引用。 |
| `stale` | 事实过旧导致整页动作不可用。 | 显示最后更新时间。 | 禁用并给刷新入口。 | 更新时间可被读屏读取。 | stale 阻断接单、审批或资金判断。 |
| `not-wired` | 主能力真实不可用。 | 局部能力说明。 | 禁用并给替代路径。 | 不使用工程术语。 | 当前页面主目标完全不可用。 |
| `unexpected` | App Error Boundary。 | ApiErrorPanel。 | 安全重试。 | `role=alert`；不泄露堆栈。 | 前端异常破坏主画面。 |

## 4. Overlay 状态机

每个 Dialog、Drawer 和 Bottom Sheet 必须实现：

```text
closed
  -> opening
  -> open/pristine
  -> open/dirty
  -> validating
  -> submitting
  -> committed -> closing -> parent persistent result
  -> failed/recoverable -> open/dirty
  -> result-unknown -> parent unknown-result region
  -> conflicted -> refresh or discard decision
```

通用约束：

- 打开时记录触发控件和父 Carrier；
- 关闭后返回原对象、滚动位置和触发控件；
- `dirty` 时，只有会丢失重要输入才需要离开确认；
- 移动端键盘出现时，标题、首个错误和 Primary CTA 仍可到达；
- 后台 Dialog 的 Enter 不默认触发 destructive、高金额或审核动作；
- `submitting` 防止重复操作，但同时显示正在执行什么；
- 成功后先把权威结果写入父 Region/State Frame，再关闭 Overlay；
- 超时后不得显示失败 Toast，必须进入 `result-unknown` 查询路径；
- Dialog/Drawer 具备语义、焦点陷阱、Escape 策略和背景隔离；
- Bottom Sheet 支持读屏关闭、拖拽替代动作和返回手势冲突处理。

## 5. 输入与选择状态

| 控件 | 必须覆盖的微状态 | 关键规则 |
| --- | --- | --- |
| Text Field / Textarea | default、focus、filled、dirty、invalid、disabled、read-only、saving | 错误与字段关联；敏感输入不进入日志。 |
| OTP | empty、focused、partial、complete、invalid、expired、resending | 支持粘贴和系统自动填充；倒计时不是唯一提示。 |
| Amount | empty、formatted、invalid、limit-exceeded、read-only | CNY 分为事实源；显示格式不改变精度。 |
| Date / Time | unopened、selected、unavailable、stale | 可选范围来自后端；过期后重新校验。 |
| Address | none、selected、editing、out-of-scope、invalid | 城市/服务范围失败必须可解释。 |
| Coupon | available、selected、reserved、ineligible、expired、revoked | 选择后重新报价，不沿用旧金额。 |
| Upload | idle、selecting、uploading、stored、failed、removed | 只有服务端/对象存储确认后才是 stored。 |
| Search | idle、typing、debouncing、loading、result、no-result、error | no-result 与 error 分离。 |
| Filter / Tab | default、selected、loading-count、empty-result | 切换后保留合法筛选并更新 URL/本地状态。 |
| Table Row | default、hover、focus、selected、stale、conflicted、restricted | 选择态不能只靠底色。 |
| Primary Action | enabled、pressed、submitting、disabled-with-reason、committed | enabled 来自动作合同，不由视觉推断。 |
| Destructive Action | enabled、confirming、submitting、committed、failed | 必须显示对象、影响和可否撤回。 |

## 6. 三端 Carrier 交互清单

### 6.1 顾客端

| Carrier | 主要操作 | Overlay | 提交后的持久落点 | 特殊交互状态 |
| --- | --- | --- | --- | --- |
| `C-00` | 登录、验证码、恢复原目标 | Login/OTP | 原 Slice 或 Gate 阻断结果 | OTP 过期、重发、401 循环保护、深链恢复。 |
| `C-01` | 城市切换、进入服务 | City Sheet | Catalog Region | 首屏空、城市变化、刷新、离线缓存。 |
| `C-02` | 搜索、分类、筛选、选 SKU | City/Filter Sheet | Browse Result Region | debounce、no-result、筛选清空、过期 SKU。 |
| `C-03` | 地址、时间、数量、券、请求报价、创建订单 | Address/Time/Coupon/Create Sheet | Quote State Frame 或 Pending Dispatch State Frame | dirty、422、报价失效、重复下单、提交结果未知。 |
| `C-04` | 确认/争议、支付、评价、申诉、退款 | 业务动作 Sheet/Dialog | Order State Frame / Persistent Result Region | 409、支付轮询、重复支付、退款已批准非到账。 |
| `C-05` | 逆向申请、投诉、补充证据 | Request/Supplement Sheet | Case Timeline / State Frame | waiting-customer、证据上传、部分成功、交接后台。 |
| `C-06` | 新建/重开工单、发消息、CSAT | Create/Reopen/CSAT/Chat Sheet | Ticket/Conversation Region | 消息发送中/失败、队列、转接、会话关闭。 |
| `C-07` | 打开、标已读、归档、跳业务对象 | Archive Confirm | Inbox Row + 引用对象 | 深链失效、批量部分成功、未读计数同步。 |
| `C-08` | 查看券、带券进入下单 | Coupon Detail Sheet | Wallet Row 或 `C-03` | reserved/expired/revoked、来源说明、报价重算。 |
| `C-09` | 编辑资料、增改删地址 | Edit Sheet/Delete Dialog | Profile/Address Region | dirty 离开、地址范围校验、409、保存后焦点回归。 |

### 6.2 师傅端

| Carrier | 主要操作 | Overlay | 提交后的持久落点 | 特殊交互状态 |
| --- | --- | --- | --- | --- |
| `W-00` | 登录、恢复身份 | Login/OTP | Hall 或 Access Gate | suspended/disabled、OTP、401 循环保护。 |
| `W-01` | 上线/暂停、查看 Offer、接受/拒绝 | Offer Sheet | Hall Result Region 或 `W-03` | 倒计时、Offer 过期、被抢、位置/资格阻断、409。 |
| `W-02` | 筛选任务、进入详情 | Filter Sheet | `W-03` | empty、刷新、聚合状态变更。 |
| `W-03` | 开始、上传证据、完成服务 | Start/Upload/Complete | Fulfillment State Frame | 弱网保留、证据 stored、重复完成、顾客争议。 |
| `W-04` | 开始/完成返工 | Start/Complete Repair | Repair State Frame | 责任来源、任务取消、证据失败、后台交接。 |
| `W-05` | 增加账户、申请提现、查看结果 | Account/Withdraw/Sensitive Confirm | Wallet Persistent Result | 金额校验、重复申请、marked-paid 非银行回执。 |
| `W-06` | 建工单、发消息、重开、CSAT | Support Sheets | Ticket/Conversation Region | 来源对象保留、发送失败、关闭恢复。 |
| `W-07` | 打开、已读、归档、跳对象 | Archive Confirm | Inbox Row + 引用对象 | 深链失效、未读计数。 |
| `W-08` | 查看评分、发起/撤回申诉 | Appeal Sheet/Dialog | Appeal Region | eligible 变化、内容权限、409、结果通知。 |
| `W-09` | 保存位置、启停共享 | Save/Disable Sheet | Location State Frame/Region | 系统定位权限、stale、后台切换、隐私说明。 |
| `W-10` | 填写、上传、提交认证 | Submit Dialog/Sheet | Pending/Result State Frame | dirty、证据上传、422、重复提交、后端决定重提。 |

### 6.3 后台

| Carrier | 主要操作 | Overlay / Detail | 提交后的持久落点 | 特殊交互状态 |
| --- | --- | --- | --- | --- |
| `A-00` | 登录、选择城市 | Login/City | 原工作台或 Gate | Session 失效、城市切换、整页权限。 |
| `A-01` | 确认/取消批次、标应付、入队、生成单据 | Confirm Dialog | Table/Gap/Result Region | expectedVersion、部分成功、gap 阻断、非付款边界。 |
| `A-02` | 审核结算单 | Approve/Reject Dialog | Statement State Frame | 金额证据、职责分离、409、审计。 |
| `A-03` | 查看导出证据 | Metadata Drawer | Export Region | hash 校验失败、无伪下载成功。 |
| `A-04` | 提交/取消/归档治理意图 | Confirm Dialog | Governance Region/State Frame | execution disabled 常驻、风险和证据缺失。 |
| `A-05` | 搜索订单、查看证据、跳责任台 | Evidence Drawer | Trace State Frame | no-result、敏感权限、查询参数恢复。 |
| `A-06` | 批准、拒绝、标记付款 | Review Dialog | Selected Detail Region | marked-paid 非 Provider、409、重复结果、审计。 |
| `A-07` | 审退款/逆向、分派返工、定责、补偿意向 | Review/Assign/Decision Dialog | Case Detail/State Frame | 多角色交接、证据、409、partial、非到账边界。 |
| `A-08` | 客户、凭证、价格、Webhook、账单操作 | Dialog + Context Drawer | Client Detail/Secret Result | Secret 仅一次、权限、retry/dead-letter、issued 非收款。 |
| `A-09` | 筛选派单、重试匹配、人工处理 | Manual Action Dialog | Selected Diagnostic Region | 候选隐私、倒计时、no-match、版本冲突。 |
| `A-10` | 查看订单/SKU、审核认证 | Review Dialog | Certification State Frame | 内容权限、职责分离、师傅端交接。 |
| `A-11` | Claim/Assign/Resolve/Transfer/Close、配置、知识编辑 | Dialog + Edit Drawer | Ticket/Conversation/Config Region | SLA、实时消息、锁定/冲突、转接历史。 |
| `A-12` | 建 Rubric、提交抽检 | Dialog | Quality Detail Region | 指标空、评分校验、提交冲突。 |
| `A-13` | 审核评价、裁决申诉 | Review Dialog + Sensitive Drawer | Moderation/Appeal Region | 敏感内容、权限、409、审计。 |
| `A-14` | 复核/发布/暂停/撤销/发券/处理补偿 | Confirm Dialog | Campaign/Rule/Coupon/Compensation Region/State Frame | 职责分离、金额分、部分成功、版本冲突。 |

## 7. 导航、生命周期与设备状态

### 7.1 深链与返回

- 深链必须携带真实业务对象 ID，进入后重新读取权威状态；
- 无权限时进入 PermissionState，不泄露对象是否存在；
- 对象已终态或不存在时显示持久结果/安全 not-found，不跳到无关首页；
- 认证恢复后返回原目标；城市不匹配时先恢复 Scope 再决定是否返回；
- Overlay 关闭回父 Carrier；State Frame 返回所属列表/工作台并保留筛选；
- 浏览器刷新、App 冷启动和通知点击使用相同恢复规则。

### 7.2 前后台切换

- 回到前台后重新检查 session、对象版本、Offer/OTP 倒计时和位置 freshness；
- 有 `dirty` 输入时不自动覆盖；先显示冲突摘要；
- 高风险动作 `submitting` 时切后台，回前台先查询结果；
- 实时会话断线后显示重连状态和最后成功消息，不复制发送；
- 支付、派单、审批、提现等状态不得仅依赖本地倒计时或本地缓存宣布结果。

### 7.3 系统权限

| 权限 | 首次请求 | 拒绝 | 永久拒绝 / 受限 | 恢复 |
| --- | --- | --- | --- | --- |
| 定位 | 在师傅明确启用接单/共享时说明用途后请求。 | 显示对接单的真实影响。 | 提供系统设置路径和不泄露精确位置的说明。 | 返回前台后重新检查并刷新 freshness。 |
| 相机/相册/文件 | 用户选择上传证据时请求。 | 保留表单和替代文件路径。 | 给系统设置入口；不伪造上传。 | 恢复后回原上传步骤。 |
| 通知 | 在价值明确的上下文请求。 | App 内收件箱仍可用。 | 提供设置入口，不阻断主业务。 | 更新通知偏好和未读同步。 |

### 7.4 屏幕、键盘与可访问性

- 移动端支持安全区、横向文字溢出、系统字体放大和键盘避让；
- 后台支持 1280px 及以上主布局，较窄宽度保持主任务，不隐藏风险和禁用原因；
- 所有交互可用键盘完成，焦点顺序与视觉顺序一致；
- 状态不能只靠颜色、动画或图标表达；
- reduced-motion 下取消非必要位移动画，保留状态变化文本；
- 触控目标、对比度、错误关联、动态播报和焦点归还进入每个切片验收；
- 表格排序、筛选、选择、分页和 Drawer 打开状态都有可访问名称。

## 8. 交互验收最小证据

每个 Slice ID 至少提供：

1. 进入并读取权威事实；
2. ready 或对应业务 State Frame；
3. 主动作 enabled/disabled 与原因；
4. 适用时的 Overlay pristine、dirty、invalid、submitting；
5. committed 或持久结果；
6. 一个适用的失败/冲突/离线恢复场景；
7. 跨端切片的发送端与接收端相同业务 ID；
8. 键盘/焦点/播报或移动端触控证据；
9. 通知、深链或刷新进入时的恢复证据；
10. 不适用项必须写明业务原因，不得留空。

## 9. 本阶段完成标准

- [x] 214 条切片全部继承标准操作生命周期；
- [x] 36 个 Carrier 均登记主要操作、Overlay、持久结果和特殊状态；
- [x] loading、empty、offline、401、403、409、422、duplicate、partial、handoff、stale、not-wired 和 unknown-result 均有统一行为；
- [x] 表单、选择、上传、搜索、表格和高风险动作的微状态已定义；
- [x] Dialog、Drawer、Bottom Sheet 的打开、输入、提交、失败、关闭和焦点回归已定义；
- [x] 深链、冷启动、刷新、前后台切换和通知点击已有恢复规则；
- [x] 定位、相机/文件和通知权限场景已纳入；
- [x] 三端键盘、读屏、文字缩放、安全区和桌面响应式边界已纳入；
- [x] 未把临时交互态错误登记为新业务切片。
