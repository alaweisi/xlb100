# OA 专用认证与总部授权契约

## 身份与会话

- OTP 申请：`POST /api/auth/oa/code`。
- 登录：`POST /api/auth/oa/login`。
- 非生产调试码：`GET /api/auth/oa/debug-code`，生产环境不注册。
- OTP 使用独立 `oa` 命名空间；Admin OTP 不得用于 OA 登录，OA OTP 也不得用于 Admin 登录。
- 成功令牌固定为 `appType=oa`、`role=admin`，OA 不接受 `operator` 或 `auditor` 令牌。
- 浏览器存储使用 `xlb.oa.*`，不得读取或覆盖 `xlb.admin.*` 会话。

## 总部范围门禁

OA 登录主体必须同时满足：

1. 存在于 `admin_users`；
2. `role='admin'`；
3. `admin_city_scopes` 存在 `city_code='__global__'`。

不满足任一条件均返回同一未授权结果，不签发 OTP 或 OA 令牌。

`__global__` 仅是身份范围标记，不是业务城市。OA 每个业务请求仍必须发送有效的 `x-xlb-city-code`，查询和写入继续使用真实城市过滤。缺少城市返回 400；不得新增全国无条件查询。

## 能力关系

- Admin 保持原有 `admin/operator/auditor` 角色矩阵和城市范围。
- OA 总部管理员可以进入 Admin 已存在的读取、运营、审核和治理能力，包括原本限制为 operator 的工作台。
- OA 不得绕过业务状态机、幂等、版本冲突、确认、审计、资金和 Provider 边界。
- Dashboard 令牌不具备 OA 或 Admin 操作能力。

## 本地演示身份

`db/seed/013_oa_headquarters_admin.seed.sql` 仅创建本地/测试账号 `oa_global`。正式环境必须通过受审计的身份配置流程创建账号和 `__global__` 范围，不得依赖演示 seed。
