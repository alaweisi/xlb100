# P6-B6 顾客端订单 / 支付 / 售后视觉 QA

- 日期：2026-07-22
- 基线：`2cad1ac2846dfe39c2b84c9f1b0a7a3f1fce03b1`
- QA 分支：`codex/customer-ui-refactor-p6-b-orders-aftersale-qa`
- 唯一视觉真相：`docs/design/ui/references/customer-home-visual-truth.png`
- 浏览器方法：本地 Playwright CLI / Chromium
- 数据边界：仅使用契约一致的本地路由 fixture 和本地会话；未访问生产环境
- 施工边界：仅新增 B6 QA 测试、报告和证据；未修改顾客端、师傅端、后台管理端或共享 UI 源码

## 结论

**PASS。** 订单 / 支付 / 评价与售后 / 履约证据页面继承了顾客端主页的设计语言，而没有复制主页布局：暖白背景、深绿信息层级、橙色主动作、柔和描边与阴影、液态玻璃感圆角卡片、统一图标和顾客端底部导航均保持一致。

阻断计数：**P0 = 0，P1 = 0，P2 = 0**。另记录 1 项不阻断 P3 视觉细节，交回 P4-B 售后页面所有者。

## 流程与状态覆盖

| 步骤 | 页面 / 状态 | 结果 | 关键判断 |
| --- | --- | --- | --- |
| 1 | 订单列表：部分订单加载失败 | PASS | 已成功加载的订单继续可用；错误提示和“重试”可见；不泄露工程状态码 |
| 2 | 支付入口 | PASS | 待支付订单只呈现一个清晰主动作；金额、状态与动作层级一致 |
| 3 | 评价展开态 | PASS | 评价表单在订单卡片内延续服务卡片语言；键盘焦点与触控尺寸通过 |
| 4 | 售后记录 ready | PASS | 申请变更、投诉、履约确认被组织为清晰的服务入口和独立卡片 |
| 5 | 履约证据 pending | PASS | 隐私说明、证据来源和确认动作可辨识；未暴露本地 Provider / mock 实现文案 |
| 6 | 服务端确认完成 | PASS | 只有服务端返回确认后才呈现“你已确认完成”，状态语义正确 |

## 响应式与可访问性检查

- 视口：`320×844`、`390×844`、`430×932`。
- 三档视口均无横向溢出。
- 页面内可交互控件均达到至少 `44×44px` 的触控目标。
- 订单评价入口与售后刷新入口可通过键盘获得焦点。
- `prefers-reduced-motion: reduce` 下没有持续运行动画。
- `forced-colors: active` 下顾客端应用根节点保持可见。
- 售后流程控制台零异常。
- 订单部分失败 fixture 会产生 6 条预期的本地 `503` 网络日志；除此之外无控制台异常。

## 视觉证据

### 订单 / 支付 / 评价

- `orders-home-comparison-390x844.png`：主页真相与订单页同板对照。
- `orders-ready-320x844.png`
- `orders-ready-390x844.png`
- `orders-ready-430x932.png`
- `orders-review-390x844.png`
- `orders-automated.report.json`

### 售后 / 履约证据

- `aftersale-home-comparison-390x844.png`：主页真相与售后页同板对照。
- `aftersale-ready-320x844.png`
- `aftersale-ready-390x844.png`
- `aftersale-ready-430x932.png`
- `aftersale-confirmed-390x844.png`
- `aftersale-automated.report.json`

## 缺陷分级

| 编号 | 等级 | 表面 | 观察 | 归属 / 处理 |
| --- | --- | --- | --- | --- |
| B6-P3-001 | P3 | 售后投诉记录 | “转入客服跟进”在窄按钮中换行较碎，但文字完整、动作可用且不遮挡相邻内容 | P4-B 售后页面所有者；后续微调按钮宽度或文案换行策略；B6 不跨域修改 |

## 验证记录

- `pnpm exec playwright test --config playwright.customer-b6.config.ts`：2/2 通过。
- 聚焦单元测试：4 个文件、23/23 通过。
- `pnpm --filter @xlb/customer typecheck`：通过。
- `pnpm --filter @xlb/customer lint`：通过。
- `pnpm --filter '@xlb/customer...' build`：通过。

## 证据限制

本报告证明本次本地 Chromium 运行中的可见布局、关键交互、响应式尺寸和所列媒体回退。截图不能单独证明完整的屏幕阅读器体验或全量 WCAG 合规；本批次不作此类外推。
