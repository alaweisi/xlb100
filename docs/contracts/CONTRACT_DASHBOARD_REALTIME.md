# Dashboard 实时运营快照契约

## 目的与边界

`GET /api/dashboard/realtime` 为总部运营大屏提供只读聚合快照。它不是订单、支付、派单、售后或客服的写入入口，不提供下钻到个人的能力，也不返回姓名、电话、服务地址、聊天/投诉正文或师傅精确位置。

- 身份：仅接受 `appType=dashboard` 且角色为 `admin`、`operator` 或 `auditor` 的访问令牌。
- 范围：默认全国；可传 `cityCode` 读取一个已存在的业务城市。
- 缓存：响应为 `private, no-store`。
- 契约版本：`snapshot.contractVersion = "1"`。

## 新鲜度

| 语义 | 阈值 | 页面行为 |
| --- | ---: | --- |
| 自动刷新 | 15 秒 | 页面可见时拉取下一份快照 |
| 实时 | `< 45 秒` | 绿色实时状态 |
| 已过期 | `>= 45 秒` | 保留最后可信快照，明确标记“数据刷新延迟” |
| 连接中断 | `>= 120 秒` 或浏览器离线 | 明确标记断线，不把旧数据表示成实时 |
| 数据源不可用 | 聚合事务失败 | API 返回 503；已有页面保留最后可信快照 |

所有六个事实源都以同一只读事务中的数据库时间为 `observedAt`。客户端依据该时间而非本机请求完成时间判断新鲜度。

## 指标字典

| 区域 | 指标 | 事实源与口径 |
| --- | --- | --- |
| 头部 | 今日订单 | `orders.created_at` 落在数据库当日 `[00:00, 次日 00:00)` 的数量 |
| 头部 | 已支付金额 | 当日 `payment_orders.status='paid'` 的 `amount` 合计 |
| 头部 | 支付成功率 | 当日已支付笔数 / 当日支付单总数；无支付单时为 `null` |
| 头部 | 履约中 | `fulfillments.status IN ('accepted','in_progress')` |
| 头部 | 待派单 | 派单任务处于待派、排队、报价、超时、重派、无匹配或人工复核状态 |
| 头部 | 今日完成 | 当日 `fulfillments.status='completed'` 的数量 |
| 脉搏图 | 新订单 / 已支付 / 履约完成 | 最近 60 分钟，按数据库时间对齐到 5 分钟桶 |
| 维修履约 | 待派、待接、服务中、今日完成、最长待派 | `dispatch_tasks` 与 `fulfillments` 的当前状态聚合 |
| 投诉返修 | 未分诊、处理中、紧急/重大、待返修 | `aftersale_complaints` 与 `aftersale_repair_orders` |
| 即时客服 | 排队会话、在线客服、最长等待、今日解决、SLA 超时 | `support_conversations`、`support_agents`、`support_tickets` |
| 城市健康度 | 今日订单、逾期、紧急投诉、排队会话 | 按 `cities.city_code` 汇总，不含个人维度 |

金额使用十进制字符串传输，避免 JavaScript 浮点数改变金额语义。

## 关注项与城市阈值

关注项只包含城市、数量、持续时间、摘要和责任团队：

- 存在紧急或重大未关闭投诉：`critical`。
- 存在客服 SLA 超时：`critical`。
- 最长待派时间达到 60 分钟：`warning`。
- 当日支付失败率达到 5%：`warning`；达到 10%：`critical`。
- 没有触发项时返回一条 `info` 级“当前无高优先级异常”。

城市健康度：

- `critical`：存在紧急投诉，或逾期数不少于 10。
- `warning`：存在逾期，或客服排队不少于 5。
- `healthy`：有业务数据且未触发以上阈值。
- `no_data`：订单、逾期、紧急投诉和排队会话均为 0。

## 隐私不变量

响应必须始终满足：

```json
{
  "containsPersonalData": false,
  "exactWorkerLocationIncluded": false,
  "messageContentIncluded": false
}
```

API 客户端会对以上三个值做强校验，任何扩大数据边界的响应都会被拒绝。
