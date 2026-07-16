# TKE 应用就绪施工说明

本文件描述 `codex/tke-app-readiness` 的交付边界。该分支只准备应用层能力，不创建 TKE、COS、负载均衡或数据库资源，也不会发起真实腾讯云请求。

## 已完成的应用契约

| 能力 | 地址或实现 | TKE 用途 |
| --- | --- | --- |
| 存活探针 | `GET /health/live` | 仅判断后端进程能否服务；不依赖 MySQL/Redis，适合作为 `livenessProbe` |
| 就绪探针 | `GET /health/ready` | 检查 MySQL 和 Redis；依赖不可用时返回 HTTP 503，适合作为 `readinessProbe` |
| 旧健康接口 | `GET /health`、`GET /api/system/db-health` | 保留兼容，不要求现有 Docker Compose 立即切换 |
| COS 配置加载 | `loadCosObjectStorageConfig` | 从 Secret 挂载文件读取凭据，拒绝用明文环境变量代替 |
| COS 客户端适配 | `TencentCosObjectStorageAdapter` | 支持上传、下载和删除；默认私有 ACL；可注入假客户端做离线测试 |

## TKE 需要注入的配置

非敏感配置可由 ConfigMap 提供：

- `XLB_COS_BUCKET`：完整 Bucket 名，包含 APPID 后缀；
- `XLB_COS_REGION`：例如 `ap-guangzhou`；
- `XLB_COS_TIMEOUT_MS`：可选，默认 10000，允许 1000—60000。

敏感值必须以只读文件挂载，再传文件路径：

- `XLB_COS_SECRET_ID_FILE`；
- `XLB_COS_SECRET_KEY_FILE`。

应用不得把凭据、COS 请求 URL 或原始 SDK 错误对象写入日志。当前适配器只向上返回清洗后的错误码、HTTP 状态码和 RequestId。

## COS 双开关与持久化契约

增量 migration `059_tke_cos_object_storage` 在不改写 035 的前提下扩展了持久化约束。现有 `local|mock` 行继续有效；COS 行必须同时满足 `tencent-cos`、`stored_cos`、`external_provider_executed=1`、私有 `cos://` URI 和 `public_url IS NULL`。

COS factory 只有在以下两个配置同时存在时才会启动：

- `XLB_OBJECT_STORAGE_PROVIDER=cos`；
- `XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true`。

只打开其中一个会启动失败。Docker Compose 默认继续使用 `local` 且外部执行关闭。TKE staging/production values 显式使用双开关，但占位仓库、digest、域名和 Bucket 仍必须由后续部署门禁拒绝。

本地和 CI 验收只使用注入式假 COS 客户端，不允许真实腾讯云请求。测试 Bucket 冒烟仍需单独的外部 Provider 操作授权。
