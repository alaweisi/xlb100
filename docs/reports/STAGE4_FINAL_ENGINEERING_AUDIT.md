# Stage 4 最终工程审计与本地预生产验收

日期：2026-07-16
结论：**阶段 4 工程施工完成；本地预生产模拟验收通过；生产上线仍为 NO-GO。**

本报告只依据当前代码、Git 集成结果和本轮可执行验证，不引用第三方审计报告。全程未接入真实 Provider，未执行 push、deploy、生产迁移、生产数据或其他外部操作。

## 1. 工程范围与架构

当前仓库是一个 pnpm/Turbo Monorepo，共 14 个 workspace package。Git 跟踪文件主要分布为：`tests` 423、`docs` 352、`backend` 292、`scripts` 289、`packages` 165、`apps` 104、`db` 89、`infra` 12、`deploy` 12。

```mermaid
flowchart LR
  C[Customer Web] --> API[@xlb/api-client]
  W[Worker Web] --> API
  A[Admin Web] --> API
  OA[OA readiness shell] -. no approved runtime .-> API
  D[Dashboard readiness shell] -. no approved runtime .-> API

  API --> B[Fastify backend]
  T[types + validators] --> API
  T --> B
  CFG[config] --> B
  UI[shared + ui + module-loader] --> C
  UI --> W
  UI --> A

  B --> DOM[Domain services and scoped DAL]
  DOM --> MYSQL[(MySQL)]
  DOM --> REDIS[(Redis streams / rate limit)]
  DOM --> OUTBOX[Outbox / delivery / retry]
  DOM --> P[Provider adapters]
  P --> MOCK[local/mock/blocked envelopes]
  P -. production activation prohibited .-> REAL[Real external Providers]
```

关键目录职责：

| 目录 | 工程职责 | 审计结论 |
|---|---|---|
| `apps/customer` | 客户业务与自助服务端 | 已纳入真实 API 浏览器验收 |
| `apps/worker` | 服务者接单、履约和工作台 | 已纳入真实 API 浏览器验收 |
| `apps/admin` | 城市范围后台运营 | 已纳入真实 API 浏览器验收 |
| `apps/oa`、`apps/dashboard` | OA/大屏 readiness shell | 不伪造运行时，尚不能计入生产能力 |
| `backend` | Fastify API、认证授权、领域服务、DAL、任务与可观测性 | lint/typecheck/build、回归和预检通过 |
| `packages/types`、`validators`、`api-client` | 跨端唯一共享契约 | 合同完整性门禁通过 |
| `packages/config` | 环境与 Provider 闭集配置 | Provider readiness 与运行时导出通过 |
| `packages/shared`、`ui`、`module-loader` | 跨端运行时、UI 与模块装配 | workspace 构建通过 |
| `db` | 追加式 migration、seed 与数据库工具 | 58 个 migration 全量重放和二次幂等通过 |
| `tests` | 单元、合同、集成、安全、性能与浏览器证据 | 阶段 4B/4C/4D 统一纳管 |
| `scripts` | 边界、回放、恢复、审计和统一验收入口 | 新增阶段 4B、4D 和 workspace 链接门禁 |
| `infra`、`deploy` | 环境和部署资产 | 本轮只做静态工程验证，未部署 |

## 2. 阶段施工结果

### 阶段 3：Provider 准备与模拟

- Payment、SMS、Object Storage、Geo、Enterprise Webhook 使用闭集配置。
- 所有模拟结果保持 `externalProviderExecuted=false`；真实模式和总开关保持 fail-closed。
- 正常、超时、瞬时失败、永久失败、限流、重复/乱序/非法签名等模型已进入测试。
- Provider readiness：7 个测试文件、36 项测试通过。

这只是接入前准备，不代表真实支付、短信、对象存储、地图或企业 Webhook 已可用。

### 阶段 4A：数据可靠性

- 58 个 migration 在隔离数据库中全部应用，第二次执行新增应用数为 0。
- 迁移后共 128 张表；MySQL/Redis 恢复、Outbox、支付、派单和账本检查 9/9 通过。
- 本地逻辑备份约 571,425,960 bytes，备份约 16.496 秒，隔离恢复约 105.267 秒；校验和通过，账本重复键为 0。
- Redis ACK、PEL reclaim、DLQ、重建及 Outbox claim/lease/retry/dead-letter 路径通过。

本地容量观测仍发现约 641,532 条 pending/retry Outbox，最老约 12.15 天。它不否定隔离演练正确性，但在生产候选前必须完成积压来源、消费能力和清理策略处置。

