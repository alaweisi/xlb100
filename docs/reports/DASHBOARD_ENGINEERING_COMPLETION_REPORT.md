# XLB Dashboard 工程竣工报告

日期：2026-07-26
结论：**本地工程竣工，可构建、可运行、可通过真实本地数据链路读取全国及城市聚合快照。**

## 已交付

- 方案 1 的 1920×1080 深色全国实时运营大屏。
- 六个核心 KPI：今日订单、已支付金额、支付成功率、履约中、待派单、今日完成。
- 最近 60 分钟、5 分钟粒度的订单/支付/履约脉搏。
- 维修履约、投诉返修、即时客服、城市健康度四个业务区。
- 按严重性展示的处置关注项和责任团队。
- Orders、Payments、Dispatch、Fulfillment、Aftersale、Support 六个现有事实源的只读聚合。
- 全国与单城市读取范围。
- Dashboard 独立 OTP 登录、独立 `appType=dashboard` 令牌和角色边界。
- 15 秒刷新、45 秒过期、120 秒断线，以及最后可信快照降级。
- 无姓名、电话、地址、消息正文、投诉正文和精确位置的隐私边界。
- API 客户端响应校验、单元/契约测试、浏览器 E2E、视觉对照和 Docker 镜像构建。

## 关键证据

| 检查项 | 结果 |
| --- | --- |
| `@xlb/types` 类型检查 | 通过 |
| `@xlb/api-client` 类型检查 | 通过 |
| `@xlb/backend` 生产编译 | 通过 |
| `@xlb/dashboard` 类型检查、生产构建、ESLint | 通过 |
| Dashboard 单元/契约测试 | 8/8 通过 |
| Dashboard 浏览器 E2E | 2/2 通过 |
| 1920×1080 浏览器尺寸 | 页面与视口均为 1920×1080，无溢出 |
| 浏览器控制台/页面错误 | 0 |
| Docker 镜像 | `xlb-dashboard:local` 构建成功 |
| Docker 静态站点冒烟 | `/dashboard/` 返回 200，标题与根节点正确 |
| 真实本地鉴权链路 | OTP 签发、Dashboard 登录、Dashboard 令牌均通过 |
| 真实本地全国聚合 | 契约 v1、6 个数据源、隐私不变量通过 |
| 真实本地城市聚合 | `hangzhou / 杭州` 范围通过 |
| 视觉 QA | `apps/dashboard/design-qa.md`，`final result: passed` |

## 数据与告警设计依据

- 支付成功/失败和争议类交易指标参考 Stripe 支付分析。
- 工单生命周期、派单、到场/解决 SLA 和服务时长参考 Microsoft Dynamics 365 Field Service。
- 排队会话、最长等待、在线客服、放弃/解决和 SLA 参考 Amazon Connect 与 Zendesk 实时运营指标。
- 可行动异常和延迟/错误/饱和度思路参考 Google SRE 的监控原则。

外部依据：

- <https://docs.stripe.com/payments/analytics>
- <https://learn.microsoft.com/en-us/dynamics365/field-service/overview>
- <https://learn.microsoft.com/en-us/dynamics365/field-service/sla-work-orders>
- <https://docs.aws.amazon.com/connect/latest/adminguide/metrics-definitions.html>
- <https://docs.aws.amazon.com/connect/latest/adminguide/real-time-metrics-reports.html>
- <https://support.zendesk.com/hc/en-us/articles/9757103190810-Using-the-incoming-tickets-real-time-dashboard>
- <https://sre.google/sre-book/monitoring-distributed-systems/>

## 竣工边界

- 本次没有执行 push、deploy、tag、生产数据、真实短信 Provider 或公开发布。
- `infra/docker/Dockerfile.frontend` 已可用 `APP_NAME=dashboard`、`APP_BASE=/dashboard/` 构建镜像。
- 仓库中原有移动端未跟踪目录未被修改或纳入本次交付。
- 生产发布仍属于独立外部操作；只有在获得发布授权并配置域名、证书、镜像仓库和真实 Provider 后才能执行。

## 非阻塞后续

- 若新增权威历史聚合，可补充同比/环比，而不使用合成数据。
- 若新增经过隐私审查的地理聚合，可补充城市地图；当前明确不展示师傅精确位置。
