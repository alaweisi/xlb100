# deploy — 喜乐帮 / XLB

本地 / Staging / Production 部署脚本与 compose。

当前运行方式以 Docker Compose 为基线。未来从 Lighthouse Docker Compose 迁移到腾讯云 TKE 的拟议目录、施工阶段、验收和回滚要求见：

- `docs/operations/TKE_MIGRATION_PLAN.md`
- `docs/operations/TKE_DELIVERY_LINE_BLUEPRINT.md`

## OA production preparation

- Apply migrations `063_oa_collaboration_foundation.sql` and `064_oa_notifications.sql`.
- Run `pnpm oa:bootstrap` with the explicit `OA_BOOTSTRAP_CONFIRM` guard to create the real headquarters, branch, city, and administrator bindings.
- Never apply `db/seed/013_oa_collaboration_demo.seed.sql` in production.
- The external ingress must route `/oa/` to the OA frontend and `/api/oa/` plus `/api/auth/oa/` to the backend.
- The current TKE release line does not yet package or publish the OA workload; TKE enablement requires a separately reviewed release-contract change.

该方案文档不表示 TKE、Helm Chart 或任何腾讯云资源已经创建。
