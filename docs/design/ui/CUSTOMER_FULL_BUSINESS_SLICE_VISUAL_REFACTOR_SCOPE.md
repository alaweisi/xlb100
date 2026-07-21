# 顾客端全业务切片的设计系统统一与视觉重构 — 施工范围清单

> 状态：**SCOPE FROZEN / READY FOR SEQUENCED CONSTRUCTION**
> 适用端：仅 `apps/customer`
> 排除端：`apps/worker`、`apps/admin`、`apps/oa`、`apps/dashboard`
> 视觉母体：[`CUSTOMER_HOME_VISUAL_TRUTH.md`](./CUSTOMER_HOME_VISUAL_TRUTH.md)
> 设计系统：[`XLB_CUSTOMER_APP_DESIGN_SYSTEM.md`](./XLB_CUSTOMER_APP_DESIGN_SYSTEM.md)
> 工程拓扑：[`CUSTOMER_UI_REFACTOR_ENGINEERING_TOPOLOGY.md`](./CUSTOMER_UI_REFACTOR_ENGINEERING_TOPOLOGY.md)
> P0 基线：[`CUSTOMER_UI_REFACTOR_P0_BASELINE.md`](./CUSTOMER_UI_REFACTOR_P0_BASELINE.md)

## 1. 施工目标

本项目的正式名称是：**顾客端全业务切片的设计系统统一与视觉重构**（Customer Design System Unification & Full-Slice Visual Refactor）。

所有顾客端页面、区域、浮层、状态组件和微状态都继承已锁定主页的设计语言，包括暖奶油底、墨绿标题、明亮陶橙关键动作、舒适密度、苹果服务卡片式层级、功能层 Liquid Glass、语义 3D 服务图像、五项底部导航、安全区和 44px 触控规则。

继承的是**设计语言和交互规则**，不是把主页布局复制到其他页面。每个切片的信息结构、业务状态、可执行动作、禁用原因、成功结果和恢复路径仍由当前代码、后端流程、权限、`@xlb/api-client`、共享类型与校验器决定。

## 2. 不变边界

- 不修改或发明正式服务类目；唯一来源仍是 `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md`。
- 不从主页图推断价格、优惠、附近师傅、认证、距离、可接单状态、订单状态或成功结果。
- 不重写支付、退款、售后、权限、金额、幂等、审计和业务状态机。
- 不把 Worker、Admin、OA、Dashboard 的颜色、布局、密度或组件配方带入 Customer。
- 不以 Toast、颜色、Tag、路由跳转或本地假数据单独承担权威结果。
- 不重新引入历史 Customer Figma 主页或已删除的旧主页 PNG。

## 3. 全局继承规则

| 设计层 | 顾客端统一规则 | 禁止事项 |
| --- | --- | --- |
| Liquid Glass | 只用于顶部栏、搜索/筛选、底部导航、操作 Dock、Modal、Drawer、Bottom Sheet 和短促功能容器 | 普通订单、长表单、价格、地址、长文本卡片不做高透明强模糊 |
| 苹果服务卡片 | 暖白稳定表面、柔和圆角、细边缘高光、轻阴影、清晰图像—标题—元数据—动作层级 | 不做卡中卡，不让每张卡都浮起，不照搬 Apple 商标、系统资产或专有文案 |
| 色彩 | `#FEFAF5` 页面、`#18342D` 标题、`#334155` 正文、`#E97116` 主要动作；状态色保持受保护语义 | 不用陶橙表达成功/危险，不混入 Worker 蓝或 Admin 紫 |
| 字体 | Noto Sans SC 为顾客端标题、正文和控件主字体；数字使用 tabular-nums | 不重新引入主页不要求的 Serif，不在页面私造字号 |
| 图像 | 16 个正式一级类目使用同一美术体系的独立 3D 图像；接口图标使用 Phosphor | 不用 Emoji、重复扳手、CSS 图形或截图裁切充当正式资产 |
| 导航 | `首页 / 客服 / 新报修 / 订单 / 我的`；通知从主页顶部铃铛进入 | 不出现第六、第七个一级 Tab，不把消息重新塞回底栏 |
| 状态 | loading、empty、error、ready、validation、submitting、success，并按契约补 permission/offline/stale/conflict/duplicate/partial | 不清空用户输入，不显示假成功，不仅使用禁用态解释失败 |
| 响应式/无障碍 | 390×844 为主验收，320px 窄屏与 430px 宽屏复核；触控 ≥44px；可见焦点、读屏标签、减少动效和强对比回退 | 不横向溢出，不被固定导航遮挡，不用仅 Hover 承载动作 |

