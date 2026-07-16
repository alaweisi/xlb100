# N7 TKE Staging 验证施工方案

状态：**仓库内准备已启动；真实腾讯云操作未授权、未执行**

基线：

- N1～N5 集成提交：`af042bdea2a2e3658fee75f687fc38d2760708b7`
- N6 本地验收提交：`cfcfc2e21c2570f6b33abf2f654d373870643fb6`
- N7 分支：`codex/tke-staging-validation`
- N7 worktree：`G:\xlb100-worktrees\tke-staging-validation`

## 1. 本节点目标

N7 将已经通过 kind 的产品线放到腾讯云真实 Staging 中验证。当前施工先把云端操作前的输入、证据、命令和停止条件产品化；没有 Human 外部授权时只执行离线准备。

本轮明确不做：

- 不读取腾讯云账号、凭据或远端 Terraform state。
- 不执行真实 Terraform plan 或 `terraform apply`。
- 不创建或变更 TKE、节点池、TCR、COS、CLB 等收费资源。
- 不连接真实 TKE，不推送镜像，不部署 Helm release。
- 不迁移生产数据，不修改 DNS，不切流，不下线 Lighthouse。

## 2. 五道独立授权门

| 门 | 操作 | 当前状态 | 通过前所需证据 |
| --- | --- | --- | --- |
| G1 | 读取真实账号和远端 state，执行 Terraform plan | 未授权 | N7 离线计划、费用区间、临时只读/最小权限凭据方案 |
| G2 | Terraform apply / 创建收费资源 | 未授权 | 人工审核后的 plan 摘要、资源数量、费用、删除/回滚影响 |
| G3 | 推镜像并部署 TKE Staging | 未授权 | 云资源 Ready、四镜像 digest、Secret/TLS、kube-context 复核 |
| G4 | Staging migration 与备份恢复演练 | 未授权 | 备份 ID、恢复验证、migration run ID、单活和回滚方案 |
| G5 | 生产数据、生产部署、DNS/CLB 切流 | 不属于 N7 | N8 单独方案和生产授权 |

G1 通过不代表 G2；G2 通过不代表 G3。脚本不能替代 Human 授权。

## 3. 仓库内准备流程

### N7-A：冻结候选输入

真实候选文件只能放在 `.artifacts/tke/staging/`：

```text
manifest.json
staging.tfvars
staging.backend.hcl
values-staging.yaml
```

这些文件必须：

- 不含 Secret、密码、腾讯云访问密钥或临时 token。
- 不含 placeholder、示例域名、全零 digest 或 localhost。
- Terraform、COS、backend state 与 Helm values 地域一致。
- MySQL、Redis、COS bucket、runtime Secret 名称在 Terraform 与 Helm 中一致。
- 四个应用镜像使用不可变 digest。
- 费用复核人、月度费用区间、来源和日期明确。
- 五个授权字段在离线阶段全部为 `false`。

### N7-B：生成离线证据

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action PrepareStaging -Environment staging `
  -StagingManifest .artifacts/tke/staging/manifest.json
```

输出到 `.artifacts/tke/staging-plan/`：

- `n7-staging-plan.json`：机器可读的资源决策、输入 SHA-256、费用复核和外部门禁。
- `N7_STAGING_PLAN.md`：Human 审核摘要。
- `terraform-plan-command.txt`：G1 授权后才能执行的真实 Plan 命令。
- `helm-render-command.txt`：基于候选 values 的离线渲染命令。

生成过程只读本地文件和 Git 祖先关系，不读取云端。

### N7-C：真实 Terraform plan（G1 授权后）

仓库入口使用专用 `-ExecutePlan`，拒绝 `-Apply`：

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action PlanInfrastructure -Environment staging `
  -ExecutePlan `
  -TerraformVarFile .artifacts/tke/staging/staging.tfvars `
  -BackendConfig .artifacts/tke/staging/staging.backend.hcl `
  -Confirmation PLAN-INFRASTRUCTURE-STAGING
```

该动作会读取真实账号和远端 state，因此即使不收费，也属于外部操作，必须先获授权。输出 plan 文件仍保存在 `.artifacts`，不得提交 Git。

### N7-D：Plan 审核（仍不 Apply）

至少审查：

1. 新建、修改、替换、删除资源数量；删除必须为 0。
2. TKE 版本、集群规格、节点机型、数量、可用区和系统盘。
3. VPC、Pod、Service CIDR 无冲突。
4. TCR/COS 私有策略、版本控制和删除保护。
5. MySQL/Redis 只走内网且没有密码进入 state 或 tfvars。
6. 预计月费与预算上限；CLB、日志、流量和备份等 Terraform 外费用单列。
7. Apply 失败后的清理责任人与保留/销毁策略。

完成审核后向 Human 报告 Plan 摘要，再申请 G2；不得自动继续。

## 4. 云端 Staging 验收顺序

G2、G3 分别批准后才进入：

```text
Terraform apply
  -> TKE/TCR/COS/网络检查
  -> 构建并推送四镜像，冻结 digest
  -> 创建外部 Secret 与 TLS 引用
  -> Helm 无流量部署
  -> Probe/三端/WebSocket/jobs/COS Smoke
  -> CLB/Ingress/DNS 测试域名
  -> 滚动升级与 Helm rollback
  -> 节点 drain/PDB/扩缩容/故障演练
  -> 日志、告警通知、费用阈值验证
  -> 经 G4 批准后做 Staging migration/恢复演练
```

任一步失败就停止后续动作，保留证据并按对应 Runbook 回滚。

## 5. N7 完成定义

只有以下项目全部有真实证据，N7 才能 `PASS`：

- Terraform plan 与 apply 经不同授权完成，实际资源与审核一致。
- 四个 digest 可由 TKE 私网拉取。
- 托管 MySQL/Redis、COS、TLS、CLB/Ingress/DNS 验证通过。
- 五个工作负载 Ready，Probe、WebSocket、jobs 和 Smoke 通过。
- 升级、回滚、节点故障、PDB/伸缩、日志告警和成本阈值演练通过。
- Staging 备份、migration、恢复和回滚证据完整。
- Production 参数模板冻结，但没有执行生产迁移或切流。

当前仓库内准备完成时只能报告 `N7_STATUS=PREPARED_OFFLINE`，不得写 `PASS`。
