# TKE 节点与 Pod 故障 Runbook

Safety markers: `READ_ONLY_DEFAULT` · `EXPLICIT_AUTHORIZATION_REQUIRED` · `NO_AUTO_EXECUTION`

## 适用范围与安全边界

本手册处理 Pod 不可用、反复重启、CPU/内存压力和 TKE 节点 NotReady。默认步骤全部只读；cordon、drain、删除 Pod、替换节点、扩容节点池或修改 requests/limits 都属于真实集群变更，必须另行授权。

命令中的 `<approved-context>`、`<namespace>`、`<pod>`、`<node>` 和 `<release>` 必须从已批准事件单取得，不能根据当前默认 kube-context 猜测。

## 告警入口

- `XlbDeploymentReplicasUnavailable`
- `XlbPodRestartBurst`
- `XlbContainerCpuNearRequest`
- `XlbContainerMemoryNearLimit`
- `XlbTkeNodeNotReady`
- `XlbBackendMetricsMissing` 或 `XlbJobWorkerHeartbeatStale`

平台指标来自 kube-state-metrics 与 kubelet/cAdvisor；`xlb_*` 指标来自 backend `/metrics`。前者缺失不能直接判断应用故障，后者缺失也可能是 ServiceMonitor 或抓取链路故障。

当前 jobs Pod 没有独立可抓取 Service；逐步骤 run/duration 计数只存在 jobs 进程内存，不能用 backend 的 `/metrics` 告警。N5 只使用通过 Redis 共享后由 backend 暴露的 heartbeat 与 reliability/backlog。

## 第一步：只读确认影响面

```powershell
kubectl --context <approved-context> --namespace <namespace> get deployment,pod -o wide
kubectl --context <approved-context> --namespace <namespace> describe pod <pod>
kubectl --context <approved-context> get node <node> -o wide
kubectl --context <approved-context> describe node <node>
kubectl --context <approved-context> --namespace <namespace> get events --sort-by=.lastTimestamp
kubectl --context <approved-context> top node <node>
kubectl --context <approved-context> --namespace <namespace> top pod <pod> --containers
```

若 Metrics API 不可用，记录该缺口，不用 `top` 失败推断资源正常。检查同一节点上是否同时影响 backend、jobs 和前端，并确认其他节点是否有可调度容量。

## 第二步：区分 Pod、节点与抓取链路

### Pod/容器故障

只读检查当前与上一次退出日志：

```powershell
kubectl --context <approved-context> --namespace <namespace> logs <pod> --all-containers --since=15m --tail=500
kubectl --context <approved-context> --namespace <namespace> logs <pod> --all-containers --previous --tail=500
kubectl --context <approved-context> --namespace <namespace> get pod <pod> -o jsonpath='{.status.containerStatuses}'
```

重点判断 OOMKilled、探针失败、镜像拉取、Secret/ConfigMap 挂载、只读文件系统和应用退出码。日志中不得复制 Secret 或个人信息。

### 节点故障

核对 `Ready`、MemoryPressure、DiskPressure、PIDPressure、网络状态、污点和节点事件。单个节点 NotReady 但所有副本仍可用时按 warning 处置；Production 多个副本同时不可用时升级 critical。

### Prometheus 抓取故障

```powershell
kubectl --context <approved-context> --namespace <namespace> get service <release>-xlb-backend -o yaml
kubectl --context <approved-context> --namespace <namespace> get endpoints <release>-xlb-backend -o yaml
kubectl --context <approved-context> --namespace <namespace> get servicemonitor -o wide
```

ServiceMonitor 是可选 CRD。资源不存在时记录“监控尚未安装/未启用”，不要创建资源绕过发布流程。

## 第三步：变更决策门禁

以下动作均需事件负责人和对应环境授权，且一次只选择一种可回退动作：

- cordon/drain 或替换 `<node>`；
- 删除/重建 `<pod>`；
- 扩大 Deployment 或节点池；
- 调整探针、requests/limits、PDB 或 HPA；
- 回滚应用或切换流量。

节点 drain 前必须确认 PDB、jobs 单副本、临时存储和可调度容量。`jobs` 使用 Recreate 且初始单副本，不能假设排空节点期间仍有工作进程。

## 第四步：恢复验收

```powershell
kubectl --context <approved-context> --namespace <namespace> get deployment,pod -o wide
kubectl --context <approved-context> --namespace <namespace> rollout status deployment/<release>-xlb-backend --timeout=5m
kubectl --context <approved-context> get node <node> -o wide
```

确认所有期望副本可用、重启计数停止增长、CPU/内存回落、backend metrics 恢复、jobs heartbeat 小于 120 秒、backlog 没有继续增长。节点恢复不代表应用或数据库已经恢复，必要时转入发布回滚或数据库恢复手册。
