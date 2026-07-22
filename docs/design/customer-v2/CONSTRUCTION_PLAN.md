# Customer UI V2 工程施工拆分

## 1. 唯一范围

- 仅重建 `apps/customer` 顾客端。
- 不修改 Worker、Admin、OA、Dashboard 的页面与视觉体系。
- API、SKU Catalog、订单状态机、金额与权限事实保持不变。
- 主页参考图是顾客端视觉唯一真相；16 类服务图标图是类目图标唯一视觉资产源。
- 正式类目名称、顺序和 SKU 只来自 `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md` 与 API。
- 不引入 `sdj99` 包名、文件名、运行时标识或业务文案。

## 2. 架构层级

```text
Customer Design Tokens
  -> Customer UI Primitives
    -> Customer Business Components
      -> Customer Page Templates
        -> Customer Route Slices
```

页面只负责组合与路由装配；数据请求、契约适配和交互状态放在 Feature 层；业务组件不得直接发起 API 请求。

## 3. 工程施工单元

42 个业务切片组合为 9 个业务施工模块，另设 2 个基础/集成单元。不能把 42 个切片机械拆成 42 个工作树。

| 单元 | 分支 | 独占目录/文件 | 业务范围 | 前置 |
| --- | --- | --- | --- | --- |
| F0 基础设计系统 | `codex/customer-ui-v2-foundation` | `packages/customer-components/src/foundation/**`、`common/**`、`tokens/**`、包配置与架构文档 | Token、Logo、状态组件、注册表、包边界 | 无 |
| F1 资产与目录映射 | `codex/customer-ui-v2-assets` | `apps/customer/public/assets/service-categories/**`、`apps/customer/src/assets/**` | 16 类图标拆分、Catalog 名称到图标映射 | F0 |
| M1 应用壳与主页 | `codex/customer-ui-v2-shell-home` | `apps/customer/src/app/**`、`routes/**`、`features/home/**`、`packages/customer-components/src/home/**` | C01-C04，启动、登录门、城市范围、主页 | F0、F1 |
| M2 服务发现 | `codex/customer-ui-v2-service` | `features/service/**`、`packages/customer-components/src/service/**` | C05-C08，分类、搜索、筛选、SKU 详情 | F0、F1 |
| M3 下单与支付 | `codex/customer-ui-v2-checkout` | `features/checkout/**`、`packages/customer-components/src/checkout/**`、`payment/**` | C09-C17，询价、地址、时间、优惠、下单、支付 | F0 |
| M4 订单与履约 | `codex/customer-ui-v2-orders` | `features/orders/**`、`packages/customer-components/src/order/**`、`fulfillment/**` | C18-C21，订单列表、详情、凭证、确认/异议 | F0 |
| M5 售后与评价 | `codex/customer-ui-v2-aftersale` | `features/aftersale/**`、`review/**`、对应组件目录 | C22-C30，变更、退款、投诉、评价、申诉 | F0 |
| M6 客服支持 | `codex/customer-ui-v2-support` | `features/support/**`、`packages/customer-components/src/support/**` | C31-C35，工单、会话、重开、满意度 | F0 |
| M7 通知与优惠券 | `codex/customer-ui-v2-engagement` | `features/notifications/**`、`coupons/**`、对应组件目录 | C36-C39，通知、归档、券包、适用条件 | F0 |
| M8 账户与地址 | `codex/customer-ui-v2-account` | `features/account/**`、`packages/customer-components/src/user/**` | C40-C42，资料、地址簿、会话退出 | F0 |
| I0 集成与设计 QA | `codex/customer-ui-v2-integration` | 中央 barrel、最终路由表、App 装配、E2E、截图与 QA 报告 | 合并全部模块、同视口验收 | F1、M1-M8 |

## 4. 工作树波次

仓库规则限制最多三个并行写入单元。施工顺序如下：

1. **Wave 0（串行）**：F0 基础设计系统。
2. **Wave 1（最多 3 棵）**：F1 资产、M1 应用壳与主页、M2 服务发现。
3. **Wave 2（最多 3 棵）**：M3 下单支付、M4 订单履约、M5 售后评价。
4. **Wave 3（最多 3 棵）**：M6 客服、M7 通知优惠券、M8 账户地址。
5. **Wave 4（串行）**：I0 集成、回归、运行时截图和设计 QA。

每个 Wave 从上一个已验证集成点创建，不从旧 Customer UI 分支摘取代码。

## 5. 冲突控制

- 只有 F0/I0 可以修改 workspace alias、包出口、`apps/customer/package.json` 和最终路由表。
- 各业务单元只写自己的 `features/<domain>` 与组件目录，不编辑其他域文件。
- 各业务单元提供本域 `index.ts`；顶层 barrel 统一由 I0 更新。
- 业务单元不得修改共享 API、类型、校验器、金额规则和状态机。
- 每个单元使用唯一测试文件名，不共同修改同一测试文件。

## 6. 完成标准

每个单元必须同时满足：真实契约数据边界、加载/空/错误/提交/成功状态、44px 触控目标、键盘焦点、窄屏适配、单元测试和类型检查。I0 只有在主页与源 PNG 同视口比对通过，且 P0/P1/P2 视觉问题清零后才能完成。
