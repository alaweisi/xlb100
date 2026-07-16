# N8 TKE Production 部署与切换施工方案

状态：**仓库内产品化施工；真实生产部署尚未开始**

基线：

- N6 本地验收：`SUCCESS`。
- N7 当前结果：`PREPARED_OFFLINE`，尚未取得真实 TKE Staging `PASS`。
- N8 分支：`codex/tke-production-cutover`。
- N8 worktree：`G:\xlb100-worktrees\tke-production-cutover`。

## 1. N8 入口条件

N8 真实执行前必须同时具备：

1. N7 真实 TKE Staging 结果为 `PASS`，不是 `PREPARED_OFFLINE`。
2. 四个生产镜像 repository 和 digest 与 N7 验证结果完全相同。
3. Production TKE、VPC、TCR、MySQL、Redis、COS、CLB/TLS 和监控方案已审核。
4. 数据库备份可恢复，对象数据同步有 checksum 证据。
5. Lighthouse 仍可健康响应并能承担回滚流量。
6. jobs 单活切换步骤已经桌面演练。
7. 生产窗口、Release/Data/On-call/Cost Owner 明确。

任何一项缺失，N8 只能继续仓库内准备，不能部署生产。

## 2. N8 八道门

| 门 | 操作 | 是否外部/生产 | 必需证据 |
| --- | --- | --- | --- |
| P1 | 生成并审核 N8 离线计划 | 否 | N7 PASS、候选参数、成本、输入哈希 |
| P2 | Production Terraform plan | 是，读取账号/state | 精确授权、无删除 plan |
| P3 | Production Terraform apply | 是，收费资源 | 审核后的 plan 和费用上限 |
| P4 | TKE 无流量部署 | 是，生产集群变更 | context、Secret/TLS、四 digest |
| P5 | 数据 migration 与 jobs 单活切换 | 是，高风险生产数据 | 备份、恢复证据、唯一 run id |
| P6 | Production Smoke | 是，生产验证 | 五工作负载、数据、COS、WebSocket、告警 |
| P7 | 5/25/50/100 灰度切流 | 是，用户流量 | 每级单独观察和停止条件 |
| P8 | Lighthouse 下线 | 是，不可逆外部操作 | 观察期结束、最终备份、单独授权 |

P1 不授权 P2；P2 不授权 P3；P4、P5、P7、P8 分别需要各自明确授权。脚本不能自动跨门。

## 3. P1：离线计划

将真实非 Secret 参数放在 Git 忽略目录：

```text
.artifacts/tke/production/
  manifest.json
  n7-staging-pass.json
  production.tfvars
  production.backend.hcl
  values-production.yaml
```

执行：

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action PrepareProduction -Environment production `
  -ProductionManifest .artifacts/tke/production/manifest.json
```

输出：

```text
.artifacts/tke/production-plan/
  n8-production-plan.json
  N8_PRODUCTION_PLAN.md
  prepare.txt
  infrastructurePlanAfterAuthorization.txt
  noTrafficDeployAfterAuthorization.txt
  migrateAfterAuthorization.txt
  smokeAfterAuthorization.txt
  rollbackAfterAuthorization.txt
```

计划生成器必须拒绝：

- N7 不是真实 PASS。
- 生产镜像与 N7 digest 不一致。
- 参数含 placeholder、Secret、localhost 或 staging 域名。
- 任意授权字段在离线阶段为 true。
- 没有备份/恢复、对象同步、jobs 单活或 Lighthouse 回滚证据。
- 灰度阶梯不是固定的 `5 -> 25 -> 50 -> 100`。

## 4. P2-P3：基础设施

Production Terraform plan 必须：

- 删除资源数量为 0。
- 不替换现有 MySQL、Redis、COS 或远端 state。
- Production 和 Staging 网络、数据库、Secret、集群 ID 不混用。
- TKE 节点至少满足多节点调度和 PDB。
- TCR/COS 使用私网、私有权限和删除保护。
- 单列 Terraform 外的 CLB、流量、日志、备份、证书费用。

Apply 失败时停止，不继续 Helm 部署。不得为“赶窗口”手工绕过 Terraform state。

## 5. P4：无流量部署

部署前：

1. DNS/CLB 仍指向 Lighthouse，或者 Production TKE 使用不承接用户的验证入口。
2. Production runtime Secret、TLS Secret 和 image pull 权限就绪。
3. jobs Deployment 初始保持 0 副本或暂停消费，防止与 Lighthouse 双活。
4. migration 默认关闭。

部署后验证：

- Backend live/ready。
- 三端前端。
- MySQL/Redis TLS。
- COS 私有读写删除样本。
- WebSocket。
- 日志、指标、告警。
- Backend 多副本、PDB 和节点分布。

无流量 Smoke 失败立即 Helm rollback；不做 migration，不切流。

## 6. P5：数据与 jobs 单活

顺序固定：

```text
确认写入静默/增量同步策略
  -> 验证最新备份和恢复点
  -> 停止 Lighthouse jobs 消费
  -> 确认没有两个活跃消费者产生业务副作用
  -> 执行唯一 migration Job
  -> 校验 schema/history/关键业务数据
  -> 启动 TKE jobs 单副本
  -> 验证心跳、积压和幂等
```

数据库 migration 是高风险工程。`-BackupConfirmed` 只是脚本门禁，不替代真实备份与 Human 授权。

## 7. P6-P7：Smoke 与灰度切流

每个流量级别至少观察 manifest 约定的时间：

```text
5% -> 观察 -> 25% -> 观察 -> 50% -> 观察 -> 100% -> 延长观察
```

每一级记录：

- HTTP 5xx、业务错误率、P95/P99。
- Backend Pod ready/restart/OOM。
- MySQL 连接、锁、慢查询、复制/存储。
- Redis 错误、连接、内存和 Stream backlog。
- jobs 心跳、重复业务副作用和 dead letter。
- COS 失败率。
- WebSocket 连接/重连。
- 告警通知链和费用异常。

任一停止条件触发：

1. 停止提高权重。
2. 将流量权重退回上一级；严重问题直接回 Lighthouse。
3. 将 TKE jobs 降为 0，再按单活步骤恢复 Lighthouse jobs。
4. 评估新写入是否仍兼容 Lighthouse 版本。
5. 必要时 Helm rollback，但不得盲目回滚数据库 schema。

## 8. P8：Lighthouse 观察期与下线

100% 流量到 TKE 不代表可以立即销毁 Lighthouse。

观察期内：

- Lighthouse 保持可启动、可健康检查。
- 保留最终数据库/对象备份和 Compose 配置。
- 不允许 Lighthouse jobs 与 TKE jobs 同时活跃。
- 记录所有残余流量、定时任务、证书和域名依赖。

观察期结束后，Lighthouse 下线必须单独授权。下线前输出资源释放清单和最终恢复演练结果。

## 9. 当前停止点

当前 N7 不是 PASS，因此 N8 真实执行停在 P1 之前。仓库工程可以完成并测试，但不得运行 Production Terraform plan/apply、Helm deploy、migration、Smoke、切流或 Lighthouse 下线。

