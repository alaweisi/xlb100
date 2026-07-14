# XLB 项目工程治理宪法（正式版本控制候选）

> 状态：Human Owner 已于 2026-07-14 授权把本宪法植入项目执行系统并纳入正式版本控制；当前 candidate 为 `BOOTSTRAP / NOT_ENABLED`，须经 immutable candidate、独立审计与 Human 确认后才能启用实际 Work Unit WRITE
> 观察时间：2026-07-14（Asia/Shanghai）
> 性质：项目最高工程施工治理依据；本轮授权仅覆盖治理执行系统植入与版本化，不授予 Phase 30/31 runtime、migration、hosted CI、main merge、部署、production 或 Lock 权限

## 0. 事实边界与证据等级

本宪法提取并正式固化项目已经执行或已经由 Human Owner 明文决定的规则。事实优先级按项目现有政策处理：Git 提交与标签、`docs/CURRENT_STATE.md`、治理 registry、Phase/架构/契约报告、实际 Gate/CI，最后才是会话记忆。主要证据包括：

- [`AGENTS.md`](../AGENTS.md)、[强制工程架构](../docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md) 与 [Cursor 强制规则](../.cursor/rules/xlb-architecture-mandatory.mdc)；
- [`CURRENT_STATE`](../docs/CURRENT_STATE.md)、[Phase 编号政策](../docs/governance/PHASE_NUMBERING_POLICY.md) 与 Phase registry；
- [Phase 28 Entry](../docs/reports/PHASE28_REVIEW_REPUTATION_ENTRY_REPORT.md)、[Runtime Decision](../docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md)、[Acceptance](../docs/reports/PHASE28_REVIEW_REPUTATION_ACCEPTANCE_REPORT.md)、[Lock](../docs/reports/PHASE28_REVIEW_REPUTATION_LOCK_REPORT.md)；
- [`xlb-phase-lock`](../.cursor/skills/xlb-phase-lock/SKILL.md)、[Phase Prompt Pack](../docs/reports/XLB100_PHASE_PROMPT_PACK.md)；
- [主 CI](../.github/workflows/ci.yml)、[Phase 22 Quality Gates](../.github/workflows/phase22-quality-gates.yml)、[`package.json`](../package.json) 与 [preflight](../scripts/preflight-architecture.ps1)；
- [DB Migration Contract](../docs/contracts/CONTRACT_DB_MIGRATION.md)、[DAL Scope Contract](../docs/contracts/CONTRACT_DAL_SCOPE.md)、[Workflow UI Binding](../docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md)；
- [ADR-26-01](../docs/architecture/26_XLB_EVENT_DELIVERY_ADR.md)。

标记含义：

- **正式规则**：在强制规则、契约、Gate、CI、Skill 或治理政策中有明确可执行表述。
- **稳定实践**：在多个近期 Phase 的报告和 Git 历史中重复出现，但尚未集中写成统一政策。
- **未统一**：存在冲突、缺失或仅在单个 Phase 中出现，不能视为全项目通则。

当前事实基线是：`main` 的 Phase 29 Lock 治理提交为 `80921871baf8647b2d3b7c97f8c0fde2a88f9400`，canonical tag `xlb-phase29-marketing-coupon` 解引用后指向该 commit；当前治理植入 branch 为 `codex/governance-execution-system`。Phase 29 已 Lock，Phase 30/31 尚未进入业务施工；本治理 candidate 不能反向改写 Phase 29 及更早的 Lock 事实。

## A. Phase 生命周期规则

### A1. 当前真实生命周期

