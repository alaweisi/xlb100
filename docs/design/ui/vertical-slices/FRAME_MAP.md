# XLB 三端 Frame Map

## 1. 产物定位

本文件把阶段二的 214 条业务切片和阶段三的 36 个 Carrier，转换为可以进入 Figma、代码实现和截图验收的画面地图。

它回答：

1. 哪些节点是稳定页面；
2. 哪些业务状态必须成为完整状态画面；
3. 哪些内容留在页面区域、浮层、状态组件或微状态；
4. 一个 Slice ID 如何从业务总账追溯到唯一设计落点。

输入基线：

- [SLICE_LEDGER.md](./SLICE_LEDGER.md)
- [SLICE_SCOPE_BASELINE.md](./SLICE_SCOPE_BASELINE.md)
- [SCREEN_STATE_COMPONENT_BOUNDARY.md](./SCREEN_STATE_COMPONENT_BOUNDARY.md)
- [SCREEN_STATE_COMPONENT_MATRIX.md](./SCREEN_STATE_COMPONENT_MATRIX.md)

逐 Slice 绑定见 [FRAME_MAP_SLICE_BINDINGS.md](./FRAME_MAP_SLICE_BINDINGS.md)，动作与运行状态见 [INTERACTION_STATE_INVENTORY.md](./INTERACTION_STATE_INVENTORY.md)。

## 2. Frame Map 结论

| 项目 | 数量 | 说明 |
| --- | ---: | --- |
| 正式业务切片 | 214 | 顾客 62、师傅 54、后台 98。 |
| Carrier Base Frame | 36 | 每个稳定页面、工作台或 Gate 一个。 |
| Gate 业务状态 Frame | 7 | 顾客 1、师傅 4、后台 2。 |
| 完整业务 State Frame | 61 | 顾客 19、师傅 20、后台 22。 |
| 顶层页面/状态 Frame 合计 | 104 | `36 Base + 7 Gate State + 61 Business State`。 |
| Supporting Frame | 1 | `W-02` 我的任务列表；承载摘要但不新增 Slice ID。已包含在 36 个 Base 中。 |
| Overlay | 按动作族建 Component Set | 不计入 104；作为 Carrier 的从属交互节点。 |
| Region / State Component / Micro Variant | 按组件实例建模 | 不复制为顶层业务画板。 |

`104` 是进入 Figma 时需要维护的顶层页面与完整状态画面数，不是 214 条切片的重复截图数。Overlay、组件 Variant 和响应式实例单独管理，不混入顶层 Frame 统计。

## 3. 六层落点模型

每个正式切片必须能沿以下路径找到设计节点：

```text
Carrier Base Frame
  -> Business State / State Frame
    -> Primary Region
      -> Optional Overlay
        -> State Component
          -> Micro Variant
```

| 层级 | 设计职责 | 命名规则 |
| --- | --- | --- |
| 页面 | 稳定信息架构、导航、主对象和主要任务。 | `<Carrier> / <Name> / Base` |
| 页面状态 | 主目标、责任、风险、结果或交接改变后的完整构图。 | `<Carrier> / <Name> / <Slice ID>` |
| 页面区域 | 同一任务中的对象摘要、详情、证据、时间线、表格或持久结果。 | `<Carrier> / R / <Region>` |
| 浮层 | 短选择、输入、确认、审核或高风险决策。 | `<Carrier> / O / <Action> / <State>` |
| 状态组件 | loading、empty、error、permission、conflict、duplicate、partial、handoff、result。 | `StateBlock / Kind=<kind> / Scope=<scope>` |
| 微状态 | default、focus、pressed、selected、disabled、submitting、success、error、stale。 | 组件 Variant Property |

Slice ID 描述业务场景，不描述 Figma 节点类型。一个切片即使以 Region 为主，也必须能从 Carrier Base 和业务状态定位到该 Region；Overlay 只承载动作过程，不能替代动作后的持久结果。

## 4. 三端顶层 Frame 账

### 4.1 顾客端

| Carrier | Base | Gate | State Frame | 顶层合计 | 画面任务 |
| --- | ---: | ---: | ---: | ---: | --- |
| `C-00` | 1 | 1 | 0 | 2 | 身份恢复并返回原目标。 |
| `C-01` | 1 | 0 | 1 | 2 | 首页发现与整页空状态。 |
| `C-02` | 1 | 0 | 0 | 1 | 分类、搜索与筛选结果。 |
| `C-03` | 1 | 0 | 3 | 4 | 下单输入、权威报价、报价失效和下单结果。 |
| `C-04` | 1 | 0 | 8 | 9 | 订单、确认、支付、评价和退款。 |
| `C-05` | 1 | 0 | 5 | 6 | 逆向、投诉和售后结果。 |
| `C-06` | 1 | 0 | 2 | 3 | 客服工单、会话和升级/关闭。 |
| `C-07` | 1 | 0 | 0 | 1 | 通知收件箱与业务跳转。 |
| `C-08` | 1 | 0 | 0 | 1 | 优惠券钱包。 |
| `C-09` | 1 | 0 | 0 | 1 | 资料与地址管理。 |
| 合计 | 10 | 1 | 19 | 30 | 62 条切片。 |

### 4.2 师傅端

