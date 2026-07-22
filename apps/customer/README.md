# @xlb/customer

顾客端应用已清除旧 UI 切片，当前仅保留可编译启动入口、业务适配器和共享契约依赖，等待新设计重新建立页面、路由与视觉系统。

## 正式前端架构

顾客端必须按照商业级 Hybrid SDUI 可组合前端平台架构建设，不是固定页面，不是 Demo。主页、推荐和运营展示采用服务端编排；下单、支付、退款、售后、投诉和账户等关键流程采用固定安全模板。

架构定义、动态与固定边界、十步工程和完成门槛见：

- [`docs/design/customer-v2/HYBRID_SDUI_ARCHITECTURE_BASELINE.md`](../../docs/design/customer-v2/HYBRID_SDUI_ARCHITECTURE_BASELINE.md)
- [`docs/design/customer-v2/CONSTRUCTION_PLAN.md`](../../docs/design/customer-v2/CONSTRUCTION_PLAN.md)

## 当前边界

- src/app/App.tsx 是无旧设计依赖的最小根节点。
- src/pages/ 不保留旧页面实现。
- src/adapters/ 与 src/features/ 保留非视觉业务映射，后续可按新设计复用或替换。
- 新页面必须继续通过 @xlb/api-client、@xlb/types 和共享校验契约接入业务能力。
- 第2工程共享 Manifest 契约完成前，不得直接建立固定主页或在页面内部堆叠主页业务 JSX。
