# 顾客端 Edge 全路由视觉验收

- 浏览器：Microsoft Edge
- 手机画面：390×844
- Carrier：10 个（C-00 至 C-09）
- 手机截图：21 张（20 个正常/高风险场景，另含 1 张师傅展示区专项图）
- 宽屏防退化检查：9 条正式业务路由
- 结果：通过

## 截图索引

- C-00 登录门：`C-00-auth-loading-390x844.png`、`C-00-auth-error-390x844.png`
- C-01 主页：`C-01-home-ready-390x844.png`、`C-01-home-empty-390x844.png`
- C-02 服务目录：`C-02-services-ready-390x844.png`、`C-02-services-error-390x844.png`
- C-03 预约下单：`C-03-order-create-ready-390x844.png`、`C-03-order-create-quote-error-390x844.png`
- C-04 我的订单：`C-04-orders-ready-390x844.png`、`C-04-orders-empty-390x844.png`
- C-05 售后服务：`C-05-aftersale-ready-390x844.png`、`C-05-aftersale-error-390x844.png`
- C-06 客服中心：`C-06-support-ready-390x844.png`、`C-06-support-error-390x844.png`
- C-07 消息中心：`C-07-notifications-ready-390x844.png`、`C-07-notifications-error-390x844.png`
- C-08 我的优惠券：`C-08-coupons-ready-390x844.png`、`C-08-coupons-error-390x844.png`
- C-09 我的：`C-09-profile-ready-390x844.png`、`C-09-profile-error-390x844.png`

## 对照证据

- 锁定主页母版与 Edge 实现：`C-01-home-locked-reference-vs-implementation.png`
- 全 Carrier 正常状态总览：`customer-all-carriers-after-iteration-1.png`
- 全 Carrier 高风险状态总览：`customer-high-risk-states-after-iteration-1.png`
- 下单页宽屏仍保持 App 壳：`P0-order-create-wide-shell-1440x900.png`
- 机器可读门禁报告：`qa-report.json`
