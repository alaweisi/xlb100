# Customer routes

## B0 ownership boundary

Feature windows publish route metadata through
`platform/slices/CustomerFeatureRouteModule.ts`. They do not modify
`app/App.tsx` or assemble the final route tree.

The integration window owns final App route assembly, cross-feature route
collision checks and the safe not-found route. BI now assembles and seals
15 combined feature modules, 20 templates and 26 published route patterns.
Feature modules may own only
declared directories below `apps/customer/src/features/**`; `app/**`,
`routes/**`, `platform/**` and shared packages are never feature-owned.

The browser runtime matches only those bundled patterns, evaluates each
slice's guard plan, and dynamically loads only its already-published module.
Path/query input and navigation events cannot create code or template entries.

路由负责选择页面模式和装配上下文：可组合展示页面进入 SDUI 组合入口，订单、支付、退款、售后、投诉和账户等关键流程进入固定安全模板。路由不得根据运营 Manifest 动态创建任意代码入口。
