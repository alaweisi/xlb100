# TKE 集成点 2 验收结果

## 结论

**SUCCESS — N4 与 N5 已完成本地集成，可以进入 N6 本地集成验收。**

本结论只表示部署工具链、离线 CI、可观测性配置和运维 Runbook 已在同一基线上完成本地组合验证；不构成连接腾讯云、执行 Terraform plan/apply、部署 TKE、使用生产凭据、处理生产数据或 push 的授权。

## 集成信息

- 基线提交：`3ac9703c24f9e12fc34979446941fe8c3d92a7c2`
- 集成分支：`codex/tke-integration-2`
- 集成工作树：`G:\xlb100-worktrees\tke-integration-2`
- N4 源提交：`7888120a49e5a98fb3ff0bb9bd8d9c70ae530ce0`
- N4 合并提交：`d54f6493d92985d01054e126c89ef2a8b8fa36cd`
- N4 migration 编排增量提交：`41cd0184c60e683a57c3d3751aec5fb3ff037e5c`
- N4 增量合并提交：`13d75ba4495596a8fbe80677ba8efc9228b69da8`
- N5 源提交：`d5a332d5cd2cd4a2b148048094da0ba33e0014b3`
- N5 合并提交：`8da75119ae23c9f6bc0918e75368303503414d21`
- 合并顺序：N4 → N5
- 路径交集：无
- 文件冲突：无

## N4 门禁

`pnpm tke:gate` 通过，覆盖：

- 9 项静态安全测试，其中包含 migration 复用已安装 release 且只渲染 Job 的断言。
- 9 项 PowerShell 失败负例和 5 项默认 dry-run 正例。
- local、staging、production 三环境 Helm lint/render。
- 22 个 Kubernetes 资源离线 schema 校验：21 valid、0 invalid、1 个 ServiceMonitor CRD skipped。
- 10 项 Helm production 负例。
- Terraform `fmt`、`init -backend=false`、`validate`。
- 3 个无腾讯云凭据的 Terraform mock 场景。
- 工具版本锁和已校验的本地工具缓存。
- 使用真实 Helm 渲染 migration，确认恰好生成 1 个 Job，不生成 Deployment、Service 或 ConfigMap，并引用已安装 release 的 backend ConfigMap。

未运行 Terraform plan/apply，未读取腾讯云凭据。

## N5 门禁

`infra/observability/tke/Validate-N5.ps1` 通过，覆盖：

- Prometheus rule、JSON/YAML 结构和 PromQL 括号/引用静态检查。
- 应用 `xlb_*` 指标源码存在性和平台指标 allowlist。
- N1 labels、Service、ServiceMonitor 契约。
- 两个 Grafana Dashboard。
- 云告警边界契约。
- 发布回滚、节点故障、数据库恢复、成本异常四份 Runbook 及安全标记。

本机未安装 `promtool`，官方 PromQL parser 校验如实记为 `SKIP`；确定性 fallback 已通过，但不能替代 N6/N7 的官方 `promtool` 验证。

## 组合离线回归

- `pnpm test:contracts`：63 个文件、270 个测试通过，1 个 todo。
- `pnpm check:workspace-links`：17 个 `@xlb/*` 工作区链接通过。
- `pnpm test:ci-supply`：8 个测试通过。
- `git diff --check`：通过。
- N4、N5 两提交父节点均为正确集成点 1 基线，源工作树均干净。
- `infra/observability/tke/**` 8 个文件命中仓库 `PRODUCTION` 敏感路径规则；已使用 Human 对 N4/N5 本地集成点 2 施工的明确授权登记本批次，本授权不包含任何外部或生产操作。

首次运行契约测试时，新工作树缺少 `@xlb/shared` 构建产物，导致 2 个 suite 在加载阶段失败；构建 5 个后端依赖包后完整重跑，最终 63 个文件、270 个测试全部通过。该首次失败属于工作树初始化问题，不是代码断言失败。

## N6 预检回流与重新验收

N6 首次开工预检发现原 N4 `Migrate` 会以第二个 release 名渲染整张 Chart，存在创建第二套 Deployment、Service、ConfigMap，以及 migration Job 引用错误 ConfigMap 的风险。N6 在旧集成点 2 基线上保持干净并暂停施工，问题回流 N4 后完成以下修复：

1. `Migrate` 复用现有 `$releaseName`。
2. Helm template 增加 `--show-only templates/migration-job.yaml`。
3. `kubectl apply` 只接收唯一 migration Job。
4. 静态与真实 Helm 渲染门禁拒绝第二 release 和整张 Chart 应用。

增量合入后重新执行 N4、N5 和全部组合离线回归，结果全部通过。N6 必须从本次重新验收后的最终报告提交重建或更新基线，不得继续使用旧提交 `7901e3c7f5004e9d82ce8edba5317416f0de25b2`。

## N6/N7 必须继续验证的边界

1. 安装并运行官方 `promtool check rules`。
2. jobs 指标当前没有独立 ServiceMonitor，不对不可抓取时间序列声明已具备告警。
3. MySQL、Redis、COS、CLB、TKE 托管控制面、CLS 和账单真实云指标留待 N7。
4. HTTP 当前只有 mean 指标，p95/p99 需补齐采集契约后再配置告警。
5. 告警阈值必须在 staging 结合真实流量调优。
6. 真实 kube-context、Secret/TLS Secret、镜像 digest、COS Bucket 和腾讯云资源仍未接入。

## 外部操作声明

本集成点未连接腾讯云，未执行 Terraform plan/apply，未 push，未 deploy，未处理生产数据，也未创建任何计费资源。