| 阶段 | 已提取规则 | 成熟度 |
|---|---|---|
| Session Sync | Agent 开工先核验唯一仓库根、branch、HEAD、tags、dirty state、`CURRENT_STATE`，再读领域与 Phase 边界；事实冲突时停止施工。 | 正式规则 |
| Phase Entry | 前置 Phase/依赖必须处于要求的接受或 Lock 状态；Human 明确授权；建立专用 Phase branch/base；Entry Report 固定允许项、禁止项、migration 号、生产边界和退出证据。 | 近期稳定实践，部分正式化 |
| Design / Decision Freeze | 产品、隐私、权限、数据、版本和 deferred decisions 由 Human 接受；架构文档与契约成为施工输入。未决项不等于授权。 | 近期稳定实践；没有统一的全项目 Freeze 状态机 |
| Implementation | 遵循 `types → validators → backend → api-client → app`，业务逻辑进入对应 backend 模块；RequestContext、city、role、contract、guard 先行；每个 Gate/工作包有允许文件和停线点。 | 正式规则 |
| Migration | 只追加新 migration，不改已应用/已 Lock migration；版本按序且不可复用保留号；执行前后要求 schema marker、重放、局部 DDL 恢复、同城 FK/一致性验证。 | 正式规则 |
| Runtime Verification | 本地 MySQL/Redis、migrate/seed、真实 HTTP/API/DB 链、浏览器/Playwright、幂等重试、跨城/角色拒绝、上游零写和 Provider truthfulness 形成证据。 | 稳定实践；证据矩阵按 Phase 不同 |
| Independent Audit | 施工完成后由独立只读审查检查完整 tracked/untracked candidate；按 P0–P3 报告；发现项必须修复并重新审查，不得以实现报告代替审查。 | 近期稳定实践；未有统一 Audit Charter |
| Human Acceptance | 审计 PASS 只使候选具备人工接受条件；不会自动授权下一 Gate、下一 Phase、merge、Lock、push 或 production。 | 稳定实践 |
| Lock | 仅在 Human 明确要求后进行；clean feature branch、工程/Phase gates、基础设施、live/DB 证据通过；feature commit 后 `--no-ff` 合并 main，main 上复验，更新治理状态并创建 canonical Phase tag；不得夹带下一 Phase。 | 正式规则与稳定实践组合 |

近期 Phase 28 的实际序列最完整：Entry E0 → contract/runtime/migration/UI 工作包 E1–E6 → aggregate acceptance E7 → independent read-only review → remediation/re-review → Human 授权的本地 merge/Lock → post-merge verification → governance metadata/tag。Phase 25 使用 Gate 0–8 与人工停线点；Phase 27 使用 A–E 子阶段。由此可确认核心生命周期存在，但名称和粒度尚未统一。

### A2. Entry 的最低实际条件

1. 仓库事实同步完成，旧会话和旧蓝图不得替代当前仓库。
2. 前置 Phase/设计决策满足依赖；未接受的 predecessor contract 不得被后续施工假定。
3. Human 对本 Phase 或工作包给出明确授权。
4. 在 Entry Report 中写清 base/tag、branch、scope、forbidden scope、migration allocation、生产/Provider/回放边界和 exit evidence。
5. 对当前实现与目标蓝图区分；复用 canonical writer，不另建平行真相源。
6. 原则上从 clean worktree 开始；用户自有未跟踪证据须列出、保留并排除在提交外。

### A3. Design Freeze 的真实含义

- Freeze 的对象是已经人工接受的决策、架构、契约和明确 deferred decisions，不是把所有未来问题视为已解决。
- “Design accepted”不等于 runtime entry、migration、subscriber activation、production 或 Lock authority。ADR-26-01 明确展示了这种分离。
- Material change 会重开受影响的设计/测试审查；但何为 material change、谁宣布重新打开，目前没有统一定义。

### A4. Lock 的真实含义

Lock 是将 Phase 冻结在 `main` 并以 canonical tag 标识，不是普通开发完成。可观察的 Lock 条件包括：

