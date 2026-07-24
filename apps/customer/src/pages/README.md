# Customer pages

旧顾客端页面切片已全部清除。

新设计开始前，不在此目录恢复旧页面、旧路由壳或旧视觉样式。新页面应基于重新确认的设计来源建立，并继续复用仓库共享 API、类型和校验契约。

顾客端正式采用 Hybrid SDUI：可组合页面由 Composition Runtime 生成受控组件树，交易页面使用固定安全模板。页面文件只做页面边界和装配，不得自行解释远端 JSON、直接请求 API，或用大型 JSX 固化主页布局。架构基线见 `docs/design/customer-v2/HYBRID_SDUI_ARCHITECTURE_BASELINE.md`。
