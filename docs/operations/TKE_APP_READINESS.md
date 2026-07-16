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

## 当前不能打开的开关

本分支故意不允许 `XLB_OBJECT_STORAGE_PROVIDER=cos`，也不把 COS 适配器接入现有工厂。原因不是代码未写，而是现有持久化契约仍硬性限制为：

- provider 只能是 `local` 或 `mock`；
- status 只能是 `stored_local` 或 `stored_mock`；
- `external_provider_executed` 必须为 0；
- storage URI 只能使用 `xlb-local://` 或 `xlb-mock://`。

直接打开 COS 会造成数据库写入失败或证据链语义不一致。

## 后续施工节点：`codex/tke-cos-schema`

该节点属于数据库/共享契约高风险工程，应单独确认、单独验收，至少包括：

1. 新增不可改写旧 migration 的增量 migration，扩展 provider、status、执行标记和 URI 约束；
2. 扩展 `packages/types`、`packages/validators` 与 repository 行类型；
3. 将 COS 适配器接入工厂，并设置显式的双重生产开关；
4. 验证 local/mock 历史数据兼容、COS 写入、失败重试、回滚和审计字段；
5. 在获得真实 Provider 操作授权后，才执行测试 Bucket 冒烟验证。

完成该节点之前，Docker Compose 继续使用 `local/mock`，TKE 清单也必须保持 COS Provider 开关关闭。