- feature commit(s) 与 clean worktree；
- build、typecheck、full regression、preflight 和全部 Phase gates 通过；
- 适用时完成 migration/seed、live API、DB invariants、浏览器证据、security、dependency audit；
- 独立审查清零未解决 finding，Human 明确接受并授权 Lock；
- `--no-ff` 合并，main 上重新验证；
- 更新 `CURRENT_STATE`/registry/Lock report，创建 tag；
- 明确“下一 Phase 未进入”，production/push/deployment 仍需单独授权。

Lock Skill、近期 Lock 报告及早期执行计划对“tag、治理元数据、push”的精确顺序并不完全一致，因此这里只确认它们都属于 Lock closure，不把某一顺序提升为新规则。

Human Owner 已在 P-18 中选定未来统一 Lock closure 设计：集成完成与全量审计 → Human 明确接受并授权 merge/Lock → `--no-ff` 合并 main → main 关键复验 → 更新并提交 `CURRENT_STATE`/registry/Lock report → canonical tag 指向最终治理 commit；push/deploy 仍需单独明确授权。该顺序在 Agent/Skill/治理状态源完成后续植入前，只是已批准的治理设计，不改写既有 Lock 历史，也不触发当前 Phase Lock。

## B. 权限与职责边界

| 主体 | 当前实际权限 | 当前明确禁止/限制 | 成熟度 |
|---|---|---|---|
| Human Owner | 接受/拒绝设计与 deferred decisions；授权 Phase Entry、子 Gate、runtime construction、独立接受、merge/Lock；决定 production、Provider、历史 replay/backfill、purge 等高风险动作。 | Audit PASS 不替代 Human 决策；一次授权不自动扩展到下一 Phase、push 或 production。 | 稳定实践；无统一 RACI/身份定义 |
| Construction Agent | 读取事实、提出差距、在获批 branch/文件/scope 内施工、执行测试、记录证据、修复审计发现。 | 不得依赖旧记忆；不得越 Phase；不得自 Lock；不得修改 locked migrations/tags；不得擅自 push/deploy/activate production。 | 正式规则 |
| Audit Agent | 只读检查完整候选、测试与证据；按严重级别提出 finding；可以给出 REJECT/PASS；复审修复结果。 | 不写 candidate、不代替施工 Agent 修复、不 merge/tag/Lock、不授予下一 Phase。 | 近期稳定实践；无集中 Audit Charter |
| Runtime Writer | 只有 Human 明确打开的 Phase/工作包才可写 runtime；写入受 contract、city/role、idempotency、audit、transaction 和 protected-domain 边界限制。 | 默认不含 production 数据写入、外部 Provider、subscriber activation、历史 replay/backfill 或 destructive purge。 | Phase 文档中正式；跨 Phase 总则分散 |
| Lock Authority | Human 明确请求是 Lock 的必要前提；Agent 执行 ceremony 与证据核验。 | Agent 不得因为测试通过而自发 Lock；Audit Agent 无 Lock authority。 | 正式规则 |

已观察到的责任分离是“Human 决策/授权—Construction Agent 施工—Audit Agent 只读审查—Human 接受/Lock”。Human Owner 已于 2026-07-14 明确决定，本项目只有一位 Human Owner，由该唯一自然人承担 Human Review、Architecture Review、Financial Review、Security Review 与 Lock Authority，不设代理或多人会签。该 owner 决定本身不自动解决其他治理依赖；worktree、migration reservation、Lock closure order 与 Audit Charter 后续分别由 P-01～P-18 的独立 Human 选择在治理设计层获得答案，执行植入状态见 B2 与 06。

### B1. Human Owner 交互式裁决协议

> 决策来源：Human Owner 于 2026-07-14 明确要求把“由 Agent 提供通俗易懂的交互式选择题，协助非专业 Human Owner 完成治理裁决”写入项目宪法。追溯：G-08、G-12、G-16。

本协议适用于项目中**所有必须由 Human 作出选择、批准、取舍、例外授权或风险接受的事项**，包括但不限于产品范围、架构、数据、migration、worktree、并行施工、权限、安全、资金、Provider、production、Phase Entry、merge、Lock 与治理规则。Agent 不得把未经翻译的专业材料直接交给 Human 并要求其自行推导结论。

