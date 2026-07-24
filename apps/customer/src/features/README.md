# Customer features

顾客端按业务域组织 Feature。Feature 负责 API 调用、共享契约适配、状态和交互编排；不得在此重复定义后端请求/响应类型。

各工作树只写自己的域目录：`home`、`service`、`checkout`、`orders`、`aftersale`、`review`、`support`、`notifications`、`coupons`、`account`。

页面与路由只组合 Feature 和 `@xlb/customer-components`，业务组件本身不得直接调用 API。
