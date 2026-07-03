# @xlb/backend — DAL

Phase 2 数据库访问层。所有 MySQL / Redis 连接必须通过本目录。

## 模块

| 文件 | 职责 |
|------|------|
| `db.ts` / `mysqlPool.ts` | MySQL 连接池 |
| `redisClient.ts` | Redis 客户端 |
| `migrationRunner.ts` | 顺序执行 `db/migrations/*.sql` |
| `seedRunner.ts` | 幂等执行 `db/seed/*.sql` |
| `repositoryBase.ts` | Repository 基类 |
| `scopedExecutor.ts` | city_code 强制约束 |
| `adminQueryGuard.ts` | admin city_scope 校验 |
| `transaction.ts` | `withTransaction` 骨架 |

## 规则

- 禁止在 `backend/src` 其他目录直接 `createPool` / `createConnection`
- 所有 Repository 必须继承 `RepositoryBase`
- city scoped 查询必须带 `RequestContext.cityCode`
