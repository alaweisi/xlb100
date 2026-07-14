# G-04 / UD-02 附加 Worktree 事实调查报告

调查日期：2026-07-14（Asia/Shanghai）
调查对象：`G:/xlb100-p0-architecture-foundation`
调查性质：只读事实调查
治理关联：G-04 / UD-02，状态保持 `UNRESOLVED`

## 1. 调查边界与事实源

本报告仅使用下列只读事实源：

- `git worktree list --porcelain`
- `git status --porcelain=v2 --branch --untracked-files=all`
- `git log`、`git show`、`git rev-list`、`git merge-base`、`git branch -a`、`git tag --points-at`
- `git grep`、`git ls-tree`、`git ls-files`
- PowerShell `Get-Item`、`Get-Content` 与 `rg` 的只读输出

调查期间没有对目标 worktree、分支、commit、Phase 状态、CI、Lock 或既有治理文档执行写操作。唯一新增文件是本报告。

## 2. Worktree、分支与最新 Commit

`git worktree list --porcelain` 返回：

| 项目 | 事实 |
|---|---|
| Worktree 路径 | `G:/xlb100-p0-architecture-foundation` |
| 关联分支 | `refs/heads/codex/p0-architecture-foundation` |
| Worktree HEAD | `d22b2bd5cfd00b85aa3011c7fda901bad06bd60a` |
| Commit message | `feat: add p0 architecture foundation pillars` |
| Parent | `dfda49f44456eff91a3d18798dec48882f62a007` |
| 作者 | `kong <hansfoogui@outlook.com>` |
| Author time | `2026-07-09T22:24:41+08:00` |
| Committer | `kong <hansfoogui@outlook.com>` |
| Committer time | `2026-07-09T22:24:41+08:00` |

该 HEAD 只被本地分支 `codex/p0-architecture-foundation` 包含。`git branch -r --list '*p0-architecture-foundation*'` 没有返回匹配的远端分支。

目标目录的 `.git` 是 67 字节的 worktree 链接文件，内容为：

```text
gitdir: G:/xlb100/.git/worktrees/xlb100-p0-architecture-foundation
```

这证明该目录仍被 `G:/xlb100` 的本地 Git 元数据注册为附加 worktree。

## 3. 文件系统时间与未提交状态

### 3.1 文件系统时间

| 对象 | CreationTime（+08:00） | LastWriteTime（+08:00） | UTC |
|---|---|---|---|
| Worktree 根目录 | `2026-07-11T15:58:24.7598626+08:00` | `2026-07-11T15:58:25.8126999+08:00` | 最后写入 `2026-07-11T07:58:25.8126999Z` |
| `.git` 链接文件 | `2026-07-11T15:58:24.7633662+08:00` | `2026-07-11T15:58:24.7633662+08:00` | `2026-07-11T07:58:24.7633662Z` |

`git ls-files` 列出 1,232 个 tracked files。它们中最大的文件系统 `LastWriteTime` 为：

- 本地时间：`2026-07-11T15:58:25.8126999+08:00`
- UTC：`2026-07-11T07:58:25.8126999Z`

达到该最大时间戳的 tracked files 共 5 个：

- `tests/unit/workerWorkflowBindings.test.ts`
- `tsconfig.base.json`
- `turbo.json`
- `vitest.config.ts`
- `vitest.workspace.ts`

上述目录、`.git` 链接和 tracked files 的时间戳集中在 `2026-07-11 15:58:24～15:58:25 +08:00`，记录的是当前目录实例的文件系统创建/写入时间；Git commit 的作者与提交时间另见第 2 节。

### 3.2 Dirty 状态

在目标 worktree 执行 `git status --porcelain=v2 --branch --untracked-files=all` 只返回：

```text
# branch.oid d22b2bd5cfd00b85aa3011c7fda901bad06bd60a
# branch.head codex/p0-architecture-foundation
```

没有任何 index、working-tree、conflict 或 untracked file 记录。因此调查时该 worktree 为 clean；未提交改动文件清单为空。

## 4. 相对当前 Main 的关系

当前 `main` 与 canonical tag 的只读事实：