## 4. 当前页面载体

当前代码存在 9 个顾客端页面载体；它们是切片的承载容器，不等同于 9 个业务切片。

| 载体 | 路由 | 当前代码 | 页面卡 |
| --- | --- | --- | --- |
| 主页 | `/customer/` | `CustomerHomePage.tsx` | `phase25/page-cards/customer-home.md` |
| 服务发现 | `/customer/services` | `CustomerServicesPage.tsx` | `phase25/page-cards/customer-services.md` |
| 创建订单 | `/customer/order/create` | `CustomerOrderCreatePage.tsx` | `phase25/page-cards/customer-order-create.md` |
| 订单与履约 | `/customer/orders` | `CustomerOrdersPage.tsx` | `phase25/page-cards/customer-orders.md` |
| 售后 | `/customer/aftersale` | `CustomerAftersalePage.tsx` | `phase25/page-cards/customer-aftersale.md` |
| 客服 | `/customer/support` | `CustomerSupportPage.tsx` | `phase25/page-cards/customer-support.md` |
| 通知 | `/customer/notifications` | `CustomerNotificationsPage.tsx` | `phase25/page-cards/customer-notifications.md` |
| 优惠券 | `/customer/coupons` | `CustomerCouponsPage.tsx` | `phase25/page-cards/customer-coupons.md` |
| 我的 | `/customer/profile` | `CustomerProfilePage.tsx` | `phase25/page-cards/customer-profile.md` |

## 5. 逐切片施工清单

状态标记：`[ ]` 未施工；`[~]` 施工中；`[x]` 已通过同视口视觉验收。仅创建文档或通过类型检查不等于 `[x]`。

### Wave 0 — 权威、Token 与范围冻结

| 状态 | Slice ID | 边界 | 权威输入 | 视觉重构结果 | 验收重点 |
| --- | --- | --- | --- | --- | --- |
| [x] | CUST-DS-001 | 主页视觉真相与继承规则 | 锁定主页 PNG、用户裁决 | 单一主页真相、旧基准删除、防回归哈希 | 唯一来源可复验 |
| [x] | CUST-DS-002 | 顾客端基础色与材料 Token | `baseTokens`、Customer material recipe | 暖奶油/墨绿/陶橙、功能层玻璃与回退规则 | Token 测试通过 |
| [x] | CUST-DS-003 | 顾客端组件 Recipe | `@xlb/ui` 现有组件 | Button/Input/Card/Tabs/State/Overlay 全部消费 Customer role/component token | 清除顾客端硬编码视觉值 |
| [x] | CUST-ASSET-001 | 16 个一级服务类目资产 | 官方目录 + 唯一主页图像语言 | 16 个独立语义 3D PNG/WebP 资产及稳定映射 | 无 Emoji/重复图标；尺寸、裁切、alt 合格 |

### Wave 1 — App Shell 与共享状态

