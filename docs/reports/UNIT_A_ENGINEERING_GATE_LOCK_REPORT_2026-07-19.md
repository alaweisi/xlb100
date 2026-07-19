# Unit A 全量门禁修复 Lock 报告

日期：2026-07-19

分支：`codex/unit-a-gate-lock`

结论：**Unit A 工程施工完成并通过本地全量验收；staging/production 仍为 NO-GO。**

## 1. 授权与边界

- Human 于 2026-07-19 明确授权“进入 Unit A：修复全量门禁、硬编码、状态解析和偶发超时；自行验收；完成并提交 Lock”。
- 本批次未新增或改写 migration/schema，未改变支付、退款、账本、结算、金额规则或真实 Provider。
- 未执行 push、deploy、tag、生产数据、生产迁移或公开发布。
- `audit_report.md` 未被读取、修改或纳入验收证据。

## 2. 已关闭问题

| 工程项 | 根因 | 修复结论 |
|---|---|---|
| Phase 25 硬编码门禁 | 新版 Customer 下单页直接使用尺寸、字号、行高和 z-index；门禁又把 CSS 变量声明误算为字体硬编码 | 新增 canonical dimension/typography/z-index token，页面改用变量；字体门禁只放行无 fallback 的 `var(--xlb-*)`（可带 `!important`），不抬高历史基线 |
| Phase 27/28 状态门禁 | 脚本写死历史文本 `Phase 14 / IN PROGRESS / 64/100`，与当前表格状态冲突 | 新增 Markdown 表格结构化解析器；兼容历史 NO-GO 和当前 `ENGINEERING REMEDIATION LOCKED / PRODUCTION BLOCKED`，缺失/重复/生产就绪均 fail-closed |
| 全国派单边界偶发超时 | 单测通过 shell 字符串启动 PowerShell，并依赖 Vitest 默认 5 秒 | 改为参数化 `spawnSync`、15 秒子进程硬超时和 20 秒用例上限，保留非零/信号/错误断言 |
| Worker 单测偶发超时 | 完整回归负载下多个异步查询仍使用 Testing Library 默认 1 秒 | 仅在 Worker App 测试文件内设置 5 秒异步上限，结束后恢复默认值；未修改全局测试超时 |
| 浏览器流程顺序依赖 | 干净库没有 Worker `phone_hash`、客服路由组；部分 E2E 依赖其他套件残留 | 各套件自行创建并清理身份/路由夹具；临时手机号绑定连同 `updated_at` 精确恢复 |
| 浏览器异步竞态 | 连续点击发送验证码、调试码和登录，按钮尚禁用时继续执行 | 等待验证码提示、精确 code 输入框六位值和 Login enabled 后再点击 |
| 新 UI 契约漂移 | 通知入口出现同 href 链接；Phase 29 仍按旧单页表单操作新版四步预约页 | 改用可访问名称精确定位；Phase 29 按服务、地址、时间、确认四步完成真实优惠券报价与下单 |
| Phase 28 游标测试偶发失败 | 仅改 Base64URL 最后字符，未使用比特可使不同字符串解码为相同字节 | 直接修改 envelope 内 HMAC 签名字节，稳定验证篡改拒绝语义 |
| 静态质量门禁 | `dataReliability.ts` 存在未使用局部变量 | 删除无行为影响的死变量与累加逻辑，lint 恢复零告警 |

## 3. 硬编码基线

最终 `--print-hardcodes` 结果：

| App | color | dimension | inline style | raw font declaration | numeric z-index |
|---|---:|---:|---:|---:|---:|
| Customer | 21 | 35 | 53 | 0 | 0 |
| Worker | 28 | 20 | 46 | 0 | 0 |
| Admin | 71 | 90 | 146 | 0 | 0 |

Customer 仍低于 Gate 1A 允许上限 `39 / 43 / 66 / 1 / 0`；本批次没有通过抬高 baseline 放行。

## 4. 验收证据

- `pnpm gate:stage5`：PASS，最终耗时 `423.2s`。
- Stage 5 audit contract：4/4；readiness matrix：16 项有效证据、7 项真实生产 blocker。
- workspace links：17/17；lint：17/17；typecheck/build/contract/Provider/Stage 4A/4C/architecture preflight 全部通过。
- contract：63 files / 270 passed / 1 historical todo。
- unit-contract 全量压力回归：198 files / 1,109 passed / 1 historical todo。
- DB/security/integration：200 files passed、1 file skipped；626 passed、1 skipped。
- 核心真实数据库生命周期：5 files / 9 tests。
- 浏览器 E2E：Customer/Worker/Admin 3 + authenticated 3 + support 1 + notification 2 + review 1 + marketing 1，合计 11/11。
- 最终输出：`ENGINEERING AUDIT PASSED WITH DECLARED BLOCKERS`；`STAGING/PRODUCTION RELEASE REMAINS NO-GO`。
- 全量运行使用一次性 `xlb_unit_a_<timestamp>` MySQL 数据库和专用 Redis；结束后已确认无临时数据库或容器残留。

## 5. Lock 判定

Unit A 对“全量门禁、硬编码、状态解析和偶发超时”的施工目标已经关闭，可提交本地 Lock commit。该 Lock 只代表当前仓库工程基线通过，不代表商业生产上线批准。

仍保留的 7 个生产阻断项：

1. `OPS-001`：生产 Secret Manager、凭据、轮换负责人和最小权限清单未具备。
2. `OPS-002`：生产 DNS/TLS/ingress、MySQL/Redis 和托管备份拓扑未配置验证。
3. `OPS-003`：生产仪表盘、告警路由、on-call 负责人和发布窗口 replay 证据不存在。
4. `EXT-001`：公司主体及商业 Provider 账户未具备。
5. `EXT-002`：ICP 与公开发布备案材料未具备。
6. `EXT-003`：真实 Payment/SMS/Object Storage/Geo 凭据与 sandbox 合同未具备。
7. `EXT-004`：投资人与生产运营责任归属未建立。

因此保持：`STAGING_RELEASE=NO_GO`、`PRODUCTION_RELEASE=NO_GO`、`PRODUCTION_ACTIVATION_ALLOWED=false`。