| 项目 | 事实 |
|---|---|
| `main` HEAD | `d7bf3e02e3ae8e3e2ecf74c942fb7350040f1afc` |
| Commit message | `docs: lock XLB Phase 28 review reputation` |
| 作者与时间 | `kong <hansfoogui@outlook.com>`，`2026-07-14T10:01:39+08:00` |
| Tag | `xlb-phase28-review-reputation` |

`git rev-list --left-right --count main...codex/p0-architecture-foundation` 返回 `87 1`：

- `main` 有 87 个该分支没有的 commit；
- `codex/p0-architecture-foundation` 有 1 个 `main` 没有的 commit。

双方均不是对方的 ancestor，因此关系为**已分叉**，不是单纯领先或单纯落后。

分叉点（merge-base）是：

| 项目 | 事实 |
|---|---|
| Commit | `dfda49f44456eff91a3d18798dec48882f62a007` |
| Commit message | `chore: clean worker simulation test pollution and update health check` |
| 作者 | `kong <hansfoogui@outlook.com>` |
| 时间 | `2026-07-09T19:46:16+08:00` |

该分支相对 `main` 唯一的 commit 是 `d22b2bd5cfd00b85aa3011c7fda901bad06bd60a`。`git cherry main codex/p0-architecture-foundation` 将其标记为 `+`，未在 `main` 中找到 patch-equivalent commit。

## 5. 分支历史与文件改动证据

### 5.1 唯一分支 Commit 的改动范围

Commit `d22b2bd5cfd00b85aa3011c7fda901bad06bd60a` 的统计为：

- 76 files changed
- 3,169 insertions
- 116 deletions

改动内容包括以下可核验路径：

- Backend/runtime：`backend/src/providers/paymentProvider.ts`、`backend/src/business/`、`backend/src/dispatch/lbsDispatch.ts`、`backend/src/aftersale/case/`、`backend/src/adminOps/`
- Shared contracts/client：`packages/types/`、`packages/validators/`、`packages/api-client/src/createApiClient.ts`
- DB schema/migrations：`db/schema/business.sql` 及 `db/migrations/033_*.sql` 至 `038_*.sql`
- Tests：`tests/unit/`、`tests/integration/`、`tests/security/` 下的相关新增或修改文件
- Script：`scripts/uat-investor-closed-loop.ps1`
- 分支内备案：`docs/reports/P0_ARCHITECTURE_10_PILLARS_IMPLEMENTATION_RECORD_2026-07-09.md`

分支内备案文件明确记载：

- 日期：`2026-07-09`
- 分支：`codex/p0-architecture-foundation`
- 当时记录的工作区：`E:\xlb100-p0-architecture-foundation`
- 目标描述：补齐“投资人前模拟闭环”所需的 10 个“架构承重柱”
- 结论描述：形成“投资人前可模拟真实运营闭环的架构底座”
- 边界描述：不包含真实支付 Provider，并列出仍需后续完成的能力

该备案中的工作区路径 `E:\xlb100-p0-architecture-foundation` 与调查时 Git 注册的实际路径 `G:/xlb100-p0-architecture-foundation` 不同。

该分支使用的 migration 文件为：

- `db/migrations/033_business_client_foundation.sql`
- `db/migrations/034_order_status_machine_foundation.sql`
- `db/migrations/035_dispatch_lbs_foundation.sql`
- `db/migrations/036_fulfillment_evidence_foundation.sql`
- `db/migrations/037_aftersale_case_foundation.sql`
- `db/migrations/038_outbox_retry_dlq_foundation.sql`

当前 `main` 上相同编号对应不同文件：

- `db/migrations/033_phase16_sku_pricing_standards.sql`
- `db/migrations/034_phase17_order_reverse_aftersale_complaints.sql`
- `db/migrations/035_phase18_fulfillment_evidence_object_storage.sql`
- `db/migrations/036_phase18_city_reference_hardening.sql`
- `db/migrations/037_phase19_enterprise_openapi_webhooks.sql`
- `db/migrations/038_phase19_enterprise_tenant_hardening.sql`

### 5.2 对三类用途的证据判断

