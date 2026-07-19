# Dashboard 总部只读实时契约

## 身份与会话

- OTP 申请：`POST /api/auth/dashboard/code`。
- 登录：`POST /api/auth/dashboard/login`。
- 非生产调试码：`GET /api/auth/dashboard/debug-code`，生产环境不注册。
- 只接受拥有 `__global__` 总部范围的 `admin` 身份。
- 成功令牌固定为 `appType=dashboard`、`role=admin`，浏览器仅保存于 `xlb.dashboard.*`。
- Dashboard 不读取、复用或转发 `xlb.oa.*`、`xlb.admin.*` 会话。

## 运营数据

`GET /api/internal/dashboard/operations` 只接受 Dashboard 令牌，响应来自 MySQL 只读聚合：

- 今日订单、进行中订单、今日完成；
- 待派单任务；
- 未解决客服工单；
- 未结案售后投诉；
- 同一指标的城市级分布、服务端生成时间和建议刷新周期。

接口不返回客户、师傅、地址、电话、订单详情或任何可识别个人的信息。

## 不可突破边界

- Dashboard 不提供 POST、PUT、PATCH、DELETE 业务接口。
- Dashboard 令牌不能访问 Admin 或 OA 的业务操作接口。
- OA、Admin 令牌也不能访问 Dashboard 专用聚合接口。
- 页面必须显示 loading、partial、stale、disconnected 和认证失效状态；断流时不得继续标记为实时。
- 所有指标以服务端响应为准，禁止静态数字、随机数或本地推算冒充运营事实。
