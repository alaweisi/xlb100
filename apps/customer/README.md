# @xlb/customer

顾客端应用已清除旧 UI 切片，当前仅保留可编译启动入口、业务适配器和共享契约依赖，等待新设计重新建立页面、路由与视觉系统。

## 当前边界

- src/app/App.tsx 是无旧设计依赖的最小根节点。
- src/pages/ 不保留旧页面实现。
- src/adapters/ 与 src/features/ 保留非视觉业务映射，后续可按新设计复用或替换。
- 新页面必须继续通过 @xlb/api-client、@xlb/types 和共享校验契约接入业务能力。
