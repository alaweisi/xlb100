# XLB Engineering Foundation — Phase 0

## 目标

在空仓库搭建「能跑、能测、能守门」的工程骨架。

## Phase 0 Definition of Done

- [x] pnpm monorepo + turbo
- [x] `@xlb/*` 共享包最小可用
- [x] 三端 Vite React 空壳（5173/5174/5175）
- [x] backend `/health` + `/api/system/status`
- [x] docker-compose local（MySQL 8 + Redis 7）
- [x] CI + preflight 守门
- [x] 架构文档基线

## Phase 0 禁止

见 `AGENTS.md` 与 `00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md`。

## Phase 1 预告

- RequestContext middleware
- CityRouter / city_code 解析
- ScopedExecutor + Admin RLS
- JWT AuthN（可选）
