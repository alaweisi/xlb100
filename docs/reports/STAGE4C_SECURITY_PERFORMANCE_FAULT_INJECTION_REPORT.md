# Stage 4C 认证、限流、基础压测与故障注入框架

## 范围

本阶段只建立本地和预生产模拟验证能力：

- 认证、App/Role、城市授权矩阵；
- 限流精确配额、后端故障 fail-closed 与恢复；
- API Edge JWT/RequestContext/AuthZ 基础负载基线；
- MySQL、Redis、Provider 的确定性测试故障模型。

不接入真实 Provider，不执行生产部署，不开放故障注入 HTTP 端点，也不改变支付、金额、账本或结算语义。

## 实现

- `tests/helpers/stage4cFaultInjection.ts`：按调用次数注入 error、timeout、latency；仅由测试显式包装操作，不修改全局运行时。
- `tests/helpers/stage4cLoadHarness.ts`：有界并发、单请求耗时、p50/p95、吞吐和失败计数。
- `tests/security/auth/stage4cAuthRateLimit.test.ts`：App/Role 正反矩阵、管理员城市边界、Token 身份优先级、Redis 限流故障和并发配额。
- `tests/performance/stage4cSecurityLoad.test.ts`：本地 Fastify inject 的认证边缘负载基线，不开放网络端口。
- `pnpm gate:stage4c`：集中执行相关回归、Stage 4C 测试和后端类型检查。

## 安全边界

- 故障计划没有生产注册入口，也不会读取真实密钥或连接真实 Provider。
- Provider 场景只允许返回 `externalProviderExecuted: false` 的模拟事实。
- 限流后端不可用时返回 503，不允许失效后放行敏感请求。
- 本阶段性能数字是本机模拟基线，不代表公网、生产数据库或真实 Provider 容量。

## 后续

阶段 3 的各 Provider Adapter 完成后，应使用相同故障计划补充 Provider-specific contract tests；阶段 4D 再在不可变候选和隔离环境中进行统一 E2E、恢复和验收。
