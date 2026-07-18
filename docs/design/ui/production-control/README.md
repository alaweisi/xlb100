# XLB UI 生产总控

本目录是三端纵向切片从“已定义”走向“真实交付”的控制面。

## 权威入口

- `UI_PRODUCTION_CHARTER.md`：四道门禁、状态机和完成声明；
- `SLICE_IMPLEMENTATION_LEDGER.json`：214 条机器可检查实施总账；
- `BATCH_TASK_TEMPLATE.md`：每个施工窗口的固定输入与交付格式；
- `batches/B0-01_GLOBAL_GATES.md`：生产总控启用后的第一个正式施工/验收包；
- `UI_PRODUCTION_BASELINE_REPORT.md`：当前真实覆盖率和阻断项；
- `UI_LANGUAGE_VIOLATIONS.json`：全中文门禁的逐文件债务；
- `SLICE_ACCEPTANCE_CONSOLE.html`：全量切片验收索引；
- `UI_PRODUCTION_RATCHET_BASELINE.json`：CI 不得回退的当前基线。

## 常用命令

```bash
pnpm ui:control:sync
pnpm ui:control:check
pnpm ui:control:audit
pnpm ui:control:capture
pnpm ui:gate:ratchet
pnpm ui:gate:release
pnpm test:ui-control
```

`ui:control:check` 验证 214 条结构完整；`ui:gate:ratchet` 阻止新增英文或覆盖率回退；`ui:gate:release` 是正式 UI 发布门禁，在 214 条全部完成前应明确失败。

验收控制台不是产品第四端。它只索引真实 App 路由、测试和 Edge 证据，缺失项保持红灯。
