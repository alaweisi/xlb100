# XLB 精简执行政策

状态：自 2026-07-15 起生效，由 Human Owner 明确要求在半小时内降低治理负担。

## 1. 优先级

本文件与仓库根目录 `AGENTS.md` 是当前执行政策。旧 Release Train、Work Unit、Manifest、Lease、Transition、managed-worktree 和 Integration Queue 资料已移动到 `governance/archive/`，仅作历史参考，不再产生执行权限或阻塞效力。

## 2. 目标

- 普通 Phase 当天完成。
- Human 每个普通 Phase 最多介入一次。
- 治理时间不应成为主要开发时间。
- 自动化服务于交付，不以重复生成记录代替工程结果。
- `G:\xlb100` 是当前本地唯一权威仓库和物理施工区，XLB 顾客端、师傅端、后台管理端及三个 Android 原生壳统一在同一 Monorepo 架构内演进。

## 2.1 唯一施工区与总体架构

- 所有代码写入、构建、测试、APK 产物和本地提交只能进入 `G:\xlb100`。
- 不得擅自在其他目录创建或保留 XLB clone、复制项目、worktree、分部施工仓库或三个独立端仓库。
- 默认不得新建施工分支或 worktree；多 Agent 仅可并行只读，所有写入由单一协调者在当前分支串行完成。
- 未经 Human Owner 明确同意，不得新增顶层工程、改变三端归属、拆分仓库、复制业务事实源或绕过既有共享契约。
- Human Owner 明确批准的临时例外必须说明目的和范围，并在任务结束前归并回 `G:\xlb100`、清理临时载体。

## 3. 普通开发

普通开发默认授权 Agent 在 `G:\xlb100` 当前分支完成请求范围内的读取、编辑、相关测试和本地提交。

普通开发不需要 Train Charter、Work Unit Manifest、Lease、Reservation、Queue、Transition、固定确认文字、两级审计、隔离数据库或完整 Git DAG 扫描。

## 4. 高风险工程

以下项目在首次写入前需要 Human 一次明确同意：

- schema/migration 和破坏性数据处理；
- 认证、授权和隐私边界；
- 支付、退款、账本、结算和金额算法；
- 共享契约的破坏性变更；
- 多单元并行修改同一业务真相。

批准覆盖说明范围内的本地施工、相关测试、后续 commit 和本地集成，不要求逐状态重复确认。Agent 只需把 Human 的自然语言回复写入本地一行批准日志；不创建 staged-tree 绑定文件，不设置过期时间或环境变量。

## 5. 外部与生产

push、deploy、生产数据、真实 Provider、公开发布以及不可逆外部操作仍需在执行前单独明确同意。自然语言表达明确即可，不要求固定句式。

## 6. 并行、环境和测试

- 同时只允许一个写入单元；其他 Agent 可以并行只读分析或审查。
- 不通过额外分支、worktree 或场外仓库并行写入。
- 纯文档、静态脚本、单元测试和不访问运行时的代码不需要 Compose/MySQL/Redis 隔离资源。
- 默认执行相关测试；全量回归仅在最终 Phase 候选、高风险跨域改动或用户要求时执行一次。
- 普通任务不审计；高风险或最终 Phase 候选最多一次独立审查。

## 7. 高风险闭环

1. commit 前脚本客观识别敏感路径并展示类别与文件；
2. Human 用自然语言确认一次；
3. Agent 记录一行本地批准日志并继续相关测试、commit 和本地集成；
4. 同一批次新增敏感路径时才重新确认。

不使用 Integration Queue、Train、Manifest、Lease、Transition 或审批文件。Phase 最终候选按普通 Git 分支、review、相关回归和本地合并处理；push、deploy 或 production 仍需单独授权。

## 8. 继续保留的底线

- 不覆盖用户改动。
- 唯一施工区为 `G:\xlb100`，三端必须保持在同一总体架构内。
- migration 编号不冲突，已发布 migration 不改写。
- 高风险写入先获得一次同意。
- 外部和生产操作单独同意。
- 相关测试失败不得宣称完成。
