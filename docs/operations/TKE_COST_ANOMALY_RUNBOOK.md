# TKE 成本异常 Runbook

Safety markers: `READ_ONLY_DEFAULT` · `EXPLICIT_AUTHORIZATION_REQUIRED` · `NO_AUTO_EXECUTION`

## 适用范围与安全边界

本手册处理 TKE、节点/CBS、TCR、MySQL、Redis、COS、CLB、公网流量和 CLS 日志的费用异常。默认只读；关停、缩容、删除、改计费模式、缩短备份、改变日志留存、切换域名或销毁资源都可能影响生产，必须获得资源所有者和对应环境授权。

检查命令中的 `<approved-context>`、`<namespace>`、`<release>` 和 `<billing-period>` 是显式占位符。云账单、资源 ID 和预算属于外部系统事实，本仓库不伪造当前金额。

## 预设边界

`infra/observability/tke/cloud-alert-boundaries.yaml` 定义初始边界：预算 50% notice、80% warning、100% critical，日费用增长 30% 需要调查。真正月度金额必须由 Human 在 N7 前批准。

各费用责任边界：

| 项目 | 主要费用驱动 | 初始异常信号 |
|---|---|---|
| TKE/CVM/CBS | 集群管理、节点规格/数量、系统盘/数据盘 | 闲置节点、资源请求偏高、节点池意外扩张 |
| MySQL | 规格、存储、备份、代理/审计 | CPU/连接/存储低但规格高，备份或审计增长 |
| Redis | 内存规格、副本、集群架构 | 低利用率、内存持续增长、意外扩容 |
| COS/TCR | 对象/镜像存储、请求、公网出流量 | 镜像/对象未清理，出流量突增 |
| CLB | 实例、LCU、带宽/出流量 | 新建多个入口、5xx/重试放大流量 |
| CLS 日志 | 写入、索引、存储、查询、加工 | Debug、完整请求体、索引字段过多、留存过长 |

## 第一步：只读确认账单事实

在腾讯云费用中心按 `<billing-period>` 导出或查看：产品、地域、项目/标签、资源 ID、计费项、日趋势和预测。不要只看总额；先区分新增资源、单价变化、使用量变化和一次性费用。

集群侧只读核对：

```powershell
kubectl --context <approved-context> get node -o wide
kubectl --context <approved-context> top node
kubectl --context <approved-context> --namespace <namespace> get deployment,statefulset,pod -o wide
kubectl --context <approved-context> --namespace <namespace> top pod --containers
helm --kube-context <approved-context> --namespace <namespace> status <release>
```

若 Metrics API 不可用，记录缺口，不把缺少用量数据解释成零利用率。

## 第二步：按产品定位

### TKE、节点与磁盘

比较节点实际 CPU/内存与 Pod requests/limits，核对节点池期望/实际数量、是否存在空节点、孤立 CBS 和测试集群。不要在 Production 直接缩容；jobs 单副本、PDB 和调度余量都必须先评估。

### MySQL 与 Redis

核对规格、连接、CPU、存储/内存、备份、副本、代理、审计和跨可用区设置。性能富余不等于可以立即降配；需要容量峰值、恢复时间和高可用评审。

### COS、TCR 与公网流量

按 bucket/repository 检查对象/镜像版本、请求、存储和公网出流量。先判断是否为真实业务增长、错误重试、镜像保留、生命周期缺失或跨地域访问。删除版本或改变生命周期前必须验证恢复需求。

### CLB

核对 Ingress 是否意外创建多个 CLB、LCU、连接、带宽、5xx 和健康后端。合并入口或删除 CLB 是网络变更，必须先核对 DNS、证书、WAF 和回滚入口。

### CLS 日志

按 topic 检查日写入、索引、存储、查询和加工。默认目标是业务日志 14 天、Debug 3 天，但正式留存必须同时满足安全、审计和业务要求。不得为了省钱删除事故证据或合规日志。

## 第三步：异常分级与授权

- Notice：达到预算 50% 或单日增长超过 30%，48 小时内说明原因。
- Warning：达到预算 80%，24 小时内提出可逆优化方案。
- Critical：达到预算 100%、持续高速增长或发现未知收费资源，立即升级 Human 和财务/平台负责人。

变更提案必须列出预计节省、可靠性影响、执行窗口、验证和回退。以下动作不能自动执行：节点/数据库/Redis 降配、资源删除、日志留存缩短、备份删除、CLB/公网入口变更、COS 生命周期变更。

## 关闭条件

1. 费用中心的资源和计费项已定位，责任人确认。
2. 若执行了授权优化，服务、jobs、数据库、缓存、COS、CLB 和日志可用性通过复验。
3. 预算、标签、告警接收人和后续观察期已记录。
4. 未知资源仍存在时保持事件开放，不用“预计下月恢复”代替账单证据。
