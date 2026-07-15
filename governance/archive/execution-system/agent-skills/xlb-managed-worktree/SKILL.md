---
name: xlb-managed-worktree
description: >-
  Optional XLB isolation helper for genuinely concurrent high-risk writes,
  migrations, production preparation, or an explicitly requested managed
  worktree. It is not used for ordinary development.
---

# XLB Managed Worktree — 精简规则

现行政策以仓库根目录 `AGENTS.md` 和
`governance/00_LEAN_EXECUTION_POLICY.md` 为准。

## 何时使用

仅在以下情况使用本 Skill：

- 两个以上 Agent 确实并行写入；
- schema/migration、支付、账本、权限等高风险工程；
- production/Provider/Lock 准备；
- Human 明确要求受管 worktree。

普通文档、测试、页面、重构、非敏感业务代码、开发配置和局部脚本修改
不使用本 Skill，不要求 Train/WU/Lease/Queue，也不运行
`check-managed-worktree-boundaries.ps1`。

## 精简隔离要求

1. 不同写入单元使用不同 branch/worktree。
2. 只按实际文件和真实语义冲突划分所有权；`scripts/**` 不整体串行。
3. 只有实际访问数据库或 Redis 的单元才分配独立实例和端口。
4. migration 编号必须唯一，已发布 migration 不得改写。
5. 一个高风险范围取得一次 Human 明确同意后，可连续完成本地施工、相关测试和本地集成。
6. push、deploy、生产数据和真实 Provider 仍需执行前单独同意。

## 验证

默认运行相关测试。完整 managed-worktree 历史检查仅在高风险专项明确采用旧台账模型时运行；不得把它机械用于普通任务。
