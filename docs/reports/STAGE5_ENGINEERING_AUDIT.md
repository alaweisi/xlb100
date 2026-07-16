# Stage 5 工程审计与 Go/No-Go 收口报告

日期：2026-07-16

基线：`main`，Stage 4 统一验收提交 `cc965ef0627cbce900b09e7f60837dc9beb0a7c2`
结论：**工程审计通过并带有已声明阻塞项；本地预生产模拟通过；Staging/Production NO-GO。**

本报告中的“Stage 5”是阶段 0–4 工程维修计划的最终审计阶段，不是仓库历史业务 Phase 5。审计只使用当前代码、Git 提交、仓库内证据和本轮可执行验证；不读取第三方 `audit_report.md`。

本轮未执行 push、deploy、tag、生产数据、生产 migration、真实 Provider、公开发布或其他外部操作。

## 1. 前序成果核验

| 阶段 | 已核验成果 | 审计结论 |
|---|---|---|
| Stage 0 | 精简治理规则已经替代归档的 Train/Manifest/Lease/Queue 流程 | PASS |
| Stage 1 | Phase 29 历史门禁、日期测试、lint/status、CI、合同与供应链门禁 | PASS |
| Stage 2 | JOSE 身份边界、Redis 限流、迁移执行可靠性、后台任务、恢复演练 | PASS |
| Stage 3 | Payment/SMS/OSS/Geo/Webhook 的 mock/local 闭集与故障模拟 | PASS — READINESS ONLY |
| Stage 4 | 数据恢复、安全性能、跨端 E2E 和统一预生产模拟验收 | PASS |

Stage 3 的 PASS 仅代表接入准备充分。`externalProviderExecuted=false`、真实模式不可配置、总开关 fail-closed；它不代表真实支付、短信、存储、地图或 Webhook 已经接入。

## 2. Stage 5 新增审计控制

- `docs/release/STAGE5_ENGINEERING_READINESS_MATRIX.json`：机器可读的工程证据、内部阻塞、外部阻塞和最终决策。
- `scripts/check-stage5-engineering-audit.mjs`：校验证据路径、Stage 4 提交祖先、必需工程项和 fail-closed 决策。
- `scripts/check-stage5-engineering-audit.test.mjs`：验证合法 NO-GO、错误 GO、缺失证据和第三方审计依赖均被正确处理。
- `scripts/run-stage5-engineering-audit.mjs`：统一执行 Stage 5 合同、矩阵、Stage 4D 证据重放和最终决策。
- `pnpm check:production-readiness`：当任何阻塞项未关闭时必须非零退出，避免把“工程审计通过”误读为“允许上线”。

## 3. 本轮可执行证据

统一命令：

```powershell
pnpm gate:stage5
```

结果：**PASS**，退出码 `0`，总耗时约 `535.1s`。

| 检查 | 结果 |
|---|---|
| Stage 5 审计合同 | 4/4 PASS |
| Readiness Matrix | 14 项有效，识别 8 个阻塞项 |
| Workspace 依赖链接 | 17 个 `@xlb/*` 链接全部位于当前仓库 |
| 共享契约 | 63 文件、270 项 PASS，1 项历史 todo |
| 依赖安全审计 | 424 packages / 475 installed versions，无 critical+ advisory |
| Workspace lint/typecheck/build | PASS |
| Provider readiness | 7 文件、36 项 PASS |
| Stage 4A 数据可靠性 | PASS |
| Stage 4C 安全/性能/故障注入 | PASS |
| 全量 unit/contract/integration/security 回归 | PASS |
| 架构与历史边界预检 | Phase 0–29 PASS |
| Stage 4B API 生命周期 | 5 文件、9 项 PASS |
| Customer/Worker/Admin 浏览器 E2E | 11 项 PASS |

本轮仍出现 Vitest workspace 弃用提示和一次 `MaxListenersExceededWarning`。两者未造成测试失败或证据缺失，列为非阻塞测试基础设施债务；后续应迁移到 `test.projects` 并定位 Commander listener 生命周期。

## 4. Go/No-Go 判定