项目采用以下 Human–AI 共建闭环：**AI 提取事实与提出选项 → Human 作出选择 → AI 复述选择及边界 → Human 最终确认 → AI 仅在确认范围内执行并记录证据**。AI 负责降低理解门槛、揭示影响和保持追溯；Human 保留最终裁决权与停止权。

1. **通俗表达义务**：Human Owner 不需要预先理解 ADR、migration reservation、worktree ownership、Lock ceremony 等工程术语。Agent 必须先把问题翻译成日常语言，并说明它会影响什么、不会影响什么。
2. **逐题裁决**：原则上每次只提交一个决策问题，提供 2～3 个互斥选项，以 `A/B/C` 等稳定标识供 Human 选择；不得一次要求 Human 阅读并裁决整套复杂治理模型。
3. **明确推荐**：Agent 应把推荐选项放在首位，标注“推荐”，并用简短语言说明理由、收益、代价和风险；不得以技术术语数量或篇幅向 Human 施压。
4. **复述确认**：Human 可以使用选项字母或自然语言作答。Agent 必须复述其理解的具体选择、适用范围和明确不包含的权限；如果回答存在足以改变结果的歧义，必须继续澄清，不得猜测。
5. **不得推断同意**：沉默、未回复、模糊肯定、讨论意见或对单一子问题的决定，不得被扩张为对整份宪法、ADR、Implementation、runtime、migration、CI、merge、Lock、production 或并行写入的批准。
6. **最终裁决清单**：一组选择题完成后，Agent 必须生成一份通俗的最终裁决清单，至少列出选择结果、生效范围、未授权事项、仍未解决依赖和将修改的文件。只有 Human 对该清单给出明确最终确认，Agent 才能执行清单范围内的治理文档更新或后续获批动作。
7. **决策留痕**：每项正式决定必须记录日期、Human 的选择、Agent 的复述、适用范围、排除范围，以及对应 Gap/UD。测试通过、Audit PASS 或 Agent 推荐均不能替代 Human 决定。
8. **权限不扩张**：本交互协议只降低 Human 的理解与表达门槛，不降低 ADR Level、Required Authority 或 Required Evidence，也不自动解决任何 `UNRESOLVED DEPENDENCY`。

#### B1.1 当前工作基线选择记录

Human Owner 于 2026-07-14 选择继续以本文件与 `04_ADR_DECISION_ENGINE_DESIGN.md` 的总体方向作为交互裁决基线，完成 P-01～P-18 后又明确授权“植入项目执行系统，也进入正式版本控制”。该授权允许建立 `AGENTS.md`、Skills、manifest/lease/reservation/queue 与隔离环境 Gate；它不授权 Phase 30/31 runtime、migration、hosted CI、main merge、Lock、push、Provider 或 production 行为。执行 registry 在 candidate commit、独立审计与 Human 确认前保持 `BOOTSTRAP / NOT_ENABLED`。

### B2. 多工程队并行施工宪法

> 决策来源：Human Owner 于 2026-07-14 通过 P-01～P-18 全部选择 A，随后明确授权把治理宪法植入项目执行系统并纳入正式版本控制。详细模型见 [`06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md`](./06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md)。追溯：G-01～G-04、G-06～G-09、G-12～G-14。

