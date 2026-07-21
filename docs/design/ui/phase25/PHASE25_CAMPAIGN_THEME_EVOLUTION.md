# Phase 25 — Campaign、节日与动态主题演进契约

## 1. 目标

Phase 25 必须把节日、活动和满减展示设计成可长期演进的前端能力，而不是在页面中临时追加红灯笼、祝福语、颜色或折扣文案。

仓库已经存在 `Campaign` 类型、校验器、`ThemeProvider`、主题注册表，以及 `spring-festival` / `double11` token 骨架；但 `PHASE15_3T_CAMPAIGN_THEME_ARCH_REPORT.md` 已明确后端 Campaign 服务、数据库、管理页面和真实 API 尚未实现。因此 Phase 25 只冻结消费契约与 UI 工程边界，不伪造活动运行时。

## 2. 分层模型

```text
后端活动/定价算法
  -> resolved campaign + authoritative quote/pricing result
  -> app-level campaign bridge (@xlb/api-client)
  -> base tokens
  -> role tokens (customer / worker / admin / oa / dashboard)
  -> campaign visual overlay
  -> route/component/state tokens
  -> 页面呈现
```

各层职责：

1. **后端活动与定价层**：决定活动是否生效、城市/系统/路由/人群范围、优先级、时间窗口、撤销状态、定价规则引用和最终报价。
2. **App bridge 层**：通过 `@xlb/api-client` 消费后端已决议结果，负责加载、缓存、版本、降级和刷新；不得自行判断节日或计算优惠。
3. **基础与角色 token 层**：保持五个系统的品牌一致性，同时允许 Customer 使用锁定主页真相派生的暖奶油/墨绿/明亮陶橙与功能层玻璃，Worker、Admin、OA、Dashboard 使用各自角色外观。
4. **活动覆盖层**：只覆盖批准的视觉 token、文案槽位和素材槽位。
5. **页面层**：组合组件、工作流事实和活动呈现，不包含日期、城市、折扣或资格算法。

## 3. 后端与前端的绝对边界

后端必须决定：

- `status`、`startAt`、`endAt`、优先级和冲突消解；
- `cityScope`、`appScope`、route/placement scope 和适用人群；
- `discountRuleId` 的解释、满减/折扣/券资格及最终金额；
- 活动撤销、暂停、审核、审计与发布版本；
- 返回给页面的真实报价、优惠明细和失效原因。

前端只允许：

- 显示后端返回的活动名称、祝福语、banner、badge、报价和优惠明细；
- 把已决议的 `themeId` 合并到默认主题；
- 在素材失败、主题未知、活动过期或断网时安全回落到默认主题；
- 在不改变业务语义的前提下执行过渡动画和装饰呈现。

前端禁止：

- 使用 `new Date()`、固定月份、农历或节日名称决定活动是否激活；
- 本地计算满减、折扣、券后价、配送补贴或资格；
- 让主题改变权限、可执行动作、API、工作流状态、city scope、审计或幂等；
- 从远端活动内容执行任意 HTML、CSS、SVG 或 JavaScript。

## 4. 标准活动呈现槽位

活动契约后续可在共享类型中扩展为受控 presentation manifest，至少考虑：

| Slot | 用途 | 约束 |
| --- | --- | --- |
| `headerDecoration` | 红灯笼、彩带等页头装饰 | 不遮挡城市、返回、搜索和账户操作 |
| `heroArtwork` | 首页主视觉或活动插画 | 预声明宽高比，避免布局跳动 |
| `blessingCopy` | 春节祝福语、节日副标题 | 后端/运营内容，前端不拼接日期或资格 |
| `banner` | 活动信息和可选 CTA | CTA 必须映射到批准的内部 action/route |
| `badge` | 活动、限时、优惠标签 | 不替代真实价格或状态标签 |
| `ambientBackground` | 环境光、纹理、色彩氛围 | 对比度、性能和降级必须通过 gate |
| `navigationAccent` | 导航的轻量活动强调 | 不改变导航顺序和可用性 |

素材必须来自批准的静态资源或可信资产清单，具有版本、尺寸、格式、hash/完整性、alt/装饰语义和 fallback。缺少源素材时先走正式素材设计流程，不用 emoji、CSS 图形或占位框伪造灯笼。

`CampaignPresentation` / `AssetManifest` 正式评审必须冻结：slot id、asset id/revision、locale、文案长度、aspect ratio、像素尺寸、MIME/format、max bytes、hash/integrity、responsive sources、alt/装饰语义、z-index、pointer-events、preload priority、fallback 和 allowlisted CTA `actionKey`。页面不得直接消费活动返回的任意 URL 或远端跳转逻辑。

