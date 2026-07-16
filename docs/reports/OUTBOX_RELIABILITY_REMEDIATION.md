# Outbox 可靠性整改收口

日期：2026-07-16

结论：原 Stage 5 的 `CAP-001` 不是 64 万条实时消费积压。整改后，运行时监控、容量证据和测试环境已经按 Outbox 真实消费语义拆分；历史状态不一致会被单独暴露，投影/审计保留记录不再触发实时队列老化告警。

## 根因与修复

- `event_outbox` 同时承载事务消费者事件、投影源和审计保留事实，旧指标把三者全部视为实时队列。
- 事务消费者的唯一事件集合现在由 `backend/src/streams/outboxEventCatalog.ts` 导出，监控与容量脚本共用同一语义。
- `dataReliability` 只按 `order.created`、`fulfillment.completed`、`refund.approved` 统计事务状态，并按各消费者真实聚合状态计算可消费年龄。
- 旧的跨类型 `OR/EXISTS` 全表扫描已拆为三条索引查询；状态统计改用 `idx_event_outbox_typed_claim`。
- 已跨过消费状态但仍为 pending/retry 的历史事务记录通过 `xlb_outbox_stalled_transactional_events` 单独告警，不再被隐藏或伪标为 published。
- 非事务历史 processing 记录不会污染事务 lease 指标。
- 全量 Vitest 数据库测试改为临时 `xlb_test_*` 数据库，执行 migrate/seed 后运行，并在 `finally` 删除，避免继续污染 `xlb_local`。

## 2026-07-16 本地历史库只读证据

| 指标 | 数值 |
|---|---:|
| Outbox 总行数 | 770,946 |
| pending/retry 总数 | 647,086 |
| 事务类 pending/retry | 24,549 |
| 当前真实可消费 | 0 |
| 历史状态不一致事务记录 | 24,549 |
| 投影/审计保留记录 | 622,537 |
| 最老真实可消费年龄 | 0 秒 |
| 存储容量包络 | PASS |
| 可消费实时积压健康 | PASS |
| 历史事务一致性 | FAIL（本地旧测试历史，不作为发布候选） |
| 综合运行健康 | FAIL（由历史事务一致性明确拉低） |

这些历史记录未被删除或篡改，容量脚本也不会把“真实可消费为 0”误写成综合运行健康。真实环境的历史不一致处置必须基于下游幂等事实做 reconciliation；禁止盲删或批量伪标 published。新鲜 migrate/seed 候选的事务一致性为 PASS，详见 `FRESH_DATABASE_BOOTSTRAP_REMEDIATION.md`。

## 验证

```powershell
pnpm exec vitest run --project unit-contract tests/unit/stage2c1DataReliability.test.ts tests/unit/stage2c3OutboxCapacity.test.ts
.\scripts\check-stage2c4-dr-capacity.ps1
.\deploy\backup\measure-capacity.ps1 -Environment local
```