1. **Phase 是业务与验收边界，不是天然的独占施工锁。** 后续工作是否可以开始，由真实依赖 DAG、冻结契约和 Human 批准的施工批次章程决定；无直接依赖的工作包可以提前形成隔离候选。
2. **并行单位是 Work Unit，不是整条 Phase 自由写。** 每个 Work Unit 必须有唯一 ID、owner、branch、受管 worktree、固定 base、允许/禁止路径、契约 revision、migration reservation、环境和有效状态。
3. **多工棚、单总闸。** 最多三支 WRITE 工程队可在受管隔离 worktree 中并行施工；共享契约、canonical writer、migration ledger、全局配置、集成队列、main、governance metadata、tag 与 Lock 始终由单一 owner/队列保序。
4. **唯一公共管线角色。** 每个施工批次必须指定 Contract Owner、Migration Owner 和 Integration Owner。它们是 Agent 执行角色，不拥有 Human Review、Production 或 Lock Authority。
5. **契约先冻结，消费者再并行。** 工作包绑定具体 contract revision；实质变化使依赖旧 revision 的 candidate、测试和审计证据自动 `STALE`，必须重新同步、验证和审计。
6. **Migration 先预约且编号不复用。** 没有有效 reservation 不得创建 migration；放弃的编号永久留空；已 Lock migration 永远不可修改。每个并行工作包使用隔离数据库/Redis，最终 integration database 重放仍串行。
7. **两级审计。** Work Unit 在排队前接受独立只读 package audit；集成后接受 train/Phase audit。P0/P1/P2 必须修复并复审，P3 可记录后继续；package PASS 不等于 Phase Lock。
8. **局部失败局部停线。** 普通失败只暂停受影响 Work Unit；公共契约、migration/schema、共享业务真相、P0/P1 跨域风险或 integration baseline 失效才暂停整个施工批次。
9. **Human 一次批准批次章程。** 章程内工作包可连续施工；越 scope、新增 L3/L4 风险、重大 finding、production/Provider/Lock 请求仍须回到交互式 Human 裁决。
10. **施工可并行，主线与 Lock 串行。** Candidate 按单一 merge queue 进入 integration branch；Phase 最终仍按依赖顺序逐个合入 main、复验、更新治理元数据并创建独立 canonical tag。
11. **历史不可随意改写。** 仅 Work Unit Owner 可 rebase 未共享分支；已共享/已审计 commit、integration branch、main 与 tag 不得改写，禁止对 main/共享分支 force-push。
12. **清理必须可证明安全。** 只有受管目录内、已结案、clean、无 untracked、无未合并 commit、无下游依赖且已登记证据的 worktree 才可在未来获批执行模型下自动回收；现有历史附加 worktree 不自动纳入或清理。
13. **首次试点边界。** Phase 29 已按现行规则完成 Lock；Phase 30/31 试点 Charter 仍为 `DRAFT / WAITING_HUMAN_APPROVAL`，只有治理执行控制完成 Bootstrap 审计并由 Human 启用后，才可另行裁决该业务施工批次。
14. **控制已安装不等于执行权限。** `AGENTS.md`、Skills、登记载体、环境隔离和检查机制已形成 candidate，但 execution registry 仍为 `BOOTSTRAP / NOT_ENABLED`；在独立审计和 Human 启用确认前，任何 Work Unit 可执行 eligibility 都必须 fail closed。

## C. 数据治理原则

### C1. Migration

- `db/migrations/*.sql` 按文件名排序，由 `schema_migrations` 记录，已记录版本不重复执行。
- 已 Lock 或已应用 migration 视为不可变证据；只能追加新文件。Phase ID 与 migration 号解耦；`024` 是永久保留空号。
- Seed 独立于 schema migration，并要求幂等；近期 Phase 的 schema-only migration 禁止夹带业务 seed、激活、回放、scheduler 或 backfill。
- Migration Gate 实际验证 empty install、历史升级、真实 partial-DDL 恢复、double replay、marker exactly once；高风险领域还以直接矛盾 SQL 证明 FK/金额不一致会失败。
- canonical migration reservation ledger 与检查载体已经进入本轮执行系统 candidate；在 candidate 审计/Human 启用、具体 Train Charter 获批和 reservation 生效前，实际 migration 写入继续串行且 fail closed。编号一旦分配不复用，`ABANDONED` 永久留空。

