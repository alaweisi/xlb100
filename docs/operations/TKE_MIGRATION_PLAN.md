# XLB 从 Lighthouse Docker Compose 迁移到腾讯云 TKE 的施工方案

状态：**方案已入库 / 尚未创建任何 TKE 或腾讯云资源 / 尚未执行生产迁移**

分支施工、目录所有权、并行波次与开工通知规则见：

- `docs/operations/TKE_DELIVERY_LINE_BLUEPRINT.md`

本文用于回答两件事：

1. XLB 在现有工程目录中还需要增加哪些 Kubernetes、Helm、云资源与运维能力。
2. 如何在不影响当前 Lighthouse Docker Compose 的前提下，分阶段完成本地验证、TKE Staging、生产迁移和回滚。

本文不是部署结果，也不代表 TKE、TCR、CLB、云数据库、Redis、COS、Secret 或生产域名已经开通。

## 1. 结论与实施原则

- 当前 Lighthouse 继续作为现有运行环境，不因 Helm/TKE 建设而停机。
- 复用现有 Dockerfile、容器镜像、环境变量契约、健康接口和三个前端应用，不重写业务系统。
- Helm Chart 是 Kubernetes 应用配置的唯一维护源；不并行手工维护一套重复 manifests。
- 首先只在仓库和本地 Kubernetes 中施工，不产生腾讯云 TKE 费用。
- 本地通过后再创建 TKE Staging；Staging 通过后才允许规划 Production。
- 正式切换采用新旧环境并行、灰度切流和可回退方式，不执行“大爆炸式”停旧换新。
- MySQL migration、正式数据搬迁、真实 Provider、生产部署和 Lighthouse 下线分别执行风险确认。

## 2. 当前已有基础

当前并非从零开始，已经具备以下迁移基础：

| 已有能力 | 当前位置 | 对 TKE 的价值 |
|---|---|---|
| 后端生产镜像 | `infra/docker/Dockerfile.backend` | 可直接作为 backend/jobs 镜像来源 |
| 三端前端镜像 | `infra/docker/Dockerfile.frontend` | 可直接作为 customer/worker/admin 镜像来源 |
| 本地 Compose | `deploy/compose/docker-compose.local.yml` | 保留日常开发方式 |
| Staging Compose | `deploy/compose/docker-compose.staging.yml` | 提供服务拓扑和环境变量参考 |
| Production Compose | `deploy/compose/docker-compose.prod.yml` | 提供安全、资源、Secret 和镜像约束参考 |
| 不可变镜像要求 | Production Compose 和部署脚本 | Helm 生产 values 继续使用 digest |
| Backend 健康与指标接口 | `/health`、`/metrics` | 可转化为 Probe 和监控抓取 |
| Backend 优雅退出 | `backend/src/server.ts` | Pod 终止时可关闭 HTTP/Redis |
| Job Worker 优雅退出 | `backend/src/jobWorker.ts` | Pod 终止时可停止任务、流消费、MySQL/Redis |
| 外部 MySQL/Redis 生产契约 | `.env.production.example` | 可对接云 MySQL 和云 Redis |
| Secret 文件读取契约 | Production Compose | 可对接 CSI/Secret 文件挂载 |
| 生产检查、回滚、Smoke 脚本 | `deploy/production/` | 可复用验证意图，需增加 TKE 版本 |

## 3. 当前明确缺口

以下能力尚未落地，不能把它们描述为“已经支持 TKE”：

1. 仓库内没有 Helm Chart 或 Kubernetes manifests。
2. 没有本地 Kubernetes 的安装、渲染、校验和 Smoke 脚本。
3. 没有 TKE Staging/Production values。
4. 没有 TCR 镜像发布流水线和 digest 晋级流程。
5. 没有 TKE Ingress/CLB、TLS、DNS 和 WebSocket 的实际配置。
6. 没有 TKE ServiceAccount、RBAC、NetworkPolicy、Pod 安全策略。
7. 没有 TKE 日志、指标、告警、容量和费用告警配置。
8. 没有 Kubernetes 版数据库 migration Job 和人工门禁。
9. 没有 Lighthouse 到云 MySQL/Redis/COS 的数据迁移与校验方案。
10. 没有 TKE 生产切流、回滚和 Lighthouse 下线 Runbook。
11. 当前对象存储只支持 `local|mock`，没有 COS 或其他真实共享对象存储实现。

