# 喜乐帮 / XLB

五端产品（Customer App · Worker App · Admin App · OA Web · Dashboard Wallboard）+ 后端 + 共享包 Monorepo。

**本地路径：** `G:\xlb100`  
**当前状态：** Phase 29 已锁定；Phase 14 生产就绪度仍在推进，staging/production 暂为 NO-GO。
**事实源：** [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md)

当前仓库已经覆盖 Catalog/Pricing、Order、Payment、Dispatch、Fulfillment、Ledger、Settlement、Support、Notification、Review 与 Marketing 等模块。正式服务类目来源见 `docs/catalog/`。

## 要求

- Node.js >= 20
- pnpm >= 9
- Docker（可选，用于本地 MySQL + Redis）

## 安装

```bash
pnpm install
```

## 启动

```bash
# 全部 dev（turbo）
pnpm dev

# 或单独启动
pnpm --filter @xlb/backend dev      # http://localhost:3000
pnpm --filter @xlb/customer dev     # http://localhost:5173
pnpm --filter @xlb/worker dev       # http://localhost:5174
pnpm --filter @xlb/admin dev        # http://localhost:5175
pnpm --filter @xlb/oa dev           # http://localhost:5176
pnpm --filter @xlb/dashboard dev    # http://localhost:5177
```

## 构建

```bash
pnpm build
```

## 类型检查

```bash
pnpm typecheck
```

## 测试

```bash
pnpm test
```

## 架构守门（Preflight）

```bash
pnpm preflight
```

## 本地基础设施

```bash
docker compose -f deploy/compose/docker-compose.local.yml up -d
docker compose -f deploy/compose/docker-compose.local.yml ps
```

## 五端说明

| App | 端口 | 说明 |
|-----|------|------|
| customer | 5173 | C 端 · 用户下单服务入口 |
| worker | 5174 | W 端 · 师傅接单履约入口 |
| admin | 5175 | A 端 · 运营审核管理入口 |
| oa | 5176 | OA · 电脑端总部总后台，与 Admin 业务同源、权限级别独立治理 |
| dashboard | 5177 | Dashboard · 总部 16:9 只读实时大屏 |

## 文档

- [AGENTS.md](./AGENTS.md) — AI Agent 必读
- [docs/CURRENT_STATE.md](./docs/CURRENT_STATE.md) — 当前 Phase、Lock 与生产边界事实源
- [docs/architecture/](./docs/architecture/) — 架构约束
- [五端产品宪法](./docs/architecture/01_XLB_FIVE_SURFACE_CONSTITUTION.md) — 端形态、权限和部署映射事实源