### C2. 一致性与隔离

- 所有业务数据按真实 `city_code` 隔离；`__global__` 只用于 Admin scope，不得作为业务 city。
- DB 访问经 `backend/src/dal`；Repository/ScopedExecutor/AdminQueryGuard 负责 city scoped 查询，global admin 仍须显式指定业务 city。
- 同城/同租户关系越来越多地通过 composite UNIQUE/FK 在 DB 层证明，不能只靠 API 过滤。
- 工作流边界保存不可变 snapshot/evidence；受保护域不得被下游 projection、settlement preparation、UI 或 Provider envelope 直接改写。
- Cross-domain side effect 通过 transactional outbox/批准的 delivery boundary，而不是直接跨模块写入。

### C3. 幂等与并发

- Create、retryable mutation、payment、audit、settlement、dispatch、acceptance 等 action 要求稳定 idempotency boundary。
- 实际实现常用 DB UNIQUE、CAS/`expectedVersion`、行锁、canonical lock order 和 bounded retry；进程内内存、Redis-only lock 或“已看过”缓存不能替代 durable deduplication。
- Event delivery 的真实语义是 at-least-once，不宣称 exactly-once；subscriber 必须把去重记录与业务 side effect 放在同一事务或同一唯一键边界中。
- 重试不得重复创建业务记录或重复发事件；replay 不得绕过 canonical idempotency key。

### C4. Audit

- Admin、money-related、governance、payment、dispatch、worker acceptance、refund、permission 和不可逆 action 在现有 Workflow Action Contract 中要求 audit/confirm。
- 审计记录趋向 append-only，携带 actor、reason、expected version、时间、city、source/evidence hash；审计不得随业务对象 cascade delete。
- 敏感内容采用最小化/脱敏列表；完整内容读取走专用同城权限并记录访问目的。
- 本轮 candidate 已固化两级只读 Audit、P0～P3 closure 与 evidence freshness 的执行入口；统一 Audit Event schema、retention owner 和 UD-07 evidence baseline 仍是独立未决维度，不得因 registry 存在而推定解决。

### C5. Money Flow

当前已 Lock 的 money boundary 是“记录、快照、应计、准备、确认”，而不是外部资金执行：

1. Pricing/official SKU 提供价格依据，Order 保存权威价格快照。
2. Payment mock webhook 可在一个受控事务中更新 payment/order 并写 outbox，但不得直接调用 Dispatch。
3. Fulfillment completion 通过 outbox 驱动 Ledger accrual；Ledger entry 表达 customer debit、platform/worker credit 的应计，不代表付款、提现、退款或 Provider split。
4. Settlement preparation 只把 eligible accrual 形成 batch/item；不改 accrual、order、payment、fulfillment 或 ledger entry，不移动资金。
5. Settlement confirmation 只做 prepared→confirmed、记录 actor/time 并写一次 outbox；不改金额快照，不具有 money-transfer 语义。
6. Mock/local Provider envelope 必须如实标记，不得呈现外部支付、地图、OSS 或通知成功。

Phase 29 Lock 已冻结“Pricing 拥有 base price、Marketing 只返回 versioned discount decision、Order 拥有 final snapshot、Payment 复制已接受净额”的职责边界；后续 Phase 不得以并行施工为由改写该 canonical truth，任何 material change 必须走新的 Authority、evidence 与迁移/兼容决策。

## D. 前后端边界

### D1. Backend Workflow Authority

- Backend/API contract 决定业务状态、权限、`availableActions`、disabled reason、idempotency、audit、confirmation 和 city scope。
- 业务模块必须在 `backend/src/<domain>`；共享契约在 `packages/types` 与 `packages/validators`；三端经 `@xlb/api-client` 访问后端。
- Canonical business writer 只有一个；下游 projection、主题、Figma 或 UI 不得成为平行状态机。

### D2. Frontend Projection

