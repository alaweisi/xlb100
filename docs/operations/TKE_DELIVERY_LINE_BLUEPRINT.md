# XLB TKE 交付产品线蓝图与分支施工方案

状态：**BLUEPRINT / PLAN ONLY**

本文件冻结“如何施工”，不是已经完成施工。当前没有 Helm Chart、Terraform Apply、TKE 集群、云资源创建、数据迁移或生产切流结果。

关联总体迁移说明：`docs/operations/TKE_MIGRATION_PLAN.md`。

## 1. 建设目标

现在完成可复用的 TKE 工程产品线，使未来上线时从“重新设计和临时施工”变为：

1. 填写经过审核的环境参数。
2. 执行统一入口完成离线检查和云资源 Plan。
3. 经明确授权后创建或核对云资源。
4. 使用同一不可变镜像和 Helm Chart 部署。
5. 执行 Smoke、观察、切流或回滚。

目标入口形态：

```powershell
# 现在即可使用的离线能力（施工完成后）
pwsh deploy/tke/xlb-tke.ps1 -Action Validate -Environment local

# 将来只生成云资源计划，不创建资源
pwsh deploy/tke/xlb-tke.ps1 -Action PlanInfrastructure -Environment staging

# 将来获得外部操作授权后部署
pwsh deploy/tke/xlb-tke.ps1 -Action Deploy -Environment staging -Apply `
  -KubeContext <approved-context> -Confirmation <approved-confirmation>

# 生产 migration、切流、回滚分别保留独立入口和确认
```

“一键”表示统一入口、固定参数、自动检查和可重复执行，不表示跳过 Secret、数据迁移、生产确认或回滚门禁。

## 2. 总体架构

交付产品线分为七层：

```text
L1 应用代码
   backend / jobs / customer / worker / admin
            |
L2 镜像供应链
   Dockerfile -> CI build -> TCR -> immutable digest
            |
L3 应用编排
   Helm Chart -> rendered Kubernetes manifests
            |
L4 环境配置
   local / staging / production values + external Secret references
            |
L5 云基础设施
   Terraform plan/apply -> VPC/TKE/node pool/TCR/COS and dependency references
            |
L6 发布控制
   validate / deploy / migrate / smoke / rollback / cutover
            |
L7 运维保障
   logs / metrics / alerts / backup / cost / runbooks / drills