## 5. 五系统活动策略

- **Customer**：活动视觉可以最丰富，但必须以 `CUSTOMER_HOME_VISUAL_TRUTH.md` 为基础；装饰只能作为覆盖层，不得重画 4×4 类目、推荐服务、附近师傅、信任保障和五项导航的信息架构。
- **Worker**：只呈现与师傅相关的活动通知、激励说明或轻量节日氛围；收益和任务资格必须来自真实 API。
- **Admin**：提供未来 Campaign 配置、审核、预览、发布、暂停、撤销与审计入口；未有后端契约前不制作可执行假后台。
- **OA**：只呈现内部通知或审批事实；当前 `CampaignAppScope` 尚无 `oa`，须先完成类型、权限和 API 契约评审。
- **Dashboard**：允许低干扰节日边框、背景和标题装饰，但不得遮挡指标、告警、时间窗口、数据新鲜度或断流状态；当前 `CampaignAppScope` 尚无 `dashboard`。

## 6. Gate 1 内部工作包

Gate 1 虽是一个主步骤，但拆成以下六个顺序工作包：

1. **1A Token Taxonomy**：基础 token、角色 token、状态 token 与活动覆盖优先级。
2. **1B Material System**：Customer 主页材料、功能层玻璃、3D 类目图像边界、降级、高对比和 reduced-motion 规则。
3. **1C Campaign Contract Bridge**：resolved campaign 消费、默认回退、缓存、刷新、撤销和版本策略。
4. **1D Asset Slots**：灯笼、祝福语、banner、badge、环境背景的资产清单和安全槽位。
5. **1E Components And Shells**：共享 primitives/patterns、五系统 shell 与活动覆盖边界。
6. **1F Gallery And Tests**：默认/春节/双11/未知主题、加载/失败/撤销、可访问性与性能证据。

Gate 1 未全部通过前，不进入 Customer proof screen。

## 7. 活动专项验收

必须至少验证：

- scheduled、active、ended、revoked、未知 `themeId` 和 default fallback；
- 城市、系统、路由和 placement 不匹配时不展示；
- 多活动冲突时只消费后端已决议结果；
- 明确“单一视觉赢家 + 可并行价格活动”的后端政策、priority/tie-break 与 revision；前端不合并多个视觉主题；
- 报价前后、活动过期、重新报价与提交订单之间不出现前端自算金额；
- 资产 404、慢加载、离线、版本切换和 kill switch；
- 390px Customer、桌面 Admin/OA 和目标 Dashboard 分辨率无溢出、遮挡和布局跳动；
- WCAG 对比度、键盘焦点、屏幕阅读器语义、reduced motion；
- Dashboard 装饰不降低指标辨识度，stale/disconnected 状态始终高于活动视觉；
- 视觉回归同时保存默认主题和活动主题的同视口对比证据。
- 请求取消/乱序、换城/换角色/登录/退出、多标签、clock boundary、缓存过期和防重放证据。

现有 `CampaignStatus` 仅包含 `draft/scheduled/active/ended/revoked`；发布流程设计中出现 reviewed/paused 时，必须先通过后端状态机与共享类型评审，不得由前端自行扩展或假设状态已存在。

## 8. 当前差距与准入结论

| 项目 | 当前事实 | Phase 25 处理 |
| --- | --- | --- |
| Campaign 类型/校验器 | 已有三端 scope 骨架 | Gate 0 冻结差距；扩展五端须另行 contract approval |
| ThemeProvider/Registry | 已有 token 合并和 fallback | Gate 1 审计并扩展，不让其访问 API 或时间 |
| 春节/双11 token | 已有基础颜色骨架 | Gate 1 按角色、材质、状态和可访问性深化 |
| 后端 Campaign 服务 | 未实现 | 不在前端伪造；进入后端正式 Phase 前先评审领域模型 |
| 满减/折扣算法 | 前端无权实现 | 只消费权威 quote/pricing result |
| 活动素材 manifest | 未实现 | Gate 1D 先定义安全契约与资产生产流程 |
| OA/Dashboard scope | 类型尚未覆盖 | readiness 通过后再扩展，不提前造运行时 |

当前结论：动态活动能力属于 Phase 25 UI 系统工程的一部分，但真实活动激活和满减算法仍必须由后端正式能力提供。