| 判定层级 | 状态 | 说明 |
|---|---|---|
| 代码、契约和构建基线 | PASS | 可重复验证 |
| 本地数据可靠性 | PASS WITH BLOCKER | 恢复演练通过；本地 Outbox 大积压仍需处置 |
| Mock Provider 准备 | PASS | 只允许 mock/local/blocked envelope |
| 本地跨端业务验收 | PASS | 三端真实 API/MySQL/Chromium 验证通过 |
| 工程审计 | PASS WITH BLOCKERS | 审计本身完成，阻塞事实被机器门禁保护 |
| Staging 发布 | **NO-GO** | 尚无真实外部和运行环境证据 |
| Production 发布 | **NO-GO** | 不允许激活、部署或公开发布 |

### 内部工程阻塞

1. Stage 4 容量观测到本地 `event_outbox` 大量 pending/retry 数据；在真实候选前必须完成来源、消费吞吐、重放/清理策略和告警阈值审查。
2. 生产 Secret Manager、DNS/TLS/Ingress、托管 MySQL/Redis、监控告警、值班责任和 release-window replay 证据均未建立。
3. OA 与 Dashboard 仍是 readiness shell，不计入当前三端发布能力。

### 外部阻塞

以下事实由 Human 在 2026-07-16 明确提供：

1. 公司主体尚未注册，Provider 商业账户不可申请或不可用。
2. ICP/公开发布备案材料尚未完成。
3. Payment、SMS、OSS、Geo 等真实 Provider 凭据和 Sandbox 合同尚未具备。
4. 投资人与生产运营责任体系尚未建立。

这些外部事实不妨碍继续完善本地工程准备，但任何一项未关闭时都不得把 Mock/Sandbox 结果计为生产上线能力。

## 5. 收口结论

**Stage 5 工程审计施工完成。** 当前仓库已经达到“本地预生产模拟工程基线可复现、真实阻塞透明且 fail-closed”的目标。

当前合法状态：

```text
ENGINEERING_AUDIT = PASS_WITH_BLOCKERS
LOCAL_PREPRODUCTION_SIMULATION = PASS
STAGING_RELEASE = NO_GO
PRODUCTION_RELEASE = NO_GO
PRODUCTION_ACTIVATION_ALLOWED = false
```

未来只有在公司主体、备案、Provider、生产基础设施和运营责任人具备后，才开启独立的真实 Sandbox、Staging 部署与生产候选审计；届时仍需新的真实 Provider、deploy 和生产操作授权。

## 6. 复现命令

```powershell
pnpm test:stage5-audit
pnpm check:stage5-audit
pnpm gate:stage5

# 当前必须以非零退出并列出阻塞项
pnpm check:production-readiness
```

## 7. 2026-07-16 整改补充（覆盖旧的内部阻塞描述）

本轮继续整改后，`CAP-001` 已关闭：Outbox 已按事务消费者、投影/审计保留事实和历史状态不一致记录拆分，真实 claimable backlog 为 0；测试数据库已隔离，Vitest 弃用配置和 Redis 监听器泄漏也已修复。详见 `docs/reports/OUTBOX_RELIABILITY_REMEDIATION.md`。

仓库内可完成的生产准备也已补齐，包括不可变镜像、无构建部署、文件型密钥、MySQL/Redis TLS、非 root/只读容器、强 smoke、Ingress/TLS、Prometheus/Alertmanager/Grafana 模板。详见 `docs/release/PRODUCTION_REPOSITORY_READINESS.md`。

因此当前已无已知的“可在本仓库内直接修复却尚未处理”的 Stage 5 内部缺陷。`OPS-001` 至 `OPS-003` 仍是未实际开通的生产环境证据，外加公司主体、ICP、真实 Provider 与生产责任人等外部前置条件；它们继续使 Staging/Production 保持 `NO_GO`，不影响本地工程整改收口。

最终全量门禁进一步改为新鲜临时数据库，并修复了正式 seed 后 Phase 16 派生数据缺失、Platform Delivery 同秒 live-start 漏事件、生产安全测试环境不真实等问题。最终 `pnpm gate:stage5` 于 2026-07-16 通过，耗时 385.1 秒；详见 `docs/reports/FRESH_DATABASE_BOOTSTRAP_REMEDIATION.md`。