| 待判断类别 | 能确认的证据 | 事实结论 |
|---|---|---|
| (a) 被遗忘、未清理的历史实验分支 | 分支名和 commit message 使用 `p0 architecture foundation`；只有 1 个独有 commit；worktree clean；没有匹配的远端分支；`main` 未包含该 commit 或 patch-equivalent。commit message 与分支备案未使用“experiment”“abandoned”“obsolete”或“待清理”等标记。 | 是否“被遗忘”或是否属于“实验”没有直接记录。**证据不足，无法判断。** |
| (b) 正在进行但尚未合并的独立工作 | commit 未进入 `main`，但 worktree 没有未提交改动；分支备案使用“完成的 10 项架构改进”“验证结果”“结论”等完成态表述；该分支在 `2026-07-09T22:24:41+08:00` 后没有后续 commit，也没有匹配的远端分支。 | 能确认它是未进入 `main` 的独立 commit；是否在调查时仍“正在进行”没有状态记录。**证据不足，无法判断。** |
| (c) 与当前 Phase 28/29 无关的其他用途 | 分支名、commit message 和备案内容都指向 P0 架构基础及投资人前模拟闭环；commit 时间为 2026-07-09。当前 canonical `main` commit 明确为 Phase 28 Lock，时间为 2026-07-14；分支改动和备案没有 Phase 28/29 标识。 | 有直接证据表明该 commit 的记录用途是 P0 架构基础，而不是 Phase 28/29。作者与当前 `main` HEAD 作者同为 `kong <hansfoogui@outlook.com>`；Git history 和文件内容没有记录创建它的具体 Human、Agent 产品或 Agent 会话。对于“另一个人或另一个 Agent 会话”这一来源判断，**证据不足，无法判断。** |

## 6. 当前项目正式引用检查

### 6.1 `main` Tree

对当前 `main` 的全部 tracked files 执行 `git grep`，以下精确值均无匹配：

- `codex/p0-architecture-foundation`
- `G:/xlb100-p0-architecture-foundation`
- `G:\xlb100-p0-architecture-foundation`
- `E:\xlb100-p0-architecture-foundation`
- `P0_ARCHITECTURE_10_PILLARS_IMPLEMENTATION_RECORD_2026-07-09.md`
- `d22b2bd5cfd00b85aa3011c7fda901bad06bd60a`

因此，在调查时的 `main` tree 中，没有文档、CI 配置或脚本通过上述分支名、worktree 路径、备案文件名或 commit hash 引用该 worktree 产物。

### 6.2 当前工作目录中的路径引用

对 `G:/xlb100` 当前工作目录的 `AGENTS.md`、`.github/`、`scripts/`、`docs/` 和 `governance/` 执行精确文本搜索：

- `AGENTS.md`：无匹配
- `.github/`：无匹配
- `scripts/`：无匹配
- `docs/`：无匹配
- `governance/`：仅以下既有事实提取文档匹配：
  - `governance/02_CURRENT_ENGINEERING_EXECUTION_MODEL.md:79`
  - `governance/03_GOVERNANCE_GAP_ANALYSIS.md:17`
  - `governance/03_GOVERNANCE_GAP_ANALYSIS.md:108`

这些 Governance Phase 0 条目把该 worktree 记录为 owner、用途、生命周期、authority 与清理责任未知的 G-04 事实；它们没有把该 worktree 声明为正式施工根目录或当前正式产物。`governance/04_ADR_DECISION_ENGINE_DESIGN.md:322` 继续将 UD-02 标记为 `UNRESOLVED`，并注明不得把附加 worktree 当作授权。

目标分支自身只有分支内备案文件的两处自引用：

- `docs/reports/P0_ARCHITECTURE_10_PILLARS_IMPLEMENTATION_RECORD_2026-07-09.md:5`：分支名
- `docs/reports/P0_ARCHITECTURE_10_PILLARS_IMPLEMENTATION_RECORD_2026-07-09.md:7`：历史工作区路径 `E:\xlb100-p0-architecture-foundation`

综合上述可确认事实：该 worktree 有本地 Git 注册、一个分支 commit 和分支内自述备案；当前 `main`、CI、脚本、`docs/` 与 `AGENTS.md` 中没有把它引用为当前项目正式产物的记录。当前 governance 文件对它的引用性质是未决差距登记，不是正式产物声明。

## 7. 调查结束状态

- G-04：状态未改变。
- UD-02：保持 `UNRESOLVED`。
- 未执行 worktree remove、branch delete、merge、commit、Lock、Phase 状态修改或其他调查对象写操作。
- 本报告不包含删除、保留、合并或清理处置意见。