### 阶段 4B：跨端业务 E2E

- 核心真实数据库/API 生命周期：5 个文件、9 项测试通过。
- Customer、Worker、Admin 本地 Chromium 验收：11 项测试通过。
- 覆盖认证三端主流程、订单/支付 mock webhook、派单履约、客服跨角色、通知、评价信誉、营销优惠券。
- OA 与 Dashboard 因仍是 readiness shell，未用假数据伪造 E2E。

### 阶段 4C：安全、性能与故障注入

- 认证、App/Role/城市授权、限流 fail-closed、MySQL/Redis/Provider 故障模型共 38/38 通过。
- 本机 Fastify inject 基线约 p95 28.2 ms、约 3,384 req/s。
- 该数字只用于本机回归基准，不等价于公网、生产数据库或真实 Provider 容量。

### 阶段 4D：统一验收

统一入口为 `pnpm gate:stage4d`，顺序执行 workspace 链接、合同、依赖、安全、构建、Provider、4A、4C、全量回归、架构预检和 4B E2E，并在首个失败处停止。

本轮最终证据：

- workspace 链接：17 个 `@xlb/*` 链接全部落在当前仓库；
- 合同：63 个文件、270 项通过，保留 1 个历史 todo；
- 依赖：424 个 package / 475 个安装版本，无 critical+ advisory；
- workspace lint、typecheck、build：通过；
- 全量数据库/安全回归：199 个文件通过、1 个跳过，621 项通过、1 项跳过；
- 完整架构 preflight：通过至 Phase 29；
- Phase 25 历史门禁已允许 canonical `058+` 追加式 migration，同时继续拒绝非规范、倒序或破坏 locked chain 的 migration；
- 最终续跑验收：通过。

审计中发现并修复了一个真实的工程基线问题：主仓库的 `backend/node_modules/@xlb/config` 曾指向已废弃的并行 worktree，导致运行时读取旧构建产物。依赖已用冻结锁文件重建，并新增 `check:workspace-links` 门禁，防止任何 `@xlb/*` workspace 依赖逃逸到当前仓库之外。

## 3. 上线判定

| 判定层级 | 状态 | 说明 |
|---|---|---|
| 代码与共享契约基线 | PASS | lint/typecheck/build/contract 通过 |
| 本地数据可靠性 | PASS WITH BLOCKER | 演练通过，但本地 Outbox 大积压必须处置 |
| Mock Provider 准备 | PASS | 只证明 fail-closed 和模拟契约 |
| Customer/Worker/Admin 跨端业务 | PASS | 本地真实 API/MySQL/Chromium 通过 |
| 本地安全/性能/故障注入 | PASS | 只作为回归基线 |
| 本地预生产模拟验收 | PASS | 阶段 4D 统一门禁通过 |
| Staging/生产上线 | **NO-GO** | 外部、合规和生产运行条件尚不具备 |

生产 NO-GO 的真实阻塞项：

1. 公司主体、Provider 商业账户、合同责任人、ICP/发布备案尚未具备。
2. 没有生产凭据、Secret Manager 绑定、真实 Provider sandbox/contract/callback 验证。
3. 没有执行 staging 环境部署、生产拓扑容量、外网链路、证书/DNS/回调来源验证。
4. 生产备份托管、持续 binlog/PITR、Managed Redis、RPO/RTO 与恢复值班机制尚未验收。
5. Outbox 大积压必须先完成根因、消费吞吐、告警、重放/清理和容量复核。
6. `docs/CURRENT_STATE.md` 仍将 Phase 14 标记为 64/100、IN PROGRESS，staging/production NO-GO。
7. OA 和 Dashboard 尚无获批的真实运行时与业务数据源。

## 4. 后续进入真实上线准备的条件

只有在上述外部条件具备并获得新的明确授权后，才开启独立批次：选定 Provider 官方 API 版本，建立 sandbox 凭据和 Secret Manager，执行 Provider-specific contract/安全/对账/补偿测试，再进行 staging 部署、真实容量和恢复演练。真实 Provider、push、deploy、生产数据或生产迁移均不包含在本次验收中。

## 5. 可复现命令

```powershell
pnpm check:workspace-links
pnpm gate:provider-readiness
pnpm gate:stage4a
pnpm gate:stage4c
pnpm test:e2e:stage4b
pnpm gate:stage4d
```

若同一工作树的全量回归已经成功、只需从其后续验收段恢复，可使用：

```powershell
pnpm gate:stage4d -- --skip-full-regression
```
