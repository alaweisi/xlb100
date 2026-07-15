# RT-BASELINE-REPAIR-001 — 工程基线修复 Release Train Charter

> 状态：`DRAFT`
> Human Approval：`WAITING_HUMAN_APPROVAL`
> Execution System：`ENABLED`
> 当前权限：`NO BUSINESS CONSTRUCTION AUTHORITY`

## 通俗说明

本批次先修复工程测试与门禁基线，再讨论上线。当前只登记第一张维修单 1A；它必须串行修改 Phase 29 的两个边界脚本及其两个直接测试，不与任何修改 `scripts/**` 或 Vitest 根配置的工作单并发。1B/1C 只有在路径、语义和依赖明确后才可另行登记，整个 Train 同时最多三个普通 parallel WRITE Work Unit。

本 Charter 目前只是可审核草案。Human Owner 尚未给出机器接受的 Train 业务施工确认，因此不得创建 Worktree、创建施工 branch、写源码、运行 Runtime Canary、进入 Integration Queue 或把任何 Work Unit 推进到 `CONSTRUCTION_AUTHORIZED`。

## 基线与锁定事实

- Train ID：`RT-BASELINE-REPAIR-001`
- 目标：Engineering Baseline Repair — Stage 1
- Immutable base：`95743585bfaadb171fa8c463d3209cdce7851f9f`
- Locked-through anchor：`xlb-phase29-marketing-coupon` → `80921871baf8647b2d3b7c97f8c0fde2a88f9400`
- 最大普通并行 WRITE 工程队：`3`
- Integration Owner 串行 writer：同一 key 最多 `1` 个非终态 Work Unit，不计入 parallel WRITE 名额

## Dependency DAG

```text
START@95743585
  → 1A Phase29 test/gate baseline repair (serial Integration Owner writer)
  → package verification + independent package audit
  → SERIAL_INTEGRATION
  → full regression / preflight / integration audit
  → Human acceptance decision
```

1B/1C 当前没有 Manifest、Lease 或施工权限。后续如需修改 `scripts/**`、根级 Vitest 配置或同一测试语义，必须排在 1A 之后串行执行，不得与 1A 共享 writer。

## 已登记 Work Unit

### WU-BASELINE-1A-TEST-GATES

- Owner：`INTEGRATION-OWNER`
- Role：`SERIAL_CANONICAL_WRITER`
- Branch：`codex/rt-baseline-repair-001-1a`
- Worktree：`G:\xlb100-worktrees\RT-BASELINE-REPAIR-001\WU-BASELINE-1A-TEST-GATES`
- Canonical writer：`integration-queue-and-integration-branch`
- Canonical writer lease：`LEASE-SERIAL-INTEGRATION-QUEUE`
- Migration：`NONE`
- Contract revision：`PENDING`，进入施工前必须完成 Contract Owner freeze

允许修改且仅允许修改：

1. `tests/unit/phase29MarketingSurfaces.test.tsx`
2. `tests/security/phase29MarketingBoundaries.test.ts`
3. `scripts/check-phase29-entry-boundaries.ps1`
4. `scripts/check-phase29-marketing-coupon-boundaries.ps1`

用户最初提供的 `scripts/check-phase29-marketing-boundaries.ps1` 在基线中不存在；本 Charter 使用仓库真实路径 `scripts/check-phase29-marketing-coupon-boundaries.ps1`。

## 隔离环境预约

- Slot：`4`
- Compose project：`xlb-rt-baseline-repair-001-wu-1a`
- MySQL：`xlb_rt_baseline_repair_001_wu_1a` / `13309`
- Redis namespace / port：`rt-baseline-repair-001-wu-1a` / `16382`
- Backend / Customer / Worker / Admin：`13003 / 14473 / 14474 / 14475`
- Env file：`.env.worktree.local`，必须被 Git ignore

以上仅为排他预约，不授权创建容器、数据库、Redis、Worktree 或 branch。

## Evidence 与审计计划

1. 1A focused unit/security tests 可复现通过，记录文件数、用例数、耗时与重跑原因。
2. 不新增或隐藏 `skip`、`todo`、弱断言、吞错或 fake PASS。
3. 实际 diff 必须是四个 allowed paths 的子集。
4. Candidate 必须 clean、immutable，绑定 base、contract revision 与 environment digest。
5. 进入 Queue 前进行独立 Package Audit；P0/P1/P2 必须关闭并复审。
6. 串行 Integration lane 执行 `pnpm gate:phase29`、适用回归、build/typecheck/preflight 和 Integration Audit。

## Stop conditions

以下任一情况立即 fail closed：

- Human Train approval、Contract freeze、Construction authorization 任一缺失；
- 1A 与另一个非终态 Work Unit 同时占用 Integration Owner writer；
- 实际 diff 越出四个 allowed paths；
- Phase 29 locked semantics、contract、migration 或业务代码需要变化；
- 新增 L3/L4 风险、P0/P1/P2 finding、evidence 过期或隔离资源冲突；
- 需要修改 `governance/execution/**`、Queue、main、Lock 或生产配置。

## 永久串行与明确未授权

Shared contract freeze、canonical writer、migration ledger、Integration Queue、全量 Gate、main、governance metadata、tag 与 Lock 始终串行。此 Charter 不授权 migration、业务 runtime、main merge、Lock、push/deploy、production、Provider、subscriber activation、历史 replay/backfill、purge 或 Runtime Canary。

## Human 批准区

当前保持 `WAITING_HUMAN_APPROVAL`。只有 Human Owner 在审阅本 Charter 后精确确认：

```text
同意执行该 Release Train 业务施工
```

并形成不可变 `TRAIN_BUSINESS_APPROVAL`、合法 Train transition、Contract freeze 与 Work Unit construction transition 后，1A 才可能获得施工资格。该批准仍不包含 main、Lock、push、production 或下一 Train。
