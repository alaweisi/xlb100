# @xlb/oa

喜乐帮总部与分公司协同运营系统，Web 入口为 `/oa/`。

当前运行时包括：

- 独立 OTP 登录、服务端会话、组织成员身份和城市/权限有效范围。
- 待办、任务、审批、通知、审计记录与分公司活动实时汇聚。
- 总部/分公司组织、角色、成员、城市所有权和双人复核委派管理。
- 通过 60 秒、单次消费的安全票据进入现有 Admin 领域能力；Admin 业务状态机与数据事实源保持唯一。
- SSE 实时事件、断线状态和会话失效处理。

本地开发：

```powershell
pnpm --filter @xlb/oa dev
```

构建与类型检查：

```powershell
pnpm --filter @xlb/oa build
pnpm --filter @xlb/oa typecheck
```

1440×1024 OA/Dashboard 浏览器验收：

```powershell
pnpm exec playwright test --config=playwright.oa-dashboard.config.ts
```

生产接入由统一 Nginx/Helm/TKE 配置提供 `/oa/` 静态入口和 `/api/oa/events`
SSE 代理；本地竣工不代表已 push、deploy 或启用生产数据。
