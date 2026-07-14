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

- Business Train：`DRAFT → CHARTER_HUMAN_APPROVED → ASSEMBLING → TRAIN_VERIFIED → HUMAN_ACCEPTED → PHASE_LOCKS_COMPLETED → CLOSED`。
- Validation Train：`PLANNED → VALIDATION_AUTHORIZED → TRAIN_VERIFIED`；它不产生业务 WRITE authority。
- Work Unit：`PLANNED → WAITING_DEPENDENCY | CONTRACT_FROZEN → CONSTRUCTION_AUTHORIZED → IN_CONSTRUCTION → PACKAGE_VERIFIED → PACKAGE_AUDITED → QUEUED → INTEGRATED → CLOSED`。
- Work Unit 只有 package/candidate 已形成后才可进入 `STALE`；其他非终态按 strict transition graph 进入 `BLOCKED` 或 `ABANDONED`，不得从文字说明推断跳转。
- `VALIDATION_ONLY` 是执行模式，不是业务施工状态；它只能验证 worktree、Compose、MySQL、Redis 与端口隔离。
- `WAITING_HUMAN_APPROVAL` 表示没有施工权限。不得用 registry、manifest、测试通过或 Audit PASS 替代 Human 批准。

## Work Unit Manifest 最低字段

每个 manifest 必须记录：`workUnitId`、`trainId`、`targetPhase`、`owner`、`role`、`status`、`previousStatus`、`statusChangedAt`、`transitionAuthorityRef`、`executionMode`、`worktreePath`、`branch`、`baseCommit`、`dependencies`、`allowedPaths`、`forbiddenPaths`、`semanticOwnership`、`contractRevision`、`migrationReservation`、`leaseRefs`、`environment`、`evidencePlan`、`auditRefs`、`businessWriteAuthorized`、`createdAt` 与 `expiresOrClosesAt`。

上述字段是机器必填项，不是说明性清单。`dependencies`、`allowedPaths`、`forbiddenPaths` 与 `auditRefs` 可以按阶段为空，但必须以数组显式存在；`semanticOwnership` 与 `evidencePlan` 必须为非空数组。删除字段、以错误类型代替或依赖默认值均 fail closed。

所有 registry、Train、Work Unit 与 queue 状态变化必须引用 `governance/execution/transitions/` 下的 strict `TRANSITION` JSON；普通 Markdown、任意 clean 文件或仅有文字说明不构成 transition authority。记录必须绑定 subject、Train/Work Unit identity、前后状态、时间、决策角色与 `LEGAL_STATUS_EDGE_VERIFIED`。

环境至少包含 `slot`、固定且被 Git ignore 的 `envFileName`、canonical `composeOverrideRef`，以及唯一 `composeProject`、`mysqlDatabase`、`mysqlPort`、`redisNamespace`、`redisPort`、`backendPort`、`customerPort`、`workerPort` 与 `adminPort`。三个 validation manifest 固定绑定 Phase 29 canonical tag 解引用后的 commit `80921871baf8647b2d3b7c97f8c0fde2a88f9400`；annotated tag object 不得冒充 base commit。

## Human machine confirmations

以下中文是 Gate 接受的精确书面确认；同义改写、沉默或推断均不通过：

- 治理执行系统启用：`同意启用治理执行系统`
- Release Train 业务施工：`同意执行该 Release Train 业务施工`
- Runtime Canary 验证：`同意执行 Runtime Canary 验证`

## Lease 与 Reservation

- Path lease 与 semantic lease 都必须无冲突；路径不同不代表业务真相不同。
- Contract、canonical runtime、migration ledger、global configuration、governance metadata、main/tag/Lock 始终走 serial lane。
- Business Work Unit 从 `CONTRACT_FROZEN` 起必须与 Train 的 `frozenContractRevision`、strict `CONTRACT_FREEZE_AUTHORITY` record 和 canonical contract protected-path digest 完全一致。冻结 revision 之后任何 protected contract path material change 都使施工、package、evidence 与 queue 状态自动 `STALE`；一致地自报旧 revision 不能替代 current contract authority。
- 没有有效 migration reservation 不得创建 migration 文件；编号一旦预约即不复用，`ABANDONED` 形成永久空洞；历史保留号 `024` 永久不可用。
- Reservation Ledger 使用 schema v2：每条记录必须有严格 ISO-8601 `createdAt`、生命周期 `reason`；`RESERVED/MATERIALIZED` 的 `closedAt` 必须为 `null`，`MERGED/ABANDONED` 必须有不早于 `createdAt` 的 `closedAt`。历史 024 的时间只表示本台账登记时间，不声称是原始空洞形成时间。

## Integration Queue

队列是人工串行队列。当前为 `NOT_ENABLED`。启用后，队列也只接受 clean、immutable candidate commit；入队前必须验证 worktree clean、candidate commit 固定且可解析、manifest、lease、contract revision、migration reservation、package evidence 与 package audit。存在未提交或 untracked candidate 内容时不得入队。冲突、越 lease、STALE 或 material change 必须退回原 Work Unit，Integration Owner 不得顺手修改业务语义。

Enablement authority records 必须先进入 audited candidate 的直接子提交 `authorityEnvelopeCommit`，该 envelope 只允许新增声明的 approval/audit/Human/transition records；随后仅允许一个 registry/queue 状态切换提交。Gate 从 envelope commit 重新读取完整 record、比较 canonical digest 与 blob 内容，任何事后改写均 fail closed。Package evidence/audit 同时以 canonical record digest 与 HEAD blob identity 绑定，并由 queue 逐项复核。

当前队列为空；Phase 30/31 Charter 获得独立 Human 明确批准前，不得加入业务 candidate。
