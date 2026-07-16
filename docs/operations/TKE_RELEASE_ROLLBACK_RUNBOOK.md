# TKE 发布与回滚 Runbook

Safety markers: `READ_ONLY_DEFAULT` · `EXPLICIT_AUTHORIZATION_REQUIRED` · `NO_AUTO_EXECUTION`

## 适用范围与安全边界

本手册用于未来 TKE Staging/Production 发布异常的桌面处置。当前仓库准备阶段只允许执行离线或只读检查；任何真实部署、扩缩容、回滚、切流、Secret 修改和数据库 migration 都必须获得对应环境的单独授权。

所有命令都保留 `<approved-context>`、`<namespace>`、`<release>` 和 `<revision>` 占位符。未完成上下文核对时不得替换或执行。不得把 migration 或 DNS/CLB 切流隐藏在普通应用回滚中。

## 触发条件

- 发布后 `XlbHttp5xxRatioHigh`、`XlbHttpAverageLatencyHigh` 或可用副本告警持续超过规则窗口。
- Smoke、WebSocket 或关键用户路径失败。
- 新旧版本数据契约不兼容，或 jobs 出现重复消费风险。
- 镜像 digest、Chart 版本或环境 values 与已批准发布单不一致。

## 第一步：冻结并收集只读证据

先记录事件时间、告警、发布人、目标环境、当前/上一镜像 digest 和 Chart 版本。以下命令均为只读：

```powershell
kubectl --context <approved-context> --namespace <namespace> get deployment,pod,service,ingress -o wide
kubectl --context <approved-context> --namespace <namespace> get events --sort-by=.lastTimestamp
kubectl --context <approved-context> --namespace <namespace> rollout status deployment/<release>-xlb-backend --timeout=30s
kubectl --context <approved-context> --namespace <namespace> rollout history deployment/<release>-xlb-backend
helm --kube-context <approved-context> --namespace <namespace> status <release>
helm --kube-context <approved-context> --namespace <namespace> history <release>
```

日志只取受控时间窗，不导出请求体、令牌、手机号、Secret 或完整数据库连接串：

```powershell
kubectl --context <approved-context> --namespace <namespace> logs deployment/<release>-xlb-backend --since=15m --tail=500
kubectl --context <approved-context> --namespace <namespace> logs deployment/<release>-xlb-jobs --since=15m --tail=500
```

同时截图或导出 Grafana 的 HTTP 5xx、平均延迟、heartbeat、backlog、可靠性和副本趋势。当前只有平均延迟，没有 p95/p99，不能把平均值当作尾延迟结论。

## 第二步：判定是否适合回滚

只有以下条件全部成立，应用回滚才是候选方案：

1. 上一 Helm revision 和所有镜像 digest 已知且来自同一发布链。
2. 数据库变更为向后兼容，或本次发布没有 migration。
3. jobs 的旧版本可安全消费当前 outbox/stream 状态。
4. Secret、COS 对象格式、CLB/Ingress 路由没有发生不可逆变化。
5. 已指定回滚后的 Smoke、观察窗口和恢复负责人。

如果 migration 已执行、数据格式已变化或旧 jobs 不兼容，应停止在“评估”状态，转交 [数据库恢复 Runbook](./TKE_DATABASE_RECOVERY_RUNBOOK.md)，不能机械回滚。

## 第三步：预演与授权门禁

在获得真实回滚授权前，只允许渲染和比较目标 revision；不得执行 `helm rollback`、`kubectl rollout undo` 或修改流量。未来应由 N4 的受控入口执行，显式传入：

```text
context=<approved-context>
namespace=<namespace>
release=<release>
revision=<revision>
confirmation=<approved-confirmation>
```

生产回滚授权必须明确覆盖目标 revision、镜像 digest、是否包含 jobs、是否涉及 migration/切流。Staging 授权不得自动扩张为 Production 授权。

## 第四步：回滚后只读验收

回滚操作由受控入口完成后，值守人员执行：

```powershell
kubectl --context <approved-context> --namespace <namespace> get deployment,pod -o wide
kubectl --context <approved-context> --namespace <namespace> rollout status deployment/<release>-xlb-backend --timeout=5m
helm --kube-context <approved-context> --namespace <namespace> status <release>
```

验收必须覆盖 `/health/live`、`/health/ready`、三端首页、API Smoke、WebSocket、jobs heartbeat、outbox/stream backlog、MySQL/Redis 连接和 COS 读写抽样。至少观察一个完整 jobs 周期和告警窗口。

## 结束条件

- 服务、jobs 和可靠性指标回到基线，且没有新增积压。
- 当前 revision、镜像 digest、事件时间线和授权记录已归档。
- 若没有恢复，保持 Lighthouse/旧入口的回退选择，不擅自下线资源，并升级给应用、数据和云平台负责人。