第 11 项是多副本运行的硬阻塞项。Pod 本地文件会随着重建、迁移而丢失，也不能保证其他 backend Pod 可以读取，因此上传凭证等对象在 TKE Production 前必须迁移到共享对象存储。当前事实见 `docs/contracts/CONTRACT_OBJECT_STORAGE_PROVIDER.md`。

## 4. 目标部署拓扑

```text
用户
  |
  v
DNS / HTTPS
  |
  v
腾讯云 CLB + TKE Ingress
  |-- api.<domain> ------ backend Service ------ backend Pods
  |-- customer.<domain> - customer Service ---- customer Pods
  |-- worker.<domain> --- worker Service ------ worker Pods
  `-- admin.<domain> ---- admin Service ------- admin Pods

jobs Deployment（无公网 Service，初期 replicas=1）
  |-- 云 MySQL
  |-- 云 Redis
  `-- COS/共享对象存储

backend/jobs
  |-- Secret 文件挂载
  |-- CLS 日志
  `-- Prometheus/云监控指标与告警
```

生产环境不把 MySQL、Redis 放入 XLB 应用 Chart。它们是外部托管依赖；本地测试可以继续使用 Compose 中的 MySQL/Redis。

## 5. 仓库需要新增的目录与文件

以下是目标结构。标记为“后续新增”的文件当前尚未创建，不能视为已实现。

```text
deploy/
  helm/
    xlb/
      Chart.yaml                         # 后续新增：Chart 元数据
      values.yaml                        # 后续新增：安全、无云厂商绑定的默认值
      values.schema.json                 # 后续新增：values 结构校验
      templates/
        _helpers.tpl                     # 后续新增：名称、标签、镜像辅助模板
        serviceaccount.yaml              # 后续新增：工作负载身份
        backend-deployment.yaml          # 后续新增
        backend-service.yaml             # 后续新增
        jobs-deployment.yaml             # 后续新增
        frontend-deployments.yaml        # 后续新增：或按三端拆分
        frontend-services.yaml           # 后续新增：或按三端拆分
        ingress.yaml                     # 后续新增：本地/TKE 可配置
        configmap.yaml                   # 后续新增：非敏感配置
        secret-volumes.yaml              # 后续新增：只引用 Secret，不提交真实值
        networkpolicy.yaml               # 后续新增
        poddisruptionbudget.yaml         # 后续新增
        servicemonitor.yaml              # 后续可选
        migration-job.yaml               # 后续新增：默认关闭，显式执行
      tests/                              # 后续新增：helm-unittest 或渲染断言
      README.md                           # 后续新增：Chart 使用说明
  environments/
    tke/
      values-local.yaml                  # 后续新增：kind/k3d
      values-staging.yaml                # 后续新增：无 Secret、无真实账号 ID
      values-production.yaml             # 后续新增：无 Secret、镜像只接收 digest
      README.md                           # 后续新增：环境差异与非 Git 配置
  tke/
    README.md                             # 后续新增：TKE 创建和依赖资源说明
    render.ps1                            # 后续新增：lint/template/schema 校验
    deploy-local.ps1                      # 后续新增：本地安装
    deploy-staging.ps1                    # 后续新增：默认 dry-run
    deploy-production.ps1                 # 后续新增：默认 dry-run + 明确确认
    smoke-tke.ps1                         # 后续新增
    rollback-tke.ps1                      # 后续新增
    migrate-tke.ps1                       # 后续新增：显式 migration Job 控制
    cutover-runbook.md                    # 后续新增：切流/回滚步骤

