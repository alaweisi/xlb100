# Customer UI V2 总施工计划

> 正式架构基线：[`HYBRID_SDUI_ARCHITECTURE_BASELINE.md`](./HYBRID_SDUI_ARCHITECTURE_BASELINE.md)
>
> 本计划分为“平台建设”和“业务切片建设”两个里程碑。平台没有通过 P10 前，不进入大规模业务页面施工。

## 1. 唯一范围

- 仅重建 `apps/customer` 顾客端。
- 不修改 Worker、Admin、OA、Dashboard 的页面与视觉体系。
- API、SKU Catalog、订单状态机、金额与权限事实保持不变。
- 主页参考图是顾客端视觉唯一真相；16 类服务图标图是类目图标唯一视觉资产源。
- 正式类目名称、顺序和 SKU 只来自 `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md` 与 API。
- 不引入 `sdj99` 包名、文件名、运行时标识或业务文案。

## 2. 正式架构

```text
Published Manifest + Theme/Asset Envelope
  -> Delivery / Validation / Cache / Fallback
    -> Composition Engine / Component Registry / Action Registry
      -> Data Coordinator / Existing Business APIs
        -> Customer Design System / Business Components
          -> Hybrid Page Templates / Route Slices
```

顾客端采用商业级 Hybrid SDUI：主页、推荐和运营展示采用受控服务端编排；下单、支付、退款、售后、投诉、账户等关键流程采用固定安全模板。页面只负责组合与路由装配；数据请求、契约适配和交互状态放在 Feature/Platform 层；业务组件不得直接发起 API 请求。

## 3. 里程碑 A：Hybrid SDUI 平台十步工程

| 步骤 | 分支 | 施工目标 | 硬依赖 | 风险级别 |
| --- | --- | --- | --- | --- |
| P1 架构重新定基线 | `codex/customer-ui-v2-sdui-baseline` | 架构定义、Hybrid 边界、分层、责任、门禁 | F0 | 普通 |
| P2 SDUI 共享契约 | `codex/customer-ui-v2-sdui-contract` | `packages/types` 与 `packages/validators` 唯一契约 | P1 | 普通；不得做破坏性共享契约变更 |
| P3 前端组合运行时 | `codex/customer-ui-v2-sdui-runtime` | Engine、Registry、Renderer、Action 白名单 | P2 | 普通 |
| P4 Manifest 交付与容灾 | `codex/customer-ui-v2-sdui-delivery` | 加载、缓存、LKG、内置回退、kill switch | P2、P3接口 | 普通 |
| P5 数据与动作协调 | `codex/customer-ui-v2-sdui-data` | 数据键、ViewModel、请求治理、动作协调 | P2 | 普通 |
| P6 服务端运营控制面 | `codex/customer-ui-v2-sdui-control-plane` | 解析、发布、审核、灰度、下架、回滚 | P2 | **高风险：写入前确认** |
| P7 主题品牌资产运行时 | `codex/customer-ui-v2-sdui-presentation` | Token、Logo、资产的安全动态呈现 | P2 | 普通 |
| P8 动态主页垂直落地 | `codex/customer-ui-v2-sdui-home` | 主页 PNG 视觉与真实 SDUI 闭环 | P3—P7、B0 | 普通 |
| P9 完整可观测性 | `codex/customer-ui-v2-sdui-observability` | 版本、组件、数据、动作、性能观测 | P2；完整接入依赖P3—P8 | 普通 |
| P10 集成故障演练验收 | `codex/customer-ui-v2-sdui-integration` | 集成、降级、回滚、性能、安全、视觉验收 | P1—P9 | Phase 最终验收 |

### 3.1 平台施工波次

1. **Platform Wave 0（串行）**：P1 → P2。
2. **Platform Wave 1（最多3棵）**：P3、P5、P7。
3. **Platform Wave 2（最多3棵）**：P4、P6、P9基础设施；P6 开始写入前单独取得高风险确认。
4. **Platform Wave 3（串行汇合）**：P8。
5. **Platform Wave 4（串行）**：P9完整接入 → P10。

P1、P2不得并行。P3—P7没有形成集成点前，不得将静态主页标记为P8完成。P10没有通过，不得宣称商业级 Hybrid SDUI 平台完成。

## 4. 里程碑 B：顾客端业务切片建设

