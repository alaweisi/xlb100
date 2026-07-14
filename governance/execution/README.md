# XLB Release Train 人工执行台账

本目录是 P-01～P-18 的人工可审计执行载体。当前统一状态是 `BOOTSTRAP / NOT_ENABLED`。所有登记均 fail closed：字段缺失、引用不存在、revision 过期或资源冲突时，不得推定授权。

执行系统只有在以下三项全部完成后才可由 Human Owner 明确转换为 `ENABLED`：

1. 本次治理植入形成 clean、immutable candidate commit；
2. 独立只读 Audit Agent 对完整 candidate 与验证证据审查通过；
3. Human Owner 阅读审计结论后明确确认“启用治理执行系统”。

在此之前，manifest、lease、reservation 或 queue 文件的存在只表示 BOOTSTRAP 配置，不产生 worktree 创建、业务写、排队、merge 或 Lock 权限。

## Canonical 文件

| 文件 | 单一写者 | 用途 |
|---|---|---|
| `train-registry.json` | General Contractor Agent | Release Train 状态、Charter、Work Unit 引用与 Human 批准状态 |
| `work-units/*.json` | 对应 Construction Owner；公共状态由 General Contractor 登记 | Work Unit manifest、边界、依赖、环境与证据计划 |
| `leases.json` | General Contractor Agent | path、semantic、environment 与 canonical-writer lease |
| `migration-reservations.json` | Migration Owner | migration number/filename/table 的不可复用预约 |
| `integration-queue.json` | Integration Owner | 唯一人工串行总装队列 |

同一时刻每个台账只能有一个 designated writer。候选 Work Unit 不得直接修改 main、tag、Lock report、`CURRENT_STATE` 或 phase registry。

Phase registry 与 execution registry 严格分离：`docs/governance/phase-registry.json` 表达已发生的 Phase/Lock 事实；本目录的 `train-registry.json` 表达 Release Train/Work Unit 的准备与施工状态。两者不得自动互写，`PACKAGE_AUDITED`、`INTEGRATED`、`TRAIN_VERIFIED` 均不表示 Phase `LOCKED`。

## 状态与权限

- Train：`DRAFT → CHARTER_HUMAN_APPROVED → ASSEMBLING → TRAIN_VERIFIED → HUMAN_ACCEPTED → PHASE_LOCKS_COMPLETED → CLOSED`。
- Work Unit：`PLANNED → WAITING_DEPENDENCY | CONTRACT_FROZEN → CONSTRUCTION_AUTHORIZED → IN_CONSTRUCTION → PACKAGE_VERIFIED → PACKAGE_AUDITED → QUEUED → INTEGRATED → CLOSED`。
- 任意非终态可进入 `STALE`、`BLOCKED` 或 `ABANDONED`。
- `VALIDATION_ONLY` 是执行模式，不是业务施工状态；它只能验证 worktree、Compose、MySQL、Redis 与端口隔离。
- `WAITING_HUMAN_APPROVAL` 表示没有施工权限。不得用 registry、manifest、测试通过或 Audit PASS 替代 Human 批准。

## Work Unit Manifest 最低字段

每个 manifest 必须记录：`workUnitId`、`trainId`、`targetPhase`、`owner`、`role`、`status`、`executionMode`、`worktreePath`、`branch`、`baseCommit`、`dependencies`、`allowedPaths`、`forbiddenPaths`、`semanticOwnership`、`contractRevision`、`migrationReservation`、`environment`、`evidencePlan`、`auditRefs`、`createdAt` 与 `expiresOrClosesAt`。

环境至少包含唯一 `composeProject`、`mysqlDatabase`、`mysqlPort`、`redisNamespace`、`redisPort`、`backendPort`、`customerPort`、`workerPort` 与 `adminPort`。三个 validation manifest 固定绑定 Phase 29 canonical tag 解引用后的 commit `80921871baf8647b2d3b7c97f8c0fde2a88f9400`；annotated tag object 不得冒充 base commit。

## Lease 与 Reservation

- Path lease 与 semantic lease 都必须无冲突；路径不同不代表业务真相不同。
- Contract、canonical runtime、migration ledger、global configuration、governance metadata、main/tag/Lock 始终走 serial lane。
- 没有有效 migration reservation 不得创建 migration 文件；编号一旦预约即不复用，`ABANDONED` 形成永久空洞；历史保留号 `024` 永久不可用。

## Integration Queue

队列是人工串行队列。当前为 `NOT_ENABLED`。启用后，队列也只接受 clean、immutable candidate commit；入队前必须验证 worktree clean、candidate commit 固定且可解析、manifest、lease、contract revision、migration reservation、package evidence 与 package audit。存在未提交或 untracked candidate 内容时不得入队。冲突、越 lease、STALE 或 material change 必须退回原 Work Unit，Integration Owner 不得顺手修改业务语义。

当前队列为空；Phase 30/31 Charter 获得独立 Human 明确批准前，不得加入业务 candidate。
