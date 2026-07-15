# AGENTS.md — 喜乐帮 / XLB

> 所有 Agent 进入项目先阅读本文件。本文件与 `governance/00_LEAN_EXECUTION_POLICY.md` 是当前有效执行规则；旧治理文档中与其冲突的流程降级为历史参考或高风险专项规则。

## 项目边界

- Monorepo：`apps/customer`、`apps/worker`、`apps/admin`、`backend`、`packages`、`db`、`infra`、`deploy`、`tests`、`docs`。
- 包名前缀使用 `@xlb/*`，不得引入旧项目 `@sdj99`/`sdj99` 命名或复制旧项目半成品。
- 不得绕过 `packages/types`、`packages/validators` 和 `@xlb/api-client` 建立重复契约。
- 未经用户确认，不得凭空生成正式服务类目；正式类目来源仍是 `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md`。

## 默认执行方式

用户要求实现、修复、整理或重构时，Agent 默认直接完成，不创建治理任务让用户操作。

普通任务包括文档、测试、页面、非敏感业务代码、重构、开发配置和局部脚本修改：

- 不要求 Release Train、Work Unit、Manifest、Lease、Integration Queue 或固定确认文字。
- 不要求独立审计、完整 Git 历史扫描或全量治理 SelfTest。
- 不使用运行环境时，不登记 Compose、MySQL、Redis、volume 或端口。
- 单人施工可在当前分支完成；只有确实并行写入时才创建独立分支/worktree。
- 用户说“按推荐执行”“A”“继续”“直接做”等明确表达，视为当前任务范围内的有效授权。

## 仅三类风险

1. **普通开发**：Agent 直接实施、运行相关测试并提交本地结果。
2. **高风险工程**：数据库 schema/migration、认证授权边界、支付/退款/账本、金额规则、破坏性数据操作、共享契约破坏性变更。开始写入前取得一次用户明确同意；一次同意覆盖已说明范围内的本地施工、测试和本地 main 集成。
3. **外部或生产操作**：push、deploy、生产数据、真实 Provider、公开发布和不可逆外部操作，执行前必须单独取得明确同意。

自然语言明确同意即可，不要求逐字匹配固定句式。沉默仍不算授权。

## 并行施工

- 同时最多三个写入单元。
- 只有修改同一文件，或改变同一数据库表、金额规则、状态机、事件版本、共享契约时才视为冲突。
- `scripts/**` 不再整体串行；按实际修改文件判断。
- 并行写入必须使用不同分支/worktree，不共享 mutable branch。
- 只有实际使用数据库或 Redis 的单元才需要独立实例/端口；纯代码、文档、单元测试和静态脚本不需要。

## 高风险确认与本地集成

- 高风险路径由 `scripts/check-lean-risk.ps1` 在 commit 前客观识别，并输出敏感类别和文件摘要。
- Human 用“同意”“继续”“按推荐执行”等自然语言确认一次即可；Agent 将该回复记录为本次施工批次的一行本地日志。
- 一次确认覆盖已展示路径在同一施工批次内的后续 commit 和本地集成；新增敏感路径时才需要再次展示并确认。
- 高风险任务不经过 Integration Queue、Release Train、Work Unit、Manifest、Lease 或状态机。测试通过后可直接完成本地提交和本地 `main` 集成。
- 本地提交或本地集成不产生 push、deploy、production、真实 Provider 或公开发布权限。

## 测试与审查

- 默认只运行与改动直接相关的测试、类型检查和格式检查。
- 失败时先修复并重跑失败项；交付前再跑一次相关测试。
- 全量回归只在 Phase 最终交付、高风险跨域改动或用户明确要求时运行一次。
- 普通任务不要求独立审计。高风险变更或 Phase 最终候选最多进行一次独立审查。
- 不因为本地 main 仍指向已经验证过的同一 commit 而重复全量测试。

## Git 与文件安全

- 保留用户已有和无关改动；不得擅自删除、reset、覆盖或暂存。
- 不读取、修改或提交用户明确要求忽略的 `audit_report.md`。
- 不执行 push、deploy、tag、生产操作，除非用户在当前任务中明确要求。
- migration 编号保持全局唯一；已发布/Lock 的 migration 不得改写。
- 发现真正的路径或语义冲突时暂停冲突部分，其余独立工作继续。

## 会话与事实来源

- 开始写入前只需确认当前分支、工作区状态和相关文件。
- 只有 Phase/Lock/发布任务才必须读取 `docs/CURRENT_STATE.md`。
- 旧 managed-worktree、registry、lease、transition 和 Integration Queue 已归档且不生效；真正并行写入只使用普通 Git 分支/worktree 隔离。
- Skill 按任务需要使用，不再机械执行完整 Skill 链。
- 当前代码、Git commit 和测试结果优先于旧报告；冲突只在会导致真实风险时阻塞。

## Human 交互

- Agent 应自行选择普通技术方案并继续施工，不把实现细节变成用户选择题。
- 一次任务授权覆盖完成该任务所需的常规可逆操作。
- 只有高风险范围扩大、不可逆操作、外部发布或缺少关键业务事实时才询问用户。
- 汇报以结果、剩余真实风险和文件位置为主，不重复输出治理过程。
