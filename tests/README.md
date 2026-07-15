# tests — 喜乐帮 / XLB

测试体系覆盖：

- `unit/`：单元和前端组件测试；
- `contract/`：共享契约与 API 边界测试；
- `integration/`：MySQL/Redis 与模块集成测试；
- `security/`：身份、城市、角色和敏感边界测试；
- `e2e/`：跨端关键流程；
- `performance/`：并发与性能基线。

根目录 `pnpm test` 负责执行默认测试项目；Phase 专项命令见根 `package.json`。当前 Phase 和 Lock 状态以 [`../docs/CURRENT_STATE.md`](../docs/CURRENT_STATE.md) 为准。
