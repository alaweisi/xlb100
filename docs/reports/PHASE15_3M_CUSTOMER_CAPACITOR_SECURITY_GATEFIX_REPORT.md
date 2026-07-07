# Phase 15.3M-GATEFIX Capacitor Security Asset Gatefix

## 结果
- 根因：`pnpm test -- --bail=1` 在 8C–8H 门禁中失败，均为 `UI:` 误报，命中以下文件：
  - `apps/customer/capacitor.config.ts`
  - `apps/customer/public/manifest.webmanifest`
  - `apps/customer/public/icons/customer-icon-192.svg`
  - `apps/customer/public/icons/customer-icon-512.svg`
  - `apps/customer/src/app/mobile-shell.css`（仅 `check-settlement-confirm...` 中因为未限制文件后缀导致误判）

## 误伤脚本
- `check-settlement-confirm-no-provider-withdraw-ui.ps1`（Phase 8C）  
  - 同步脚本做了 `git diff --name-only <base> -- apps/customer apps/worker apps/admin` 的全量目录比对，未过滤后缀，所以会抓到 `mobile-shell.css`。
- `check-settlement-payable-no-provider-withdraw-ui.ps1`（Phase 8D）
- `check-settlement-payable-queue-no-provider-withdraw-ui.ps1`（Phase 8E）
- `check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`（Phase 8H）
- `check-worker-receivable-statement-no-provider-withdraw-ui.ps1`（Phase 8F）
- `check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`（Phase 8G）

其中 8D/8E/8F/8G/8H 的失败源为三类 readiness 文件未在 allowlist 里。

## 修复措施（最小精确修复）
- 仅更新六个脚本的允许列表（精确 allowlist）：
  - `apps/customer/capacitor.config.ts`
  - `apps/customer/public/manifest.webmanifest`
  - `apps/customer/public/icons/*`（仅图标目录）
- 统一对 `apps/customer/apps/worker/apps/admin` 的变更只做相关后缀扫描：
  - `\.(tsx?|jsx?|ts|json|svg)$`
- 仅在 `check-settlement-confirm...` 中移除对非扩展过滤的全量扫描问题；其余 5 个脚本保持原有 `node_modules` 过滤并增加新 allowlist。

## 安全校验结果
- 单条 gate 验证：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-settlement-confirm-no-provider-withdraw-ui.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-settlement-payable-no-provider-withdraw-ui.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-settlement-payable-queue-no-provider-withdraw-ui.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-worker-receivable-statement-no-provider-withdraw-ui.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`
  - 六条全部输出 `PASS`。
- `rg` 安全关键字检查：
  - `rg "localhost:3000|127\\.0\\.0\\.1|/api/api|password|secret|token|SERVER_URL|server\\.url" apps/customer/capacitor.config.ts apps/customer/public/manifest.webmanifest apps/customer/public/icons scripts tests`
  - `rg "apps/customer/\\*\\*" scripts tests`
  - 未在 target 文件发现 staging 服务器地址、凭据、server.url 等高风险字段；测试脚本里仅有历史数据库工具链对 `localhost:3000` 的辅助调用，与门禁修复无关。
- 当前 `apps/customer/capacitor.config.ts` 与 `apps/customer/public/manifest.webmanifest` 未包含：
  - `server.url` 或固定 `staging` 地址（`server.url` 不在文件中）
  - 生产密钥、`token/secret/password`
  - API 业务配置

## 产物保留结论
- `apps/customer/capacitor.config.ts`：保留
- `apps/customer/public/manifest.webmanifest`：保留
- `apps/customer/public/icons/customer-icon-192.svg` / `customer-icon-512.svg`：保留
- 这是“静态就绪资源”，不涉及业务逻辑或后端调用。

## 根测试结果
- 执行：`pnpm test -- --bail=1`
- 结论：`PASS`（255 test files passed, 1048 tests passed, 1 todo）
- 之前 8C–8H 失败已消除，根测试重新恢复通过。

## 变更边界
- 未修改：
  - `backend/**`, `db/**`, `deploy/**`, `infra/**`
  - 生产配置
  - `tag`
- 仅改动了六个 legacy security gate 脚本，未新增依赖、未调整业务代码、未部署。