42 个业务切片组合为 8 个后续业务模块和 1 个集成单元。主页编排垂直切片由 P8 建立；应用壳、入口和城市/会话装配在 B1 延续。不能把 42 个切片机械拆成 42 个工作树。

| 单元 | 分支 | 独占目录/文件 | 业务范围 | 前置 |
| --- | --- | --- | --- | --- |
| F0 基础设计系统（已完成） | `codex/customer-ui-v2-foundation` | `packages/customer-components/src/foundation/**`、`common/**`、`tokens/**` | Token、Logo、状态组件、通用注册表、包边界 | 无 |
| B0 资产与目录映射 | `codex/customer-ui-v2-assets` | 服务类目资产与 Catalog 映射 | 16 类图标拆分与正式 Catalog 映射；并入 P8 前验收 | F0、P2 |
| B1 应用壳与顾客入口 | `codex/customer-ui-v2-shell-entry` | `apps/customer/src/app/**`、`routes/**`、入口 Feature | C01-C03，启动、登录门、城市范围；接入 P8 主页 | P10 |
| B2 服务发现 | `codex/customer-ui-v2-service` | `features/service/**`、Customer service 组件 | C05-C08，分类、搜索、筛选、SKU 详情 | P10、B0 |
| B3 下单与支付 | `codex/customer-ui-v2-checkout` | checkout/payment Feature 与组件 | C09-C17，询价、地址、时间、优惠、下单、支付 | P10 |
| B4 订单与履约 | `codex/customer-ui-v2-orders` | orders/fulfillment Feature 与组件 | C18-C21，订单列表、详情、凭证、确认/异议 | P10 |
| B5 售后与评价 | `codex/customer-ui-v2-aftersale` | aftersale/review Feature 与组件 | C22-C30，变更、退款、投诉、评价、申诉 | P10 |
| B6 客服支持 | `codex/customer-ui-v2-support` | support Feature 与组件 | C31-C35，工单、会话、重开、满意度 | P10 |
| B7 通知与优惠券 | `codex/customer-ui-v2-engagement` | notifications/coupons Feature 与组件 | C36-C39，通知、归档、券包、适用条件 | P10 |
| B8 账户与地址 | `codex/customer-ui-v2-account` | account Feature 与 user 组件 | C40-C42，资料、地址簿、会话退出 | P10 |
| BI 集成与设计 QA | `codex/customer-ui-v2-app-integration` | 最终路由、App装配、E2E、截图与QA | 全业务切片集成 | B0—B8 |

## 5. 业务施工波次

仓库规则限制最多三个并行写入单元。施工顺序如下：

1. **Business Wave 0**：B0 在 P8 前按平台计划汇合。
2. **Business Wave 1（最多3棵）**：B1 应用壳入口、B2 服务发现、B3 下单支付。
3. **Business Wave 2（最多3棵）**：B4 订单履约、B5 售后评价、B6 客服。
4. **Business Wave 3（最多2棵）**：B7 通知优惠券、B8 账户地址。
5. **Business Wave 4（串行）**：BI 全业务集成、回归、运行时截图和设计 QA。

每个 Wave 从上一个已验证集成点创建，不从旧 Customer UI 分支摘取代码。

## 6. 冲突控制

- 平台中央契约只由 P2 修改；P3—P9 不得各自复制或发明 Manifest 契约。
- 只有平台集成与 BI 可以修改最终路由表和全局 App 装配。
- 各业务单元只写自己的 `features/<domain>` 与组件目录，不编辑其他域文件。
- 各业务单元提供本域 `index.ts`；顶层 barrel 统一由 BI 更新。
- 业务单元不得修改共享 API、类型、校验器、金额规则和状态机。
- 每个单元使用唯一测试文件名，不共同修改同一测试文件。

## 7. 完成标准

平台完成以 P10 为唯一判定点，必须满足真实发布闭环、三层回退、热插拔白名单、动态主题/Logo、观测、故障演练、相关测试和主页同视口视觉验收。

每个业务单元必须同时满足：真实契约数据边界、加载/空/错误/提交/成功状态、44px 触控目标、键盘焦点、窄屏适配、单元测试和类型检查。BI 只有在全部切片集成、关键业务 E2E、同视口截图与 P0/P1/P2 视觉问题清零后才能完成。
