# A6 顾客端发现—下单视觉 QA

> 状态：**QA 证据完成；视觉门禁未通过，1 项 P1 阻断待回传修复**  
> 日期：2026-07-22  
> 被测实现：`codex/customer-ui-refactor` @ `2cad1ac2846dfe39c2b84c9f1b0a7a3f1fce03b1`  
> 范围：顾客端主页、服务发现、下单、优惠券；师傅端和后台管理端不在本轮范围  
> 唯一视觉真相：`docs/design/ui/references/customer-home-visual-truth.png`，SHA-256 `32cb6d243e8c7dd1b662110ebf2d9cfc79fe568ea23611097a4e4b2d6e3af74c`

## 结论

A6 的发现—下单主链路可用，320×844、390×844、430×844 三档均无横向溢出。服务选择可把正式 SKU 深链带入下单页；地址、时间、服务端报价确认链路可完成；目录失败、搜索无结果、优惠券失败和报价失败均有可恢复状态。生产构建通过，Playwright 1/1 通过，非预期控制台错误为 0。由于下单表单存在低于 44px 的移动触控目标，本轮功能证据通过但视觉验收门禁为 **FAIL**。

视觉上，四个业务面继承了唯一主页真相的暖奶油底、深墨绿信息层级、陶土橙主动作、语义 3D 类目资产、稳定暖白服务卡与仅用于搜索/筛选/动作坞的功能型液态玻璃。它们没有复制主页布局。

主页中的推荐服务和附近师傅保持诚实空态，未伪造服务、师傅、距离或接单状态。这与已接受的 `CUSTOMER_HOME_QA_ROUND_09.md` 一致：仓库目前没有支持这些事实的权威 API，因此本轮不把空态判为缺陷。

## 分级

| 等级 | 数量 | 结论 |
| --- | ---: | --- |
| P0 | 0 | 无阻断、数据污染、跨端混淆或不可恢复主链路错误 |
| P1 | 1 | 下单核心表单未达到页面卡声明的 44×44 移动触控门禁，阻断 A6 视觉验收 |
| P2 | 1 | 深链恢复提示的完成态语义需要归属 lane 修正 |
| P3 | 0 | 无仅记录型观察项 |

### P1-01 — 下单表单部分可交互控件低于 44px 移动触控门禁

- 证据：`order-service-step-390x844.png`、`order-address-step-390x844.png`、`order-quote-error-390x844.png` 与 `a6-runtime-metrics.json`。
- 实测：服务下拉框 36px 高；数量减/加按钮 42×36；区域、联系人、手机号控件 36px 高；报价错误“重新获取”按钮 36px 高。
- 影响：流程虽然可完成，但不满足 `customer-order-create.md` 明确声明的 44×44 移动触控验收门禁，因此阻断 A6 视觉验收；在单手操作和运动控制场景下容错偏低。
- 归属：B3 下单页 / `@xlb/ui` 表单原语维护方。A6 仅回报，不修改 `apps/customer` 或 `packages/ui`。

### P2-01 — SKU 深链恢复提示在恢复完成后仍使用进行时

- 精确路由：`/customer/order/create?cityCode=hangzhou&skuId=sku_home_daily_2h`。
- 证据：`order-confirm-320x844.png`、`order-confirm-390x844.png`、`order-confirm-430x844.png`、`order-confirm-bottom-390x844.png`。
- 当前文案：`正在恢复链接中的服务或优惠选择，最终价格以服务端报价为准。`
- 实测：服务已解析、报价已获取且已进入第 4 步后，上述进行时提示仍持续显示。
- 期望语义：恢复完成后移除提示；如果产品必须保留提示，则改为完成态，例如 `已恢复链接中的服务选择，最终价格以服务端报价为准。`，且优惠券仅在实际带 `couponGrantId` 时提及。
- 影响：不阻断下单，但状态语义与实际完成状态不一致，并持续占用首屏空间。
- 归属：A2 顾客端 Shell / 深链提示维护方，相关源位于 `customerPageShell.tsx`。A6 仅回报，不跨域修复。

## 场景证据

| # | 场景 | 健康度 | 证据 |
| ---: | --- | --- | --- |
| 1 | 主页 ready，320/390/430 | HEALTHY | `home-ready-320x844.png`、`home-ready-390x844.png`、`home-ready-430x844.png` |
| 2 | 主页目录失败 | HEALTHY | `home-catalog-error-390x844.png` |
| 3 | 服务目录 ready，320/390/430 | HEALTHY | `services-ready-320x844.png`、`services-ready-390x844.png`、`services-ready-430x844.png` |
| 4 | 选择正式 SKU → 继续预约 | HEALTHY | `services-selected-390x844.png`；URL 保留 `sku_home_daily_2h` |
| 5 | 服务搜索无结果 | HEALTHY | `services-no-result-390x844.png` |
| 6 | 下单选择服务 | BLOCKED BY P1-01 | `order-service-step-390x844.png` |
| 7 | 下单填写地址 | BLOCKED BY P1-01 | `order-address-step-390x844.png` |
| 8 | 下单选择时间 | HEALTHY | `order-schedule-step-390x844.png` |
| 9 | 下单确认与服务端报价，320/390/430 | HEALTHY WITH P2-01 | `order-confirm-320x844.png`、`order-confirm-390x844.png`、`order-confirm-430x844.png` |
| 10 | 确认页滚动到底，报价与 CTA 可达 | HEALTHY | `order-confirm-bottom-390x844.png` |
| 11 | 报价失败与重新获取 | BLOCKED BY P1-01 | `order-quote-error-390x844.png` |
| 12 | 优惠券空态，320/390/430 | HEALTHY | `coupons-empty-320x844.png`、`coupons-empty-390x844.png`、`coupons-empty-430x844.png` |
| 13 | 优惠券失败与重试 | HEALTHY | `coupons-error-390x844.png` |

所有 25 张截图均已人工打开检查。主页 390×844 实现与用户提供的唯一真相图在同一比较输入中检查；实现保留品牌层级、4×4 类目、搜索玻璃层、信任条和五项导航，权威数据缺失处使用已接受的诚实空态。

## 数据与边界

- 目录名称与 SKU 编码来自 `docs/catalog/服务类目完整清单.tsv`；QA 夹具覆盖 16 个正式类目、每类前 2 个正式 SKU，共 32 个 SKU。
- `qa-category-*`、`qa-item-*` 和 `qa-price-rule` 仅是浏览器隔离夹具 ID，不是正式业务类目或生产规则。
- 报价夹具用于验证“服务端报价”呈现与失败恢复，不验证真实价格正确性；本轮未调用真实数据库、Redis、支付或外部 Provider。
- 目录/优惠券/报价 503 是刻意注入的恢复态；对应浏览器网络错误已单独记录，不计为非预期控制台错误。
- 本轮未验证提交后的真实订单创建、支付、师傅接单或后台流程。

## 自动验证

```text
pnpm --filter @xlb/customer build
PASS — TypeScript noEmit + Vite production build

pnpm exec playwright test --config playwright.customer-p6a.config.ts
PASS — 1 passed (A6 三档视口、主链路、异常态、运行时尺寸证据)
```

机器可读结果：`a6-runtime-metrics.json`。

## A6 提交边界

本提交只包含 A6 独立的 Playwright 配置、测试、截图、运行指标和本报告。未暂存或提交继承工作区中的 `apps/customer/**`、`packages/ui/**`、`pnpm-lock.yaml`、`design-qa.md` 或其它无关报告。
