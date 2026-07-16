# 新鲜数据库初始化整改收口

日期：2026-07-16

结论：全量测试已从复用 `xlb_local` 改为每次创建独立 `xlb_test_*`，由真实 migrate/seed 初始化，测试结束后无论成功或失败都自动删除。该方式暴露并修复了旧持久测试库长期掩盖的两个初始化缺陷。

## 已修复缺陷

1. Phase 16 migration 在空库上先于正式目录/价格 seed 执行，导致服务画像、服务标准和透明费用项没有正式 SKU 可供派生。新增幂等后置 seed `012_phase16_derived_data.seed.sql`，在正式目录和价格之后生成每个有效 SKU 的画像、三类标准及每个价格规则的五类费用项。
2. `event_outbox.created_at` 是秒精度，而 Platform Subscription live-start 是毫秒精度。同秒内晚提交的事件可能被毫秒游标排除。Platform Delivery 现在将查询游标归一到 Outbox 秒精度，并继续使用 event id 作为同秒边界。
3. DB health 集成测试不再硬编码 `xlb_local`，而是验证当前明确配置的数据库名。
4. 生产安全测试补齐 Redis 密码、MySQL/Redis TLS 和显式生产资源地址；OTP 持久化测试在 test 环境显式关闭 debug，不再伪装连接一个无 TLS 的“生产”Redis。

## 验证

- 独立 Phase 28 新鲜数据库回归：4/4 PASS。
- Pricing、Order、Phase 29、DB health、OTP、Phase 23A 安全定向新鲜库回归：除已定位的游标问题外其余 37 项 PASS；游标修复后完整回归通过。
- `pnpm gate:stage5`：PASS，385.1 秒；临时数据库自动清理。