| 状态 | Slice ID | 载体/边界 | 权威输入 | 必须覆盖的状态/动作 | 视觉重构结果 |
| --- | --- | --- | --- | --- | --- |
| [ ] | CUST-SHELL-001 | App 认证 Gate | session/auth API | authenticating、authenticated、recoverable error、expired/permission | 品牌化稳定 Gate；不把认证失败伪装成目录错误 |
| [ ] | CUST-SHELL-002 | `CustomerRouteShell` | 当前路由映射 | 9 路由、五项主导航、active state、safe area | 统一顶部/底部功能层玻璃、中心 +、真机/预览模式 |
| [ ] | CUST-SHELL-003 | 城市与深链恢复 | city scope、query params、local storage | 城市切换、非法 city、`skuId/orderId/couponGrantId` 恢复 | 与主页位置搜索控件同语言，恢复路径可见 |
| [ ] | CUST-STATE-001 | 全局 Loading/Empty/Error | `@xlb/ui` 状态组件 | loading、empty、error、retry、partial、stale、offline | 稳定布局、明确原因和恢复动作 |
| [ ] | CUST-STATE-002 | 全局业务异常 | API/权限/幂等事实 | permission、conflict、duplicate、unknown result | 受保护语义，不用 Toast/颜色单独承载 |
| [ ] | CUST-A11Y-001 | Overlay 与键盘/读屏 | Modal/Drawer/BottomSheet | focus trap、restore focus、Esc、label、announcement | 玻璃回退、强对比、reduced-motion 完整 |

### Wave 2 — 主页母版

| 状态 | Slice ID | 区域/边界 | 权威输入 | 必须覆盖的状态/动作 | 视觉重构结果 |
| --- | --- | --- | --- | --- | --- |
| [ ] | CUST-HOME-001 | 品牌头、通知、位置搜索 | city、通知入口、目录搜索 | ready、search input、city change、notification deep link | 1:1 对齐锁定主页顶部层级与功能玻璃 |
| [ ] | CUST-HOME-002 | 4×4 全部服务 | 官方目录/API | loading、empty、error、ready、category open | 16 类 3D 图像卡、真实名称/顺序、44px 目标 |
| [ ] | CUST-HOME-003 | 推荐服务横向流 | 推荐 API（当前未确认） | loading、empty、error、ready、open service | 无权威接口前隐藏或诚实空态；禁止模拟推荐 |
| [ ] | CUST-HOME-004 | 附近师傅横向流 | 师傅/距离/可接单 API（当前未确认） | permission、loading、empty、error、ready、stale | 无权威接口前隐藏或诚实空态；禁止假师傅 |
| [ ] | CUST-HOME-005 | 信任保障与底部导航 | 平台能力事实、路由 | four trust items、service availability note、five nav actions | 对齐主页信任条和 `首页/客服/+/订单/我的` |

### Wave 3 — 服务发现与创建订单

| 状态 | Slice ID | 载体/边界 | 权威输入 | 必须覆盖的状态/动作 | 视觉重构结果 |
| --- | --- | --- | --- | --- | --- |
| [ ] | CUST-CATALOG-001 | 服务搜索/分类/结果 | `GET /api/catalog` | loading、catalog empty、no result、error/retry、ready | 继承主页搜索与服务卡语言，筛选控件使用功能玻璃 |
| [ ] | CUST-CATALOG-002 | SKU 选择与下单深链 | catalog item/SKU、`skuId` | selected、invalid/stale SKU、open create-order | 苹果服务卡片层级，正式 SKU 信息不截断失真 |
| [ ] | CUST-ORDER-001 | Step 1 选择服务 | catalog、selected SKU | loading、empty、error、invalid、selected | 3D 类目/服务卡与步骤导航统一 |
| [ ] | CUST-ORDER-002 | Step 2 地址与联系人 | address options、validators | empty、validation、editing、valid | 稳定表单卡；字段错误邻近并保留输入 |
| [ ] | CUST-ORDER-003 | Step 3 上门时间 | schedule contract | default、selected、unavailable/validation | 单手选择、清晰选中态、不仅依赖颜色 |
| [ ] | CUST-ORDER-004 | Step 4 报价与优惠券 | quote API、coupon grants、discount decision | quoting、quote error/retry、coupon loading/empty/error、decision success/error | 价格卡稳定可读；优惠券为次级选择，不伪造折扣 |
| [ ] | CUST-ORDER-005 | 提交与持久成功 | create/get order API、idempotency | disabled reason、submitting、duplicate/conflict、error、server-confirmed success | 单一固定主操作；成功页显示订单与下一责任人 |

