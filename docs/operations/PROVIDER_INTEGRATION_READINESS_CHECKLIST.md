# XLB Provider 接入准备与模拟验证清单

状态：**READINESS ONLY / NO EXTERNAL EXECUTION**

范围：Payment、SMS、Object Storage、Geo、Enterprise Webhook；NLU 继续保持 deterministic/mock。

本清单不构成真实 Provider、生产发布或外部操作授权。

## 当前完成事实

- [x] Provider 模式由闭集配置解析，未知或真实模式启动失败。
- [x] `XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED` 只能为 `false`。
- [x] Payment 仅 `mock`，具备准备、正常回调、重复回调、乱序回调和无效签名模型。
- [x] SMS 仅 `mock`，OTP 不写入 envelope，接收方只保留脱敏值。
- [x] Object Storage 仅 `local|mock`，保持私有 URI、无 public URL。
- [x] Geo 仅 `local_mock`，使用本地确定性地理编码和 Haversine 路由。
- [x] Enterprise HTTPS Webhook 只返回 blocked envelope，不执行网络请求。
- [x] 统一模拟 timeout、transient failure、permanent failure 和 rate limit。
- [x] 所有本地/模拟 envelope 必须保持 `externalProviderExecuted=false`。

## 明确阻塞项

- `REAL_PROVIDER_BLOCKED`：没有真实 Payment、SMS、OSS、Geo 或 Webhook Provider。
- `PRODUCTION_CREDENTIALS_BLOCKED`：没有生产密钥、商户号、签名证书或 Secret Manager 绑定。
- `LEGAL_ENTITY_BLOCKED`：公司主体和对应 Provider 商业账户尚未具备。
- `ICP_FILING_BLOCKED`：ICP/应用发布所需备案与材料尚未完成。
- `PRODUCTION_ACTIVATION_BLOCKED`：没有生产激活、push、deploy、真实数据或外部调用授权。

上述任意一项未关闭时，不得把 Mock、Local、Sandbox 或 blocked envelope 计为真实送达、真实支付、真实存储或生产就绪。

## 当前配置闭集

| 变量 | 允许值 | 默认值 |
|---|---|---|
| `XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED` | `false` | `false` |
| `XLB_PAYMENT_PROVIDER` | `mock` | `mock` |
| `XLB_SMS_PROVIDER` | `mock` | `mock` |
| `XLB_OBJECT_STORAGE_PROVIDER` | `local`, `mock` | `local` |
| `XLB_GEO_PROVIDER` | `local_mock` | `local_mock` |
| `XLB_ENTERPRISE_WEBHOOK_PROVIDER` | `mock_only` | `mock_only` |

## 未来真实接入的独立入口条件

真实 Provider 接入必须作为单独施工批次重新确认，并至少完成：

1. 确认公司主体、商户/供应商账户、备案和合同责任人。
2. 冻结 Provider 官方 API 版本、SDK/HTTP 契约、数据驻留和隐私范围。
3. 通过 Secret Manager 注入凭据；禁止凭据进入 Git、镜像、日志或测试快照。
4. 为签名、验签、重放、超时、限流、幂等、对账和补偿建立契约测试。
5. 在 Sandbox 验证，不复用生产凭据或生产回调地址。
6. 完成 SSRF/DNS rebinding、证书、回调来源和响应脱敏安全审查。
7. 完成监控、费用配额、告警、降级、Runbook 和回滚演练。
8. 再次取得真实 Provider 和生产操作的明确 Human 授权。

## 验证命令

```powershell
pnpm check:provider-readiness
pnpm test:provider-readiness
pnpm --filter @xlb/config build
pnpm --filter @xlb/backend typecheck
```
