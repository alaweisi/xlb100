# deploy — 喜乐帮 / XLB

本地 / Staging / Production 部署脚本与 compose。

Production Compose 现在包含一个 Nginx gateway：

- `customer.<domain>`、`worker.<domain>`、`admin.<domain>` 使用同源 `/api/`；
- 四个入口都为 `/api/support/realtime` 提供精确 WebSocket Upgrade；
- TLS 证书和私钥只通过 Compose secret 文件挂载；
- gateway 与全部应用镜像都必须使用不可变 registry digest；
- `/metrics` 不经过公网 gateway，监控在私有网络直接抓取 backend。

仓库级验证命令为 `pnpm gate:unit-b-production-edge`。它运行静态边界测试、
以非 root 只读 Nginx 容器执行真实 `nginx -t`、验证生产 Smoke dry-run，
并展开 Production Compose。该 Gate 不执行生产部署。

当前运行方式以 Docker Compose 为基线。未来从 Lighthouse Docker Compose 迁移到腾讯云 TKE 的拟议目录、施工阶段、验收和回滚要求见：

- `docs/operations/TKE_MIGRATION_PLAN.md`
- `docs/operations/TKE_DELIVERY_LINE_BLUEPRINT.md`

该方案文档不表示 TKE、Helm Chart 或任何腾讯云资源已经创建。