### Wave 4 — 订单、支付、确认、评价与退款

| 状态 | Slice ID | 载体/边界 | 权威输入 | 必须覆盖的状态/动作 | 视觉重构结果 |
| --- | --- | --- | --- | --- | --- |
| [ ] | CUST-ORDERS-001 | 订单列表与订单卡 | order API/state machine | loading、empty、error、partial、all backend states | 卡片先显示当前状态、责任人和下一步，不做按钮仓库 |
| [ ] | CUST-CONFIRM-001 | 服务确认 | confirm API/state guard | guarded、submitting、success、error/conflict | 确认动作使用明确结果区，不用瞬时 Toast |
| [ ] | CUST-PAY-001 | 支付入口与结果 | payment order/provider response | unavailable、submitting、unknown、success、failure/duplicate | 金额与 Provider 事实可追溯；视觉主次不误导 |
| [ ] | CUST-REVIEW-001 | 评价创建/已评价 | review API | guarded、validation、submitting、success、error、persisted | 评分控件可访问，成功结果持久展示 |
| [ ] | CUST-REVIEW-002 | 评价申诉与撤回 | appeal API/status | no appeal、open、submitting、conflict、withdrawn、resolved | 申诉状态与可行动作分层，不堆在订单主卡 |
| [ ] | CUST-REFUND-001 | 退款/售后申请入口 | refund API/state guard | guarded、validation、submitting、success、error/duplicate | 危险/逆向动作与普通操作视觉分离 |

### Wave 5 — 售后与客服

| 状态 | Slice ID | 载体/边界 | 权威输入 | 必须覆盖的状态/动作 | 视觉重构结果 |
| --- | --- | --- | --- | --- | --- |
| [ ] | CUST-AFTER-001 | 订单选择与逆向申请 | reverse request API | no order、loading、validation、submitting、applied/rejected/error | 移动卡片/列表替代桌面 Table；原因与恢复清晰 |
| [ ] | CUST-AFTER-002 | 客诉创建与记录 | complaint API | validation、submitting、open/processing/resolved/closed、error | 优先级/状态不只靠颜色，记录可扫读 |
| [ ] | CUST-AFTER-003 | 履约证据与确认争议 | evidence/confirmation API | empty、loading、pending、confirmed、disputed、error | 媒体证据、时间线和确认动作分区；禁止工程文案外露 |
| [ ] | CUST-SUPPORT-001 | 工单创建与列表 | support ticket API | loading、empty、validation、submitting、open/escalated/resolved/closed、error | 客服作为一级目的地；表单、列表与状态统一 |
| [ ] | CUST-SUPPORT-002 | 工单详情/评论/重开/CSAT | ticket detail API | loading、event empty、comment submitting、reopen guard、closed/CSAT | 详情时间线、输入 Dock 和持久结果清晰 |
| [ ] | CUST-SUPPORT-003 | 实时会话 | conversation/message API | no conversation、loading、open、sending、partial/realtime error、closed | 会话使用稳定消息层；断流/重试不伪装实时 |

### Wave 6 — 通知、优惠券、我的与地址