infra/
  tencent/
    README.md                             # 后续新增：账号、地域、VPC、TKE、TCR 等清单
    terraform/                            # 后续可选：获得云资源创建授权后再添加

.github/workflows/
  helm-chart-check.yml                    # 后续新增：只做静态校验，不部署云端
```

真实 Secret、腾讯云 SecretId/SecretKey、数据库密码、证书私钥、TCR 登录凭据、生产 kubeconfig 和真实 `.env.production` 不得进入 Git。

## 6. Helm Chart 需要承载的工作负载

### 6.1 Backend

需要新增：

- `Deployment`，Production 初期建议至少 2 个副本，在节点资源与状态外置完成后启用。
- `ClusterIP Service`，只对集群内和 Ingress 暴露。
- startup/readiness/liveness Probe；在实施前确认 `/health` 是否适合作为三种 Probe，必要时拆分“进程存活”和“依赖就绪”。
- `preStop` 与足够的 `terminationGracePeriodSeconds`，验证 WebSocket 和进行中请求退出行为。
- CPU/内存 requests、limits。
- 非 root、只读根文件系统、移除 Linux capabilities、禁止提权。
- ConfigMap 注入非敏感配置，Secret 以文件挂载。
- Prometheus 抓取或腾讯云监控接入。

### 6.2 Jobs

`backend/dist/jobWorker.js` 是长期运行的消费者，因此使用 `Deployment`，不是一次性 `Job`。

需要新增：

- 初期固定 `replicas: 1`。
- 不创建公网 Service。
- 保留 SIGTERM 优雅退出和足够的终止宽限期。
- 使用现有心跳指标告警。
- 在确认任务幂等、Redis Stream 消费者语义和分布式互斥前，不启用 HPA 或多副本。
- Lighthouse 与 TKE 并行切换时，只允许一侧 jobs 消费，或先证明双运行不会重复产生业务副作用。

### 6.3 Customer / Worker / Admin

每个前端需要：

- 独立 Deployment 和 ClusterIP Service。
- 对 `/` 的 HTTP Probe。
- 小规格 requests/limits。
- 可配置副本数。
- 生产域名分别路由，避免依赖 Staging Nginx 的 HTML `sub_filter`。
- 明确构建期 `APP_BASE` 与生产域名策略；同一镜像不能在启动后随意改变 Vite 构建期 public base。

### 6.4 Ingress

需要覆盖：

- `api`、`customer`、`worker`、`admin` 域名。
- HTTPS 和证书绑定。
- `/api/support/realtime` WebSocket 升级和超时。
- 请求体上限至少覆盖当前 5 MiB 上传并保留合理余量。
- 真实客户端 IP、`X-Forwarded-*` 与 `TRUST_PROXY_HOPS`。
- Backend `/metrics` 不得暴露到公网。
- 腾讯云 `qcloud` IngressClass 和 CLB annotations 只放在 TKE values，不写死在通用模板。
- CLB 生命周期保护，避免删除 Helm release 时误删需要保留的公网入口。

### 6.5 数据库 Migration

需要新增一个默认禁用、显式触发的一次性 Kubernetes Job：

- 不允许每个 backend Pod 启动时自动跑 migration。
- 不把 migration 无条件做成 Helm install/upgrade hook。
- 执行前备份、检查 migration 完整性、确认目标数据库。
- 只允许一个 migration Job 执行。
- 使用与待发布 backend 相同的不可变镜像 digest。
- 保存 Job 日志、migration 版本和校验结果。
- 失败后停止应用晋级，不自动反复修改生产 schema。

数据库 schema、migration 和正式数据操作属于高风险工程，实施时必须按项目规则单独确认。

## 7. 腾讯云需要开通或配置的资源

### 7.1 必需资源

| 资源 | 用途 | 费用触发点 |
|---|---|---|
| TKE 标准托管集群 | Kubernetes 控制面 | 集群创建完成后 |
| CVM/原生节点或超级节点 | 运行 Pods | 节点或 Pod 资源启用后 |
| CBS | 节点系统盘/数据盘 | 云硬盘创建后 |
| TCR | 存储 backend/三端镜像 | 企业版实例、COS/流量使用后 |
| CLB | Ingress 公网入口 | 实例、LCU、带宽/流量使用后 |
| 云 MySQL | 正式关系数据 | 实例创建后 |
| 云 Redis | 限流、OTP、任务和 Stream | 实例创建后 |
| COS 或等价共享对象存储 | 上传凭证等对象 | 存储、请求、流量使用后 |
| DNS/TLS | 正式域名和 HTTPS | 域名、付费证书或高级解析购买后 |

### 7.2 建议资源

- CLS 日志服务与保留策略。
- Prometheus/云监控和 Grafana。
- 告警通知渠道与费用阈值告警。
- Secret Manager/KMS 或兼容的 CSI Secret 方案。
- WAF；在公网生产发布前根据风险决定。
- 数据库备份、回档、跨可用区和灾备策略。

### 7.3 云资源施工前必须冻结的参数

- 腾讯云账号与项目归属。
- 地域和可用区。
- VPC、子网和网段，避免与现有网络冲突。
- TKE 版本、运行时、集群规格和节点规格。
- Staging 与 Production 使用同集群不同 Namespace，还是独立集群。
- TCR 个人版/企业版选择和镜像保留策略。
- MySQL/Redis 规格、高可用、备份和白名单。
- CLB 是否复用、生命周期归属、带宽计费方式。
- 域名、备案、证书和 DNS TTL。
- Secret 保存与轮换责任人。

## 8. 应用层必须补齐或确认的施工

### 8.1 共享对象存储

当前只允许 `local|mock`，需要单独实现并验证 COS Provider：

- 扩展 `packages/types`、`packages/validators`、`packages/config` 和 backend Provider 实现。
- 保持私有对象，下载仍经过授权 API 或使用短时签名 URL。
- 处理上传、读取、删除、超时、重试、幂等、校验和与错误映射。
- 建立 Sandbox/测试环境契约测试。
- 设计现有 Lighthouse 本地对象到 COS 的搬迁、校验与回退。
- 真实 Provider 凭据只从 Secret Manager 注入。

真实 COS 接入和生产凭据属于独立外部 Provider 施工，不包含在单纯的 Helm Chart 编写中。

### 8.2 Probe 语义

- liveness 只判断进程是否僵死，不应因 MySQL 短时故障反复重启全部 Pod。
- readiness 判断是否可以接收流量，可以包含关键依赖检查。
- startup 为慢启动提供保护。
- 如果现有 `/health` 混合了多种语义，新增专用端点并补测试。

### 8.3 WebSocket 与优雅退出

- 验证滚动升级时现有 WebSocket 的关闭和重连。
- 设置 Ingress idle/read/send timeout。
- Backend 从 readiness 摘除后再结束连接。
- 验证 `terminationGracePeriodSeconds` 足够完成清理。

### 8.4 无状态与持久状态盘点

- 禁止把业务数据写入 Pod 根文件系统或 `/tmp` 后假设长期存在。
- 盘点上传文件、临时导出文件、缓存和运行时生成文件。
- MySQL、Redis、对象文件必须在切换前有备份和恢复演练。

### 8.5 安全与配置

- Production 只允许镜像 digest。
- Pod 不使用默认 ServiceAccount 权限。
- Secret 不出现在 values、ConfigMap、日志和 CI 输出。
- Namespace、RBAC、NetworkPolicy 最小权限。
- Admin 域名根据需要增加来源限制、身份代理或 WAF 策略。
- `/metrics`、数据库和 Redis 只走内网。

## 9. 分阶段施工与验收门槛

### Phase 0：现状盘点，不改变运行环境

交付物：

- Lighthouse 当前容器、端口、volume、数据库、Redis、对象文件和域名清单。
- 当前数据量、备份大小、RTO/RPO 和可接受停机窗口。
- 现有云资源与月账单基线。

验收：能够回答“数据在哪里、坏了怎么恢复、切换失败如何回去”。

### Phase 1：仓库内 Helm 骨架与静态校验

交付物：

- `deploy/helm/xlb`。
- local/staging/production values 骨架，不含 Secret。
- `helm lint`、`helm template`、schema 校验和 CI。
- 生成 manifests 的快照或关键断言。

验收：不连接腾讯云也能稳定渲染所有资源；生产 values 缺少 digest/必要参数时必须失败。

### Phase 2：本地 Kubernetes 验证

交付物：

- kind/k3d/Docker Desktop Kubernetes 安装脚本与说明。
- backend、jobs、三个前端均可运行。
- Ingress、WebSocket、Probe、重启、升级、回滚 Smoke。
- 本地继续使用 Compose MySQL/Redis，或使用独立的测试依赖 Chart；不把数据库加入生产 Chart。

验收：删除 backend Pod 后自动恢复，滚动升级期间核心 HTTP 路径可用，失败 release 可以回滚。

### Phase 3：应用 TKE Readiness

交付物：

- COS Provider 与迁移工具，或经确认的其他共享对象存储方案。
- Probe 语义完善。
- jobs 单副本/多副本策略证明。
- Secret 文件挂载验证。
- TCR digest 构建和晋级流程。

验收：应用不依赖单 Pod 本地持久文件，镜像与配置可在任意节点重建。

### Phase 4：TKE Staging

外部操作开始前需要用户明确授权，因为会创建收费云资源。

交付物：

- TKE、节点、TCR、CLB、测试 MySQL/Redis、COS、Secret、TLS。
- `xlb-staging` Namespace 和 Helm release。
- CLS/指标/告警。
- 云端功能、性能、故障和回滚演练报告。

验收：至少完成一次升级、一次失败回滚、一次 Pod/节点故障演练和一次数据库恢复演练。

### Phase 5：生产数据迁移演练

交付物：

- Lighthouse MySQL 到云 MySQL 的全量/增量策略。
- Redis 中哪些数据需要搬迁、重建或自然过期的清单。
- 本地对象到 COS 的复制与 checksum 校验。
- migration Job 演练。
- jobs 单活切换步骤。

验收：在非生产副本数据上完成端到端演练，给出实际耗时、校验结果和回退点。

### Phase 6：TKE Production 与灰度切换

生产部署前需要单独的明确授权。

交付物：

- Production Helm release，不先承接公网流量。
- 云内 Smoke、数据库版本校验、监控绿灯。
- DNS/CLB 灰度切流：建议 5% -> 25% -> 50% -> 100%，或按域名/用户群切换。
- Lighthouse 保留一个观察窗口。
- 回滚演练和当班责任人。

验收：业务、错误率、延迟、任务积压、数据库和 Redis 指标稳定，且回滚路径仍可用。

### Phase 7：Lighthouse 下线

这是单独的外部和破坏性操作，不随 TKE 上线自动授权。

交付物：

- 最终备份与恢复验证。
- DNS、证书、定时任务、volume 和对象文件确认无残留依赖。
- 费用资源清单和释放记录。

验收：经过约定观察期，没有流量、任务、数据或回滚依赖后再释放。

## 10. 发布、切流和回滚规则

### 10.1 镜像晋级

```text
同一次构建
  -> TCR 镜像 digest
  -> local/staging 验证同一 digest
  -> production 使用同一 digest