```

各层只通过冻结接口连接：

- 应用层输出容器镜像、端口、Probe、环境变量和 Secret 文件契约。
- Helm 层只消费上述契约，不包含真实 Secret。
- IaC 层输出集群、仓库、网络和对象存储标识，不直接部署业务。
- 发布层组合 IaC 输出、环境 values 和镜像 digest。
- 数据 migration、生产切流和资源销毁不隐藏在普通 `Deploy` 中。

## 3. 必须先冻结的跨分支契约

并行施工前，以下接口不得各分支自行发明：

### 3.1 工作负载契约

| 组件 | Kubernetes 类型 | 端口/入口 | 初始副本策略 |
|---|---|---|---|
| backend | Deployment + Service | HTTP 3000 | Staging 1；Production 2 |
| jobs | Deployment，无 Service | 无公网端口 | 固定 1，验证幂等后再扩容 |
| customer | Deployment + Service | HTTP 4173 | Staging 1；Production 2 |
| worker | Deployment + Service | HTTP 4173 | Staging 1；Production 2 |
| admin | Deployment + Service | HTTP 4173 | Staging 1；Production 2 |
| migration | 显式一次性 Job | 无 Service | 默认关闭，唯一 run id |

### 3.2 Probe 契约

目标接口冻结为：

- `/health/live`：只判断进程存活，不访问 MySQL/Redis。
- `/health/ready`：判断关键依赖是否可接流量。
- `/metrics`：只允许集群内监控访问。
- 前端 `/`：HTTP 200 且返回应用 HTML。

在应用适配分支完成前，现有 `/health` 与 `/api/system/db-health` 继续保留兼容；Chart 最终使用新接口。

### 3.3 对象存储契约

目标 Provider：

```text
XLB_OBJECT_STORAGE_PROVIDER=cos
XLB_COS_BUCKET=<bucket-appid>
XLB_COS_REGION=<region>
XLB_COS_SECRET_ID_FILE=/run/xlb-secrets/cos_secret_id
XLB_COS_SECRET_KEY_FILE=/run/xlb-secrets/cos_secret_key
```

生产禁止 `local|mock`。真实凭据不进入 Git、values、镜像、Terraform 明文变量或日志。

### 3.4 Secret 文件契约

统一挂载目录：`/run/xlb-secrets`。

最少包含：

```text
mysql_password
mysql_tls_ca
redis_password
redis_tls_ca
jwt_secret
jwt_keys_json
auth_phone_hash_secret
auth_otp_pepper
cos_secret_id
cos_secret_key
```

### 3.5 镜像契约

- backend 与 jobs 使用同一 backend 镜像。
- customer、worker、admin 使用各自镜像。
- Staging 和 Production 只接受 `repository@sha256:digest`。
- Production 使用已经在 Staging 验证过的同一 digest，不重新构建。

### 3.6 Ingress 契约

```text
api.<domain>       -> backend Service
customer.<domain>  -> customer Service
worker.<domain>    -> worker Service
admin.<domain>     -> admin Service
```

- TKE 使用可配置的 `qcloud` IngressClass。
- `/api/support/realtime` 必须支持 WebSocket。
- `/metrics` 不通过公网 Ingress 暴露。
- 腾讯云 annotations 只存在于 TKE values，不写死在通用模板。

## 4. 工程目录分部表

下表是施工完成后的目标目录。每一行都有唯一主责施工节点，避免多个 worktree 同改同一文件。

| 目标目录/文件 | 分部工程 | 主责节点 | 主要产物 |
|---|---|---|---|
| `deploy/helm/xlb/**` | Helm 应用编排 | N1 | Chart、模板、schema、Chart 测试 |
| `deploy/environments/tke/**` | 环境参数 | N1 | local/staging/production values，均无真实 Secret |
| `backend/src/observability/**` | Probe 适配 | N2 | live/ready 接口和测试 |
| `backend/src/providers/objectStorage/**` | COS Provider | N2 | COS 实现、错误映射、注入式测试 |
| `packages/config/**` | Provider 配置 | N2 | COS 配置闭集和文件 Secret 读取 |
| `packages/types/**`、`packages/validators/**` | Provider 契约扩展 | N2 | 只允许加法兼容，不破坏旧契约 |
| `infra/tencent/terraform/**` | 腾讯云 IaC | N3 | TKE/TCR/COS 等 plan 模板与 outputs |
| `infra/tencent/README.md` | 云参数说明 | N3 | 账号、地域、VPC、费用触发点 |
| `deploy/tke/**` | 统一发布入口 | N4 | bootstrap、validate、deploy、migrate、smoke、rollback |
| `.github/workflows/tke-delivery-line.yml` | CI 门禁 | N4 | Chart/IaC/脚本离线检查，不部署云端 |
| `scripts/check-tke-delivery-line.mjs` | 仓库静态门禁 | N4 | 禁明文 Secret、禁生产 tag、检查必需文件 |
| `infra/observability/tke/**` | TKE 可观测性 | N5 | rules、dashboard、ServiceMonitor 参数说明 |
| `docs/operations/TKE_*RUNBOOK.md` | 运维 Runbook | N5 | 告警、备份、升级、回滚、费用和故障流程 |
| `tests/tke/**` | 集成验收 | N6 | rendered manifests、脚本、kind Smoke 测试 |
| `docs/operations/TKE_DELIVERY_LINE_ACCEPTANCE.md` | 验收报告模板 | N6 | 本地验收结果和剩余外部条件 |

以下文件为共享热点，只允许在指定节点或集成阶段修改：

| 共享文件 | 修改规则 |
|---|---|
| `package.json` | N4 在 N2 合入后统一添加命令，其他节点不改 |
| `pnpm-lock.yaml` | 只允许 N2 因 COS SDK 修改 |
| `deploy/README.md` | 最终集成阶段统一更新 |
| `docs/operations/TKE_MIGRATION_PLAN.md` | 蓝图基线和最终集成阶段修改 |
| `.env.production.example` | N2 完成配置契约后，由集成阶段统一补变量 |

## 5. 施工节点

### N0：蓝图与契约基线

分支：当前设计基线，不与其他施工并行。

产物：

- 本文件。
- 总体迁移方案。
- 路径所有权、接口契约、并行波次和验收门槛。

完成门槛：Human 已看到并确认蓝图；基线进入各 worktree 的共同起点。

### N1：Helm 应用编排

建议分支：`codex/tke-chart`

独占路径：

- `deploy/helm/xlb/**`
- `deploy/environments/tke/**`

施工内容：

1. backend/jobs/三端 Deployment。
2. Service、Ingress、ServiceAccount。
3. ConfigMap 和 existing Secret 文件挂载。
4. Probe、资源限制、只读文件系统、非 root、PDB、可选 HPA。
5. 显式 migration Job，默认关闭。
6. values schema：Production 强制 digest、COS、外部 Secret。
7. Chart 单元测试和三套环境渲染测试。

不得修改：backend、packages、Terraform、发布脚本。

验收：`helm lint`、三环境 `helm template`、schema 负例全部通过，渲染结果无明文 Secret。

### N2：应用 TKE Readiness

建议分支：`codex/tke-app-readiness`

独占路径：

- `backend/src/observability/**`
- `backend/src/providers/objectStorage/**`
- 对应 backend 测试
- `packages/config/**`
- `packages/types/**`
- `packages/validators/**`
- `backend/package.json`
- `pnpm-lock.yaml`

施工内容：

1. 增加 `/health/live`、`/health/ready` 并保持旧接口兼容。
2. 增加 COS Provider，保持对象私有、checksum、幂等和错误映射。
3. 增加 `_FILE` Secret 读取，不记录凭据。
4. 验证 SIGTERM、WebSocket 和 jobs 停机行为。
5. 验证 Production 禁止 local/mock 对象存储。

该节点涉及 Provider 和共享类型路径。开始写入前按项目风险脚本展示范围并记录一次 Human 对本地施工的确认；不执行真实 COS 请求。

验收：Provider 单元/契约测试、backend build/typecheck、配置负例、现有相关回归通过。

### N3：腾讯云 IaC

建议分支：`codex/tke-infra`

独占路径：

- `infra/tencent/**`

施工内容：

1. Terraform provider 版本锁定和环境变量认证。
2. 默认只支持 `fmt/validate/plan`，不默认 apply。
3. TKE、节点池、TCR、私有 COS 的模块或组合模板。
4. VPC、子网、MySQL、Redis、Secret 采用“创建或引用已有资源”的明确策略。
5. outputs 输出部署所需标识，不输出密码。
6. deletion protection、标签和费用资源清单。
7. 示例 tfvars 只含占位符。

不得修改 Helm、backend、发布脚本。

验收：`terraform fmt -check`、`terraform init -backend=false`、`terraform validate`；不得调用 `plan/apply` 连接真实账号。

### N4：统一发布工具与 CI

建议分支：`codex/tke-tooling`

依赖：N1 已合入；读取 N3 的 outputs 契约。

独占路径：

- `deploy/tke/**`
- `.github/workflows/tke-delivery-line.yml`
- `scripts/check-tke-delivery-line.mjs`
- N2 合入后统一修改根 `package.json`

施工内容：

1. 工具 bootstrap 和版本锁定。
2. `Validate`、`PlanInfrastructure`、`Deploy`、`Migrate`、`Smoke`、`Rollback` 统一入口。
3. staging/production kube-context 精确匹配。
4. 默认 dry-run；`Apply` 和确认文字双门禁。
5. Production 拒绝 tag、占位符、localhost、Chart 内 Secret。
6. CI 只执行离线 lint/render/validate/test，不连接腾讯云。

验收：脚本测试覆盖误环境、缺 digest、缺 Secret 引用、错误 context、无确认等负例。

### N5：可观测性、安全与 Runbook

建议分支：`codex/tke-operations`

依赖：读取 N1 labels/Service 和 N2 metrics 契约。

独占路径：

- `infra/observability/tke/**`
- 新增的 `docs/operations/TKE_*RUNBOOK.md`

施工内容：

1. Pod 重启、不可用副本、CPU/内存、HTTP 错误率和延迟告警。
2. jobs 心跳、Stream backlog、migration 状态告警。
3. MySQL、Redis、COS、CLB、TKE 和日志费用阈值。
4. 日志保留、脱敏、Dashboard。
5. 发布、回滚、节点故障、数据库恢复和费用异常 Runbook。

不得修改 Chart 模板；需要 Chart 参数时提交接口需求，由集成阶段处理。

验收：规则语法检查、指标存在性检查、Runbook 桌面演练。

### N6：本地集成验收

建议分支：`codex/tke-acceptance`

依赖：N1-N5 全部合入集成基线后开始，不并行修改产品代码。

独占路径：

- `tests/tke/**`
- `docs/operations/TKE_DELIVERY_LINE_ACCEPTANCE.md`
- 仅修复验收发现的问题时回到原主责分支

施工内容：

1. 离线全门禁。
2. Docker 镜像构建。
3. kind/k3d 本地集群安装。
4. 后端、三端、WebSocket、jobs、Probe、重启和滚动升级。
5. migration Job 使用临时测试数据库演练。
6. Helm rollback 演练。
7. 输出尚需真实腾讯云才能验证的清单。

验收：本地一键验证通过，且没有把本地结果冒充 TKE Staging 结果。

### N7：TKE Staging 与生产就绪验证

建议分支：`codex/tke-staging-validation`

这是未来外部操作节点，不在当前纯准备施工授权中执行。

前提：N6 通过，用户明确批准创建收费资源和云端部署。

内容：

- Terraform plan 审核与 apply。
- TKE Staging 部署、Smoke、升级、回滚、节点故障和备份恢复演练。
- 修正腾讯云实际 annotations、权限和网络差异。
- 冻结 Production 参数模板。

Production 数据迁移和切流仍是 N7 之后的单独生产操作，不因 Staging 通过而自动授权。

## 6. 并行波次

遵守仓库“最多三个并行写入单元”的约束。

```text
Wave 0（串行）
  N0 蓝图与契约基线
          |
          v
Wave 1（最多三个并行 worktree）
  N1 Helm       N2 App Readiness       N3 Tencent IaC
       \              |                /
        \             |               /
         +------ 集成基线 1 ----------+
                       |
                       v
Wave 2（最多两个并行 worktree）
  N4 Tooling/CI                 N5 Operations
          \                     /
           +---- 集成基线 2 ---+
                       |
                       v
Wave 3（串行）
  N6 本地集成验收与缺陷回流
                       |
                       v
Wave 4（未来、需外部授权）
  N7 TKE Staging 验证
```

并行不等于同时修改共享文件。各节点只写自己的独占路径；跨节点需求先更新契约或在集成点处理。

## 7. Worktree 创建建议

先把 N0 蓝图作为共同基线提交，再从同一 commit 建立 Wave 1 worktree。不要从含未提交改动的目录直接复制。

示例命令仅供执行时使用，本轮不自动创建：

```powershell
New-Item -ItemType Directory -Force G:\xlb100-worktrees | Out-Null

git worktree add G:\xlb100-worktrees\tke-chart `
  -b codex/tke-chart <N0_BASE_COMMIT>

git worktree add G:\xlb100-worktrees\tke-app-readiness `
  -b codex/tke-app-readiness <N0_BASE_COMMIT>

git worktree add G:\xlb100-worktrees\tke-infra `
  -b codex/tke-infra <N0_BASE_COMMIT>
```

Wave 2 必须从“集成基线 1”创建，而不是继续从 N0 创建：

```powershell
git worktree add G:\xlb100-worktrees\tke-tooling `
  -b codex/tke-tooling <INTEGRATION_BASE_1>

git worktree add G:\xlb100-worktrees\tke-operations `
  -b codex/tke-operations <INTEGRATION_BASE_1>
```

## 8. 合并顺序与门禁

### 集成基线 1

建议顺序：

1. N2 App Readiness。
2. N1 Helm。
3. N3 Tencent IaC。

原因：先确定实际应用契约，再验证 Chart 使用的 Probe、Secret 和 COS 参数；IaC 路径独立，可最后合入。

门禁：

- N2 相关单元/契约/build/typecheck。
- N1 lint/template/schema。
- N3 fmt/validate。
- 仓库相关回归。

### 集成基线 2

建议顺序：

1. N4 Tooling/CI。
2. N5 Operations。

门禁：统一离线入口能够验证 N1-N5 所有产物，CI 不含云凭据和外部 apply。

### 最终本地候选

N6 只能在集成基线 2 上施工。发现问题时不在验收分支越权修改产品文件，而是回流对应 N1-N5 分支修复，再重新集成验证。

## 9. 每个节点开工前必须通知 Human 的内容

每个节点开始前先报告：

1. 本节点目标和明确不做的事项。
2. 独占修改路径和共享热点。
3. 输入依赖和预期输出。
4. 风险类别，是否需要本地高风险确认或外部操作确认。
5. 验收命令和完成标准。
6. 是否与其他 worktree 并行、是否存在语义冲突。

施工中如果新增路径、扩大风险范围或改变跨分支契约，先暂停相关部分并通知 Human，不静默扩大范围。

## 10. 当前节点的完成定义

本轮 N0 只在以下条件满足时完成：

- [ ] 总体架构已写入仓库。
- [ ] 目标工程目录和主责节点已明确。
- [ ] 跨分支契约已冻结。
- [ ] Wave 1-Wave 4 依赖关系清楚。
- [ ] worktree 分支和路径建议已给出。
- [ ] 合并顺序和验收门槛已定义。
- [ ] 仓库中没有提前写入的半成品 Helm/Terraform 实现。
- [ ] Human 已看到蓝图，再决定是否启动 N1-N3。
