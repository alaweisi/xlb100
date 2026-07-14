# XLB 治理执行系统植入候选报告

> 日期：2026-07-14（Asia/Shanghai）
> 状态：`BOOTSTRAP / NOT_ENABLED`
> Branch：`codex/governance-execution-system`
> Phase 事实：Phase 29 已锁定；未改变 `docs/CURRENT_STATE.md`、Phase registry、tag 或 Lock

## 1. Human 授权

Human Owner 明确授权把工程治理宪法植入项目执行系统并纳入正式版本控制。该授权覆盖治理文档、`AGENTS.md`、本地人工 Gate、Agent Skill、Train/Work Unit/Lease/Migration/Queue 台账、受管工棚隔离模板与验证脚本。

该授权不包含 Phase 30/31 业务 runtime、migration `058+`、hosted CI、main merge、Lock、push/deploy、Provider 或 production。Phase 30/31 Train 保持 `DRAFT / WAITING_HUMAN_APPROVAL`。

## 2. 已植入控制

- 正式宪法索引与 01/04/06 规范性文件；
- `AGENTS.md` 的 canonical root、managed worktree pool、Human Authority、并行/串行边界和交互式裁决规则；
- `xlb-managed-worktree` 强制 Skill；
- Train Registry、Work Unit Manifest、WORKTREE_PATH/SOURCE_PATH/SEMANTIC/CANONICAL_WRITER/ENVIRONMENT/PORT Lease；
- Migration Reservation Ledger 与人工串行 Integration Queue；
- Manifest 驱动的 Worktree Compose、MySQL、Redis 与六类端口隔离；
- Repository/WorkUnit 两模式本地 Gate，覆盖 commit/tag、Charter/authority、lease、reservation、staged/unstaged/untracked 和 clean immutable queue candidate；
- 三工棚静态隔离与 Runtime Canary 脚本；Runtime Canary 尚未获 Bootstrap 审计通过，因此未执行。

## 3. Git 与基线证据

- canonical Phase 29 tag：`xlb-phase29-marketing-coupon`；
- annotated tag object：`b444aeb85c8d1264b21b38838524e21ceaea949e`；
- tag 解引用 commit / canonical base：`80921871baf8647b2d3b7c97f8c0fde2a88f9400`；
- Gate 强制 `baseCommit` 的 Git object type 必须为 `commit`，且 `baseTag^{}` 必须等于 `baseCommit`；tag object 不得冒充 commit。

## 4. Candidate 验证

执行并通过：

```text
pnpm check:managed-worktree
check-managed-worktree-boundaries: Repository passed
(3 manifests, 35 active leases, 1 reservations)

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-managed-worktree-isolation.ps1
PASS managed worktree manifest/train/lease/static isolation

governance/execution/**/*.json parse
PASS — 7 files

git diff --check
PASS
```

未执行：Runtime Canary、managed worktree 创建、业务测试、migration、hosted CI、preflight 接入、main merge、Phase Lock。

## 5. Enablement Gate

Execution Registry 只有同时满足下列条件才能从 `BOOTSTRAP / NOT_ENABLED` 切换：

1. 本候选形成 clean immutable commit；
2. 独立只读审计 PASS，P0/P1/P2 为零；
3. Human Owner 明确确认启用治理执行控制。

Authority closure 采用两提交模型：先在 audited candidate 的直接子提交中只新增 exact authority/transition records，形成 `authorityEnvelopeCommit`；再以唯一一个后继提交切换 registry/queue 状态。Gate 必须从 envelope commit 重读 record 全文并核对 canonical digest，禁止启用后改写 record identity、checks 或任何其他字段。

任何状态变化必须引用 strict `TRANSITION` record；Business Work Unit 从 `CONTRACT_FROZEN` 起必须绑定 Train 级 frozen contract authority 与 protected-path digest。Manifest 最低字段为机器必填，不能依赖说明文档或默认值补全。

即使治理执行控制启用，Phase 30/31 业务施工仍须由 Human Owner 对最终 Train Charter 单独明确批准。治理启用不得被解释为 Phase、main、Lock、production 或 Provider authority。