```

禁止在 Staging 验证 tag A、Production 重新构建 tag B。

### 10.2 应用回滚

- Helm release 保留历史。
- 新版本 Probe 或 Smoke 失败时停止切流。
- 无数据库不兼容变更时，可 `helm rollback` 到上一 revision。
- 如果本次包含 schema 变化，应用回滚必须遵循 expand/contract 兼容窗口，不能假定数据库可以直接降级。

### 10.3 流量回滚

- DNS TTL 在切换前按计划降低。
- CLB/DNS 保留快速指回 Lighthouse 的操作步骤。
- 切换期间 Lighthouse backend 可以保持待命，但 jobs 默认只保留一侧活跃。
- 一旦产生只能由新版本理解的数据，必须先评估旧版本是否还能安全接管。

### 10.4 数据回滚

- 切换前备份并验证可恢复。
- 明确流量切换后的写入归属。
- 禁止在两个可写 MySQL 主库之间依赖人工复制来保证一致性。
- 回滚方案需要定义新环境写入如何处理，不能只写“把 DNS 改回去”。

## 11. 验收清单

### 仓库与 Chart

- [ ] `helm lint` 通过。
- [ ] 所有环境 `helm template` 通过。
- [ ] values schema 拒绝缺少 digest、端口、域名和资源限制的 Production 配置。
- [ ] 渲染结果没有明文 Secret。
- [ ] 镜像使用 `@sha256:` digest。
- [ ] Kubernetes 标签和 selector 稳定一致。

### 应用运行

- [ ] Backend startup/readiness/liveness 语义验证。
- [ ] 三端前端 Probe 通过。
- [ ] WebSocket 连接、断线重连和滚动升级通过。
- [ ] jobs 单活、优雅退出、积压和心跳告警通过。
- [ ] 上传文件不依赖 Pod 本地持久磁盘。
- [ ] Backend/Jobs 可以在新节点重建。

### 安全

- [ ] 非 root、禁止提权、只读根文件系统、capabilities 收紧。
- [ ] ServiceAccount/RBAC 最小权限。
- [ ] NetworkPolicy 只开放所需流向。
- [ ] Secret 仅通过批准的外部存储或 Secret 文件挂载。
- [ ] `/metrics`、MySQL、Redis 无公网暴露。
- [ ] Admin 入口保护策略已确认。

### 运维

- [ ] 日志包含 release、Pod、请求关联信息且不含 Secret。
- [ ] CPU、内存、重启、错误率、P95/P99、任务积压有告警。
- [ ] MySQL、Redis、COS、CLB 和 TKE 有费用阈值告警。
- [ ] 数据库备份恢复演练通过。
- [ ] Helm 和流量回滚演练通过。
- [ ] Runbook 中有责任人、时间窗和停止条件。

## 12. 工作量粗估

以下为有 Kubernetes/TKE 经验工程师的粗估，不包含公司主体、备案、采购等待时间：

| 工作包 | 粗估 |
|---|---:|
| Helm Chart、values、静态检查 | 3-5 人日 |
| 本地 Kubernetes、Smoke、回滚 | 1-3 人日 |
| Probe、对象存储、任务与无状态化补齐 | 3-8 人日 |
| TKE Staging 云资源与联调 | 3-7 人日 |
| 数据迁移演练和生产切换 | 3-8 人日 |
| 基础合计 | 13-31 人日 |

如果暂不接入真实 COS、没有正式数据、只做本地 Helm 骨架，第一批可以控制在约 4-8 人日内；但该结果不能称为 Production Ready。

## 13. 推荐的下一施工批次

在不创建腾讯云资源、不影响 Lighthouse 的前提下，下一批只做：

1. 新建 `deploy/helm/xlb` Chart 骨架。
2. 新建 local/staging/production values schema 与占位配置。
3. 映射 backend、jobs、customer、worker、admin、Service 和 Ingress。
4. 增加 Helm lint/template/schema 检查。
5. 在本地 kind/k3d 中安装并执行 Smoke。
6. 输出第一版 gap report，确认 Probe、COS、WebSocket 和 jobs 的实际缺口。

该批次不会：

- 创建 TKE/TCR/CLB/CVM/MySQL/Redis/COS。
- 产生腾讯云新增费用。
- 修改生产数据库。
- 部署真实 Provider。
- 切换域名或停止 Lighthouse。

完成本批后，再根据 gap report 决定是否进入应用 Readiness 和 TKE Staging。

注意：实际施工不在单一工作区连续堆叠，必须按 `TKE_DELIVERY_LINE_BLUEPRINT.md` 的 N1-N6 节点和 worktree 波次执行。
