# 顾客端全业务切片视觉重构 — P0 基线冻结

> 状态：**P0 BASELINE FROZEN / READY FOR P1**
> 冻结日期：2026-07-21
> 集成分支：`codex/customer-ui-refactor`
> 适用范围：仅 Customer；不包含 Worker、Admin、OA、Dashboard

## 1. P0 冻结结论

P0 只冻结“施工从什么事实出发”，不宣称任何业务页面已经完成视觉重构。后续 P1–P7 必须从本文所在的 P0 集成提交分叉，并服从以下权威顺序：

1. 当前代码、API、共享类型、校验器、权限与状态机决定业务事实。
2. [`CUSTOMER_HOME_VISUAL_TRUTH.md`](./CUSTOMER_HOME_VISUAL_TRUTH.md) 与唯一 PNG 决定顾客端主页视觉。
3. [`XLB_CUSTOMER_APP_DESIGN_SYSTEM.md`](./XLB_CUSTOMER_APP_DESIGN_SYSTEM.md) 把主页语言转换为全顾客端可复用规则。
4. 页面卡与 [`CUSTOMER_FULL_BUSINESS_SLICE_VISUAL_REFACTOR_SCOPE.md`](./CUSTOMER_FULL_BUSINESS_SLICE_VISUAL_REFACTOR_SCOPE.md) 决定各业务切片结构、状态和验收入口。
5. [`CUSTOMER_UI_REFACTOR_ENGINEERING_TOPOLOGY.md`](./CUSTOMER_UI_REFACTOR_ENGINEERING_TOPOLOGY.md) 决定阶段、工作树、文件所有权和合流顺序。

## 2. 唯一主页视觉真相

| 项目 | 冻结值 |
| --- | --- |
| 文件 | `docs/design/ui/references/customer-home-visual-truth.png` |
| 尺寸 | 853 × 1844 |
| 验收视口 | 390 × 844 |
| SHA-256 | `32CB6D243E8C7DD1B662110EBF2D9CFC79FE568EA23611097A4E4B2D6E3AF74C` |
| 用户裁决 | 候选 1；顾客端主页唯一真相 |

仓库内当前只允许这一张名称或语义指向 Customer Home 的现行视觉图片。以下旧来源保持删除，禁止恢复：

- `docs/design/ui/phase25/references/customer-apple-liquid-glass-source.png`
- `docs/design/figma/frames/customer/customer_home_default_1-228.png`

历史报告可以保留它们曾经存在的记录，但不得再被当前架构、页面卡、材料配方、自动门禁或实施手册引用为现行权威。

## 3. 冻结资产与契约

### 3.1 视觉与设计系统

- 唯一主页真相声明与 PNG。
- 顾客端设计系统及其 CSS 交付映射。
- `packages/ui` 的 Customer 基础色与材料配方来源指针。
- 当前 Phase 25 Customer 材料、Runtime Theme 与 Campaign 覆盖边界。

### 3.2 页面入口

- 9 个 Customer 页面载体：主页、服务发现、创建订单、订单、售后、客服、通知、优惠券、我的。
- 44 个唯一 Slice ID，按 Wave 0–7 管理。
- 9 张 Customer 页面卡和 Customer 路由契约矩阵。

### 3.3 施工入口

- P0–P7 阶段拓扑。
- 最多 3 个并行写入单元。
- 共享 token、组件、Shell、路由与同一页面文件保持唯一所有者。
- P1 之前不得启动页面视觉重构分支。

## 4. P0 明确不纳入的当前改动

为避免把未验收实现混入权威基线，P0 提交不包含：

- `apps/customer/src/app/**` 与 `apps/customer/src/pages/**` 的页面实现改动；
- `packages/ui/src/layouts/**` 与页面模板实现改动；
- `apps/customer/package.json`、`pnpm-lock.yaml` 和 PWA manifest 改动；
- `design-qa.md`、架构审计、商业就绪报告、计划目录等与本次 P0 无关的现有改动；
- Worker、Admin、OA、Dashboard 的任何页面、token、组件或视觉资产。

这些文件继续留在原工作区，不被删除、覆盖、暂存或冒充 P0 完成证据。后续如需采用，必须进入对应 P1–P6 文件所有权域重新验证。

## 5. P0 门禁

- 唯一 PNG 存在，尺寸和 SHA-256 与冻结值一致。
- 两张旧主页图片不存在。
- 当前设计架构、路由矩阵、页面卡、材料配方、实施手册均引用唯一真相。
- Customer 页面卡为 9 张；范围清单含 44 个唯一 Slice ID。
- 正式服务目录仍指向 `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md`，未从图片创建新类目事实。
- 当前基线没有 Worker/Admin/OA/Dashboard 页面改动。
- Phase 25 设计门禁、Customer token/材料配方单测、相关 typecheck 与差异检查通过。

## 6. P1 开工条件

P0 集成提交完成且 `codex/customer-ui-refactor` 可复现后，才可以按工程拓扑创建 P1 三工作树：

- Slot A：共享设计系统与状态/A11y recipe；
- Slot B：16 类正式服务资产与映射；
- Slot C：顾客端 QA 基础设施。

P1 启动不代表允许修改 Worker、Admin、OA、Dashboard，也不产生 push、deploy 或生产操作权限。
