# OFFICIAL_SERVICE_CATALOG_SOURCE.md — 用户确认源

> **STATUS: CONFIRMED**

## 说明

本文件是正式服务类目导入的**唯一用户确认源**。

## 源文件

| 项 | 值 |
|----|-----|
| 源文件 | `docs/catalog/服务类目完整清单.tsv` |
| 确认来源 | 用户上传并确认 |
| 一级大类数 | 16 |
| SKU 数 | 492 |
| SKU 编码 | 无重复 |
| item 层级 | L2>L3>L4 |
| 确认日期 | 2026-07-03 |

## 价格策略

三城（hangzhou · shanghai · beijing）当前**统一使用 TSV 中同一套正式价格**。

## 三城落库策略

| 规则 | 说明 |
|------|------|
| hangzhou | 独立 `price_rule` 记录 |
| shanghai | 独立 `price_rule` 记录 |
| beijing | 独立 `price_rule` 记录 |
| 当前价格值 | 三城相同（均来自 TSV） |
| 全国 fallback | **禁止** |
| `__global__` | **禁止**作为业务 cityCode |

## demo catalog

`demo_cleaning_*` 仅 Phase 3 验证用途。Phase 3A-1 导入后通过 `006_disable_demo_catalog.seed.sql` **禁用**（`is_enabled = 0`，不删除）。

## 16 个一级大类

1. 家庭保洁
2. 家电清洗
3. 家电维修
4. 上门安装
5. 管道疏通
6. 开锁换锁
7. 水电维修
8. 防水补漏/精准测漏
9. 家具家居维修保养
10. 房屋修缮/局部改造
11. 搬家搬运/拆旧清运
12. 甲醛检测治理
13. 数码办公维修
14. 洗衣洗鞋
15. 保姆月嫂/照护
16. 四害消杀

## 确认签字

| 项 | 值 |
|----|-----|
| 确认人 | 用户 |
| 确认日期 | 2026-07-03 |
| 覆盖城市 | hangzhou · shanghai · beijing |
