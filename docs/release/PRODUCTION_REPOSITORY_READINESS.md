# 生产仓库准备能力

日期：2026-07-16

本文件只证明仓库内可完成的生产准备，不代表真实生产环境已开通，也不授权 deploy、push、真实 Provider 或公开发布。

已完成：

- 生产 Compose 只接受不可变 `sha256` 镜像摘要，移除本地 build 和 placeholder 默认镜像。
- 部署脚本先拉取和校验镜像，再以 `--no-build` 启动；回滚同样要求不可变摘要。
- MySQL、Redis、JWT、手机号哈希和 OTP 密钥支持 `_FILE` 注入；生产模式强制 MySQL/Redis TLS、强密码、非本地资源地址和 Redis 限流。
- 容器使用非 root 用户、只读文件系统、移除 Linux capabilities、`no-new-privileges`、资源限额和日志轮转。
- 生产 smoke 校验后端 JSON、MySQL/Redis、数据可靠性、Jobs 心跳和三端 HTML，不再只判断 HTTP 小于 400。
- 提供 TLS/Ingress 模板、Prometheus 抓取配置、生产告警规则、Alertmanager 路由模板和 Grafana Dashboard。
- 提供只读 release-window 数据门禁，只运行 replay/immutability，强制完整 commit、干净工作区、安静窗口确认和独立授权，避免用会写测试数据的全量 preflight 触碰生产库。
- `pnpm check:production-repository-readiness` 会静态检查上述控制，并用临时密钥文件执行一次真实 `docker compose config`。

仍需外部完成：Secret Manager 实例及真实值、DNS/证书、托管 MySQL/Redis、备份策略落地、监控平台部署、告警接收人和 release-window 证据。因此 `OPS-001` 至 `OPS-003` 继续保持 `NOT_RUN`，生产发布继续 `NO_GO`。
