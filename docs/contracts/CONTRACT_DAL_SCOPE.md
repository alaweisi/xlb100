# CONTRACT_DAL_SCOPE.md — 喜乐帮 / XLB

## 原则

1. **所有 DB 访问必须经过 `backend/src/dal/`**
2. **禁止**业务模块直接 `createPool` / `createConnection`
3. **Repository** 必须继承 `RepositoryBase`
4. **city scoped 查询** 必须带 `RequestContext.cityCode`

## ScopedExecutor

| 函数 | 说明 |
|------|------|
| `assertCityScopedContext(context)` | 无 cityCode → 抛错 400 |
| `buildCityScopedWhere(cityCode)` | 生成 `city_code = ?` |
| `executeCityScoped(context, fn)` | 在 city 约束下执行 |

## AdminQueryGuard

| 函数 | 说明 |
|------|------|
| `fetchAdminCityScopes(userId)` | 查 `admin_city_scopes` 表 |
| `assertAdminCityScope(userId, cityCode)` | DB 校验 scope |
| `assertAdminCanAccessCity(context, cityCode)` | 结合 RequestContext |
| `forbidUnscopedAdminQuery()` | 禁止无 scope 的 admin 查询 |

**Global admin：** `admin_city_scopes.city_code = '__global__'`（**仅**存在于 scope 表，**不在** `cities` 表），访问任意城市但仍须**显式**指定业务 `city_code` 过滤。

**Reserved：** `__global__` 不得作为业务 `cityCode`（validator 拒绝）。

## 禁止默认全国

缺失 `city_code` 的 scoped 查询 → **400 / 403**
