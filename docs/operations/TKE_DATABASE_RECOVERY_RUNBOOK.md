# TKE 数据库与状态依赖恢复 Runbook

Safety markers: `READ_ONLY_DEFAULT` · `EXPLICIT_AUTHORIZATION_REQUIRED` · `NO_AUTO_EXECUTION`

## 适用范围与安全边界

本手册覆盖 MySQL、Redis、outbox/dispatch stream、migration 和 COS 依赖异常。默认只读；备份恢复、主备切换、写入修复、重放、删除、migration、Redis failover、COS 对象覆盖以及应用停写均属于高风险或生产操作，必须另行授权并由数据负责人执行。

任何命令必须显式使用 `<approved-context>`、`<namespace>`、`<release>` 和 `<read-only-endpoint>`。禁止把真实密码写进命令行、聊天、Runbook 或日志。

## 信号解释

- `/health/ready` 响应可以区分 MySQL 与 Redis，但当前 Prometheus 指标没有独立 `mysql_up`/`redis_up`；不能根据一个聚合告警断言具体依赖。
- `XlbReliabilitySnapshotStale` 表示快照没有更新，可能是 jobs、MySQL、Redis 或共享缓存链路问题。
- `XlbDataReliabilityDegraded`、oldest eligible、expired lease、stalled row 和 stream length 描述有界可靠性状态，不是备份成功证明。
- `XlbMigrationJobFailed` 只说明 Kubernetes Job 失败；失败 migration 是否部分提交必须通过数据库事实确认。

## 第一步：冻结自动动作并收集只读证据

不得自动重启 jobs、重跑 migration 或清理队列。先记录告警开始时间、最近发布/migration、受影响城市和读写症状。

```powershell
kubectl --context <approved-context> --namespace <namespace> get deployment,pod,job -o wide
kubectl --context <approved-context> --namespace <namespace> logs deployment/<release>-xlb-backend --since=30m --tail=500
kubectl --context <approved-context> --namespace <namespace> logs deployment/<release>-xlb-jobs --since=30m --tail=500
kubectl --context <approved-context> --namespace <namespace> get events --sort-by=.lastTimestamp
```

日志只保留错误类别、时间、city/step 等非敏感诊断信息；不得导出请求体、连接串、令牌、手机号或对象存储凭据。

## 第二步：MySQL 只读核对

使用腾讯云控制台或经批准的只读账号检查：实例可用性、连接数、CPU、存储、复制延迟、慢查询和最近一次成功备份。数据库查询必须走 `<read-only-endpoint>`，不得使用写账号。

建议核对事实：

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY id DESC LIMIT 20;
SELECT city_code, status, COUNT(*) FROM event_outbox GROUP BY city_code, status;
```

第二条可能扫描较多行，应先确认索引和数据量；Production 是否执行由数据负责人决定。不要在事故中直接修改 `event_outbox`、`schema_migrations` 或业务表。

恢复点必须同时满足：备份时间早于破坏事件、RPO/RTO 可接受、目标实例隔离、应用版本与 schema 兼容。优先恢复到隔离的新实例进行校验，不覆盖原实例。

## 第三步：Redis 与 stream 只读核对

在腾讯云控制台检查实例可用性、内存、CPU、连接数、eviction、复制延迟和故障切换事件。通过经批准的只读诊断入口检查 stream 长度与 consumer group；不要执行 `FLUSH*`、`DEL`、`XDEL`、`XTRIM`、`XGROUP DESTROY` 或批量重放。

Redis 中的 heartbeat 和 reliability snapshot 是带 TTL 的共享可观测缓存。缓存过期不等于 MySQL 数据丢失；恢复 Redis 后应等待 jobs 重新发布，不要手工伪造 freshness。

## 第四步：COS 与对象一致性

检查 Cloud Monitor 的 COS 4xx/5xx、请求数、存储量和公网出流量，以及 bucket region、权限、版本控制和生命周期策略。只读抽样时使用不含个人数据的已知测试对象；禁止覆盖或删除真实业务对象。

应用没有导出 COS 成败 Prometheus 指标，因此需要结合结构化日志和云监控。若凭据或 bucket 配置异常，Secret 轮换和配置变更必须走发布门禁。

## 第五步：恢复方案审批

恢复单至少包含：故障事实、数据范围、目标 RPO/RTO、备份/恢复点、校验查询、应用停写策略、jobs 处理、COS/Redis 影响、回退路径和授权人。下列动作不得合并成“一键普通部署”：

1. 创建隔离恢复实例并恢复备份；
2. 校验 schema、行数、关键业务不变量和对象引用；
3. 决定增量追平或接受的数据窗口；
4. 单独批准连接切换；
5. 恢复 backend，再恢复单副本 jobs；
6. 观察 heartbeat、backlog 和错误率。

具体恢复/切换命令由腾讯云产品和受控 N4/N7 工具生成，本 Runbook 不提供可直接修改 Production 的命令。

## 恢复验收

```powershell
kubectl --context <approved-context> --namespace <namespace> get deployment,pod,job -o wide
kubectl --context <approved-context> --namespace <namespace> rollout status deployment/<release>-xlb-backend --timeout=5m
```

确认 MySQL/Redis 可用、`/health/ready` 恢复、snapshot age 与 heartbeat 恢复、stalled/expired 为零、oldest age 和 stream length 持续下降、没有重复副作用，且 COS 抽样读取通过。任何数据差异都要保留证据并停止扩大流量。