| 状态 | Slice ID | 载体/边界 | 权威输入 | 必须覆盖的状态/动作 | 视觉重构结果 |
| --- | --- | --- | --- | --- | --- |
| [ ] | CUST-NOTIFY-001 | 收件箱/归档/分页 | notification API、cursor | loading、empty、error/retry、ready、loading-more | 从主页铃铛进入；通知卡继承服务卡层级 |
| [ ] | CUST-NOTIFY-002 | 已读/归档/恢复/深链 | notification mutation、revision | busy、success、409 conflict、error、target unavailable | 行级反馈持久且可恢复，冲突尊重服务端真相 |
| [ ] | CUST-COUPON-001 | 可用/全部优惠券 | coupon grant API | loading、empty、error/retry、available/used/expired | 券卡保持顾客端暖白风格；不在前端计算金额 |
| [ ] | CUST-COUPON-002 | 用于报价深链 | couponGrantId、quote/decision API | selectable、not-selectable、stale、deep-link recovery | 选择结果进入订单报价，不本地宣称优惠成功 |
| [ ] | CUST-PROFILE-001 | 账户资料 | profile API | loading、ready、validation、saving、success、error | 账户摘要和编辑分层，移除工程标签与英文占位 |
| [ ] | CUST-ADDRESS-001 | 地址列表/新增/编辑/删除 | address API、city scope、idempotency | empty、editing、validation、saving、delete confirm、success/error/conflict | 地址卡、表单和确认浮层统一，删除可撤销/确认边界明确 |

### Wave 7 — 全量验收与收口

| 状态 | Slice ID | 验收面 | 必须完成 |
| --- | --- | --- | --- |
| [ ] | CUST-QA-001 | 9 个页面载体 | 每个载体 ready/default + 最高风险 loading/error/success 状态截图 |
| [ ] | CUST-QA-002 | 视觉一致性 | 与主页真相同屏比较；P0/P1/P2 全部修复，P3 可登记后续 |
| [ ] | CUST-QA-003 | 响应式与安全区 | 320、390×844、430 宽度无横向溢出、无遮挡、键盘可用 |
| [ ] | CUST-QA-004 | 无障碍与回退 | focus、读屏名称、对比度、forced-colors、reduced-motion、无 blur 回退 |
| [ ] | CUST-QA-005 | 工程验证 | 顾客端相关单测、typecheck、lint、build 和已有 E2E 通过 |

## 6. 推荐施工顺序

严格按 `Wave 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7` 推进。每个 Wave 内允许按不修改同一文件/契约的实际冲突并行，但同一共享组件、同一订单状态动作或同一视觉 Token 必须串行收口。

主页是视觉证明面；主页通过不代表其他切片完成。共享组件在 Wave 1 收口后，后续页面优先组合 `@xlb/ui`，不得为每个页面复制一套“主页风格 CSS”。

## 7. 每个切片的 Definition of Ready

- 已确认角色为 Customer、载体与边界类型（页面/区域/浮层/状态组件/微状态）。
- 已指出 API、共享类型、校验器、权限、状态机和正式目录来源。
- 已明确主任务、可执行动作、禁用原因、错误恢复和下一责任人。
- 已选择继承的 Customer 组件/Token；缺失资产或 API 已明确为真实阻塞。
- 已列出 ready/default 与最高风险状态的验收场景。

## 8. 每个切片的 Definition of Done

- 业务动作继续使用现有权威 API/契约，没有本地假成功或重复契约。
- 视觉继承主页语言，但结构适合该业务，不机械复制主页。
- loading、empty、error、ready、validation、submitting、success 及适用异常状态完整。
- 390×844 运行截图与主页真相/设计系统一起比较，P0/P1/P2 为 0。
- 触控目标、焦点、读屏、强对比、减少动效、安全区与窄屏复核通过。
- 相关测试、类型检查、lint、build 通过；页面无阻断性控制台错误。

## 9. 明确不在本项目范围

- Worker 抢单、任务、钱包、认证等师傅端切片。
- Admin 移动运营、OA 桌面工作台和 Dashboard 大屏。
- 新业务、新 Provider、新价格/优惠算法、新服务类目或后端状态机设计。
- Push、deploy、生产数据、真实支付/短信/对象存储 Provider 和公开发布。
