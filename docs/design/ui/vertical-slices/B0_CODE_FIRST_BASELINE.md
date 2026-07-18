# B0 代码优先施工基线

状态：`READY`
生效日期：2026-07-17
适用范围：顾客端、师傅端、后台的 Shell、身份 Gate、城市/权限 Gate 与共享状态组件。

## 1. 单一事实源

B0 起全面退出 Figma 施工链：

- 不再读取、更新或验收任何 Figma 文件；
- 历史 Figma 与导出 PNG 仅作为归档资料，不再进入设计判断；
- `214` 条切片、`36` 个 Carrier、Frame Map 和交互状态清单继续有效；
- 原“Frame”统一解释为可运行代码中的业务画面，不再代表 Figma 节点；
- 设计、交互、可访问性和响应式验收以三端运行页面及自动化测试为准。

事实链固定为：

```text
后端状态机 / API / 权限
  -> Slice Contract
  -> Frame Map 与交互状态清单
  -> @xlb/ui 共享组件
  -> apps/customer | apps/worker | apps/admin
  -> 浏览器运行画面、交互测试与截图证据
```

## 2. B0 固定范围

B0 只建设以下 `10` 个顶层业务画面，不扩张到其余 Carrier：

| 端 | Base | Gate | 合计 |
| --- | ---: | ---: | ---: |
| 顾客端 `C-00` | 1 | 1 | 2 |
| 师傅端 `W-00` | 1 | 4 | 5 |
| 后台 `A-00` | 1 | 2 | 3 |
| 总计 | 3 | 7 | 10 |

七个 Gate 对应：

- `C.AUTH.SESSION.REQUIRED`
- `W.AUTH.SESSION.UNAUTHENTICATED`
- `W.AUTH.SESSION.AUTHENTICATED`
- `W.PROFILE.ACCESS.SUSPENDED`
- `W.PROFILE.ACCESS.DISABLED`
- `A.AUTH.SESSION.REQUIRED`
- `A.SCOPE.CITY.REQUIRED`

## 3. 视觉语言

### 3.1 苹果式服务卡片

“苹果式”指信息层级与交互品质，不复制 Apple 品牌资产：

- 一张卡片只承担一个服务对象或一个明确动作；
- 顺序固定为服务标题、关键事实、状态/价格、下一动作；
- 大圆角、清晰留白、克制分隔线和稳定阴影；
- 整卡可点时不得在卡内制造互相冲突的点击区域；
- 触控目标不小于 `44px`，文本与金额保持可扫读；
- 正式服务类目只能来自官方类目事实源，不从视觉稿发明。

### 3.2 液态玻璃组件

Liquid Glass 是功能层，不是全局装饰层：

- 使用位置：顶部导航、底部导航、搜索、关键浮动操作、Sheet/Dialog、Gate 操作容器；
- 内容层服务卡片默认使用稳定材质，仅保留玻璃边缘、高光和环境阴影；
- 默认使用 `regular` 语义；仅在图像/富背景上允许高透明 `clear`；
- 提供无 `backdrop-filter`、高对比度、减少透明度和减少动效回退；
- 任何玻璃效果不得覆盖权限、错误、金额、状态和禁用原因的可读性。

## 4. 共享组件固定清单

B0 不创建大而全的新组件库，只补齐当前切片需要的最小集合：

1. `LiquidGlassSurface`：`navigation | control | overlay` 三种用途及可访问性回退；
2. `AppleServiceCard`：服务标题、摘要、状态、价格、元数据和单一主动作；
3. `IdentityGate`：手机号/账号、验证码、提交、错误与原目标恢复说明；
4. `CityScopeGate`：城市选择、当前范围、返回原目标；
5. `PermissionState`：权限原因、不可见边界、替代动作；
6. `ConflictState`：权威事实变化摘要与重新读取；
7. `OfflineState`：缓存事实、更新时间、输入保留与恢复；
8. `DuplicateState`：打开既有结果，禁止重复提交；
9. `PartialResultState`：成功/失败总计与失败子集重试；
10. `HandoffState`：下一责任人、交接时间和后续入口；
11. `PersistentResultState`：未知/处理中/成功/失败的持久结果落点。

现有 `Button`、`Input`、`FormField`、`StatusTag`、`ScopeBadge`、`MobileShell`、`AdminShell`、`TopBar`、`BottomNav` 和 `SideNav` 优先复用，不建立重复 API。

## 5. 三端差异

- 顾客端：暖色舒适层，服务发现优先；苹果式服务卡片与玻璃导航为主要视觉表达。
- 师傅端：深色作业层，状态、倒计时、资格和阻断原因优先；玻璃仅用于导航与操作层。
- 后台：宽屏高密度作业层，城市范围、角色、审计和表格事实优先；不得把后台压成移动端卡片流。

## 6. B0 完成条件

- 10 个顶层业务画面都能从真实路由或可控状态进入；
- 七个 Gate 与对应 Slice ID 一一可追踪；
- 登录恢复原目标，城市恢复先于业务返回；
- 权限、冲突、离线、重复、部分成功、交接和持久结果均有共享组件落点；
- 三端类型检查通过，相关组件与主路径测试通过；
- 在目标视口完成运行截图检查，并覆盖减少透明度/高对比度回退；
- 无任何 Figma 依赖、链接或节点 ID 参与构建和验收。
