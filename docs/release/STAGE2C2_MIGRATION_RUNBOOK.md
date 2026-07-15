# Stage 2C-2 Migration Runbook

适用范围：本地与 Staging。本文不授权生产迁移、部署、数据删除或回滚 DDL。

## 唯一执行入口

所有环境都必须调用 backend canonical migration CLI；PowerShell 包装脚本只设置/校验环境变量并传递退出码，不自行发现 SQL、查询 marker 或执行逐文件迁移。

```powershell
# 本地 Docker MySQL；脚本固定使用 compose local 的连接参数
pnpm db:migrate:local

# Staging；五个 MYSQL_* 值必须来自受控密钥注入
$env:NODE_ENV = "staging"
$env:MYSQL_HOST = "127.0.0.1"
$env:MYSQL_PORT = "3307"
$env:MYSQL_DATABASE = "xlb_staging"
$env:MYSQL_USER = "xlb_migration"
$env:MYSQL_PASSWORD = "<secret-manager-value>"
pnpm db:migrate:staging
```

`migrate-staging.ps1` 不读取 `.env.staging.example`，不接受 `change-me` 等示例密码，不将查询或连接失败解释为“未应用”。canonical CLI 返回非零退出码时，包装脚本立即 stop。

## Migration user 与最小权限

Staging 使用独立 migration user，运行时 backend 用户不得拥有 DDL 权限。DBA 仅对目标 schema 授予当前迁移集合实际需要的权限：

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
ON xlb_staging.* TO 'xlb_migration'@'<approved-host>';
```

- 不授予 `CREATE USER`、`GRANT OPTION`、全局 `*.*` 或其他 schema 权限。
- 凭据只从 Secret Manager/受控 CI 注入，不写入仓库、命令历史或证据文档。
- 迁移完成后撤销或禁用临时凭据；应用进程继续使用独立 runtime user。
- 若未来 migration 新增当前授权以外的语句，先由 DBA 审查并按需增加最小权限，不扩大为管理员权限。

## 执行前校验

1. 确认备份、恢复点、目标 host/port/database 与变更窗口。
2. 保证部署编排中只有一个 migration job；不要从两台主机或两个流水线并行启动。
3. 在候选 commit 上验证已发布 SQL 没有被改写、版本号没有重复：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-migration-integrity.ps1 -DiffMode Range
```

4. 留存候选 SQL checksum 和迁移前版本（输出须脱敏）：

```powershell
Get-ChildItem db/migrations -Filter *.sql |
  Sort-Object Name |
  Get-FileHash -Algorithm SHA256 |
  Select-Object @{Name="version";Expression={$_.Path | Split-Path -Leaf}}, Hash
```

```sql
SELECT version, applied_at
FROM schema_migrations
ORDER BY version;
```

旧数据库首次使用新版 canonical CLI 前，`checksum_sha256` 可能尚不存在，因此执行前不要把该列作为兼容性前提；仓库文件 checksum 是执行前基线。完成一次升级后，后续变更窗口也应在执行前查询数据库 checksum 并与仓库基线比较。

canonical CLI 会在执行 DDL 前核对已记录版本的 checksum；checksum 漂移以 `MIGRATION_CHECKSUM_MISMATCH` 失败，单实例 advisory lock 超时以 `MIGRATION_LOCK_TIMEOUT` 失败。任何校验、锁竞争或数据库错误都必须停止，禁止手工删除 marker 后重试。

## 执行与执行后验证

```powershell
pnpm db:migrate:staging
```

成功后再次执行以下只读校验，并与候选 commit 的 migration 清单及执行前快照对比：

```sql
SELECT version, checksum_sha256, applied_at
FROM schema_migrations
ORDER BY version;

SELECT COUNT(*) AS applied_versions,
       COUNT(DISTINCT version) AS distinct_versions,
       SUM(checksum_sha256 IS NULL OR checksum_sha256 = '') AS missing_checksums
FROM schema_migrations;
```

验收条件：版本集合与仓库候选清单一致，`applied_versions = distinct_versions`，`missing_checksums = 0`；canonical CLI 再运行一次应无新增 applied migration。证据只保存 commit、版本列表、checksum、时间和退出码，不保存密码或业务数据。

同时核对 `schema_migrations.execution_duration_ms`、`schema_migrations.executor_id` 与 `migration_execution_history`，确认本次 executor、成功/失败状态和执行耗时均已留痕。CLI 成功 stdout 必须是 JSON；失败 stderr JSON 和 exit code 1 应原样进入受控发布日志。

## 失败停止

- 任一步失败立即 stop 当前发布；不得继续 seed、启动新版本或把查询失败当作未应用。
- 保留 canonical CLI 原始退出码和脱敏日志，确认 advisory lock 已释放后再诊断。
- 不改写已发布 migration，不删除 `schema_migrations` 记录，不在未知 DDL 状态下盲目重跑。
- 依据备份/恢复与该 migration 的专项回滚方案决定恢复；MySQL DDL 不假设事务回滚。
- 只有 DBA 与发布负责人确认数据库状态、checksum 和版本集合一致后，才能重新启动 single migration job。