| Carrier | Base | Gate | State Frame | 顶层合计 | 画面任务 |
| --- | ---: | ---: | ---: | ---: | --- |
| `W-00` | 1 | 4 | 0 | 5 | 登录、身份交接、暂停和停用阻断。 |
| `W-01` | 1 | 0 | 4 | 5 | 抢单大厅、资格和接单交接。 |
| `W-02` | 1 | 0 | 0 | 1 | 我的任务 Supporting Frame。 |
| `W-03` | 1 | 0 | 5 | 6 | 履约详情、证据与顾客确认。 |
| `W-04` | 1 | 0 | 4 | 5 | 返工任务全生命周期。 |
| `W-05` | 1 | 0 | 0 | 1 | 钱包、账户与提现持久结果。 |
| `W-06` | 1 | 0 | 1 | 2 | 师傅客服与关闭恢复。 |
| `W-07` | 1 | 0 | 0 | 1 | 通知收件箱。 |
| `W-08` | 1 | 0 | 0 | 1 | 信誉与评价申诉。 |
| `W-09` | 1 | 0 | 2 | 3 | 位置共享可用性恢复。 |
| `W-10` | 1 | 0 | 4 | 5 | 认证申请和审核结果。 |
| 合计 | 11 | 4 | 20 | 35 | 54 条切片。 |

### 4.3 后台

| Carrier | Base | Gate | State Frame | 顶层合计 | 画面任务 |
| --- | ---: | ---: | ---: | ---: | --- |
| `A-00` | 1 | 2 | 0 | 3 | 身份、城市和权限守卫。 |
| `A-01` | 1 | 0 | 1 | 2 | 结算批次、应付、队列与对账。 |
| `A-02` | 1 | 0 | 3 | 4 | 结算单创建和审核结果。 |
| `A-03` | 1 | 0 | 0 | 1 | 导出证据与完整性。 |
| `A-04` | 1 | 0 | 1 | 2 | 治理意图与执行边界。 |
| `A-05` | 1 | 0 | 2 | 3 | 订单追踪结果。 |
| `A-06` | 1 | 0 | 0 | 1 | 提现审核主从工作台。 |
| `A-07` | 1 | 0 | 4 | 5 | 售后、退款、投诉、返工与定责。 |
| `A-08` | 1 | 0 | 2 | 3 | 企业客户和一次性密钥结果。 |
| `A-09` | 1 | 0 | 0 | 1 | 派单诊断工作台。 |
| `A-10` | 1 | 0 | 4 | 5 | 平台运营和师傅认证审核。 |
| `A-11` | 1 | 0 | 2 | 3 | 客服队列、工单和实时会话。 |
| `A-12` | 1 | 0 | 0 | 1 | 客服质量指标与抽检详情。 |
| `A-13` | 1 | 0 | 0 | 1 | 评价审核和申诉裁决。 |
| `A-14` | 1 | 0 | 3 | 4 | 营销、券与补偿治理。 |
| 合计 | 15 | 2 | 22 | 39 | 98 条切片。 |

## 5. Base Frame 必备结构

### 5.1 顾客端与师傅端

每个移动端 Base Frame 必须包含：

- 系统安全区、页面标题、返回/关闭策略和底部安全区；
- 单一主任务区；
- 当前业务对象和权威状态；
- 关键动作存在时的固定 `ActionDock`；
- 页面级 loading、offline、stale、permission 和 error 插槽；
- Bottom Sheet 返回原对象、焦点回归和键盘避让锚点；
- 通知/深链进入时的对象恢复与失效回退位置。

### 5.2 后台

每个后台 Base Frame 必须包含：

- 当前角色、城市 Scope、权限和风险边界；
- 页面标题、队列来源、筛选、更新时间与刷新入口；
- 表格/列表、选中对象详情和审计/证据区域；
- 高风险动作区与禁用原因；
- 全页和局部 permission、conflict、offline、partial result 插槽；
- Dialog/Drawer 的焦点进入、焦点归还和 Escape 策略。

## 6. State Frame 升级约束

只有逐 Slice 绑定中标为 `GATE` 或 `STATE_FRAME` 的切片建立顶层业务状态画面。以下运行态也可以临时升级为完整状态画面，但不产生新 Slice ID：

- 首次加载失败且没有安全缓存；
- 整页 403、账号/城市范围阻断；
- 409 使主对象或本地编辑事实失效；
- 提交超时且结果未知；
- 重复命中返回支付、退款、提现等既有关键结果；
- 部分成功导致资金、责任或跨端交接分叉。

这些运行态使用 [INTERACTION_STATE_INVENTORY.md](./INTERACTION_STATE_INVENTORY.md) 中的标准状态组件和恢复动作，不增加业务切片数量，也不改变 Slice ID。

## 7. Frame Map 验收

- [x] 36 个 Carrier 均有 Base Frame；
- [x] 214 条切片均在逐 Slice 绑定中出现一次；
- [x] 7 个 Gate 状态、61 个完整 State Frame 和其余 Region/Overlay 落点已分离；
- [x] 顶层页面/状态 Frame 数确定为 104；
- [x] `W-02` 保持 Supporting Frame，不伪造 Slice ID；
- [x] Overlay 不承担动作后的唯一业务结果；
- [x] 全局异常和微状态继承统一交互清单；
- [x] Frame、Overlay 和组件均可追溯到 Carrier ID / Slice ID；
- [x] 未从旧 Figma 推导业务状态、权限、金额或成功事实。
