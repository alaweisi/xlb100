# CONTRACT_CITY_CONFIG.md — 喜乐帮 / XLB

## 定义

CityConfig 是**城市级配置**，不是订单、支付或交易数据。

## 类型

`CityConfigSnapshot`: cityCode · version · isOpen · timezone · serviceEnabled · pricingEnabled · updatedAt

## 规则

1. 所有查询必须带 `RequestContext.cityCode`
2. 禁止 `__global__` 作为业务 cityCode
3. 禁止全国默认配置 fallback
4. admin 写配置必须经过 `AdminQueryGuard`
5. Repository 必须继承 `RepositoryBase` 并走 `ScopedExecutor`

## API

| 方法 | 路径 | 要求 |
|------|------|------|
| GET | `/api/city-config/current` | x-xlb-app-type · x-xlb-role · x-xlb-city-code |

## Phase 3 不做

订单 · 支付 · 派单 · 履约 · 账本 · 退款 · 资质审核