- App 负责路由组装、API wiring 和 workflow view-model adaptation；`packages/ui` 只负责组件、slot、token 和呈现。
- Figma 决定布局与视觉表达，不决定业务 action；Theme 只能影响视觉，不能改变金额、权限、endpoint、state transition、audit 或 city scope。
- UI 上的 executable action 必须绑定真实 endpoint/action contract；后端未提供时只能显示 `not-wired`、read-only、disabled 或 guardrail。

### D3. 禁止 Fake State

- 禁止 fake task、fake earnings、fake qualification、fake payment/dispatch/provider success、fake realtime、fake metric 和 local-only success 冒充 backend success。
- 页面不得因为 Figma 把按钮画成 primary 就启用；不得吞掉 backend 400、city guard 或 governance failure。
- 无真实 API/contract 的 OA/Dashboard/Provider 能力保持 readiness/block 状态，不得为“完成度”伪造流程。

## E. Quality Gate 规则

| Gate | 当前要求/执行方式 | 现状分类 |
|---|---|---|
| Unit Test | 纯逻辑、schema、state machine、policy、UI component；Phase focused suite + workspace suite。 | 正式且广泛执行 |
| Contract Test | 校验 types/validators/API Client/event/enum 对齐；契约文档要求通过共享类型、validator、backend guard、API client 和测试落地。 | 测试实践正式；独立 `contract-check` CI 仍是 placeholder |
| Integration Test | 使用真实 MySQL 的 API、transaction、outbox、idempotency、concurrency、cross-domain lifecycle；DB tests 串行执行。 | 正式且广泛执行 |
| Security Test | city/tenant/role/owner 拒绝、forbidden import/write、scope leak、provider truth、dependency/security gates。 | 正式且有独立 workflow |
| E2E / Browser | 真实 auth/API/DB、禁止 route interception/fake response；覆盖关键 A/W/C 流程、窄/宽视口、console/network/5xx。 | 近期 Phase 的稳定硬证据；并非所有历史 Phase 都有 |
| Regression Test | Phase focused 通过后跑 workspace full regression；记录文件/用例数、todo/skip provenance；Lock 后在 main 复跑。 | 稳定实践 |
| Migration Gate | fresh/upgrade/partial/double replay、marker once、schema/constraint、zero activation/seed。 | 有 migration 的近期 Phase 为硬门禁 |
| Build / Typecheck | workspace build 与 typecheck 在 feature 和 post-merge main 运行。 | 正式规则与主 CI |
| Architecture Preflight | 汇总历史 Phase boundary scripts、governance check 和架构禁止项；失败不得合并。 | 正式规则 |
| Performance / Coverage | Phase 22+ 有专项阈值和 hosted workflow；不是所有 Phase 的统一主 CI 步骤。 | 局部正式 |
| Dependency Audit | 近期 Lock 使用 `pnpm audit:critical`。 | 稳定实践；未进入主 CI |
| Lint | 根命令存在，但主 CI 不运行；Phase 28 报告承认继承的 lint red。 | 未统一为硬门禁 |
| Evidence | 报告记录命令、计数、失败/重跑原因、live IDs/DB invariants、browser、diff hygiene、protected-domain zero writes；finding 不得被静默豁免。 | 稳定实践；无统一 evidence schema |

## 正式宪法结论

XLB 的最高工程施工治理由本文件正式固化：Human 授权、Phase 边界、contract-first、city-scoped data、append-only migration、durable idempotency、backend truth、no fake state、分层 Gate、独立只读审查、Human-only Lock，以及“多工棚、单总闸”的受管并行模型。本轮将规则植入 `AGENTS.md`、本地人工 Gate、Skill、registry、manifest、lease、reservation、隔离环境和串行 queue；hosted CI 保持不变。执行系统在 immutable candidate、独立审计和 Human 确认前必须保持 `BOOTSTRAP / NOT_ENABLED`，任何具体 Train 仍需独立 Human Charter 批准。
