# PHASE 15.3V-1 Root Test Gate Triage

Date: 2026-07-08
Scope: Customer first-knife validation triage only (no code changes in apps/customer, apps/worker, apps/admin, backend, db, deploy, infra)
Baseline commits: existing security gate scripts and test harness behavior unchanged.

## Inputs reviewed
- `tests/security/settlementConfirmNoProviderWithdrawUi.test.ts`
- `tests/security/settlementPayableGates.test.ts`
- `tests/security/settlementPayableQueueGates.test.ts`
- `tests/security/workerReceivableStatementExportGates.test.ts`
- `tests/security/workerReceivableStatementGates.test.ts`
- `tests/security/workerReceivableStatementReviewGates.test.ts`
- `tests/security/helpers/runPowerShellGate.ts`
- `scripts/check-*.ps1` (6 no-provider-withdraw variants)
- direct diagnostics invoked as requested

## Direct diagnostics command set
- `pnpm test -- tests/security/settlementConfirmNoProviderWithdrawUi.test.ts --runInBand`
- `pnpm test -- tests/security/settlementPayableGates.test.ts --runInBand`
- `pnpm test -- tests/security/settlementPayableQueueGates.test.ts --runInBand`
- `pnpm test -- tests/security/workerReceivableStatementExportGates.test.ts --runInBand`
- `pnpm test -- tests/security/workerReceivableStatementGates.test.ts --runInBand`
- `pnpm test -- tests/security/workerReceivableStatementReviewGates.test.ts --runInBand`

Observed: all six command forms run and fail consistently in the same security-script throw path.

## Root gate pattern (shared)
For all six failures, `runPowerShellGate(...)` executes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-<xxx>-no-provider-withdraw-ui.ps1
```

And each script computes:

```powershell
$diff = git diff --name-only <baselineCommit> -- apps/customer apps/worker apps/admin |
  Where-Object { $_ -match '\.(tsx?|jsx?|ts|json|svg)$' -and $_ -notmatch 'node_modules' }
$nonAllowed = $diff | Where-Object { $allowed -notcontains $_ }
if ($nonAllowed.Count -gt 0) { throw "<gate> ..." }
```

So this family is failing on **allowlist mismatch**, not an actual provider-withdraw pattern match.

## Failure matrix

### 1) `tests/security/settlementConfirmNoProviderWithdrawUi.test.ts`
1. **Failing test name**: `settlementConfirmNoProviderWithdrawUi` family (single gate assertion)
2. **PowerShell script invoked**: `check-settlement-confirm-no-provider-withdraw-ui.ps1`
3. **Exact command**: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-settlement-confirm-no-provider-withdraw-ui.ps1`
4. **Exact forbidden condition**: any changed UI file under `apps/customer|apps/worker|apps/admin` not in the script's `allowed` whitelist
5. **Why Customer UI files were listed**: `git diff <baseline> -- apps/customer` includes new/modified C 端页面与适配/入口文件（如 `apps/customer/src/pages/*`, `apps/customer/src/app/App.tsx`, `apps/customer/src/adapters/*`），而该列表不在该脚本白名单
6. **Failure type**: `PHASE_SCOPE_MISMATCH`
7. **Introduced by 1c71b81 / 16a213a**:
   - `16a213a`: **No** (does not touch listed customer UI files)
   - `1c71b81`: **Yes (likely contributor)** because many C 端 page/service-entry files changed relative to legacy baseline now captured by this diff check
8. **Minimal safe fix**: narrow this gate to settlement-confirm domain paths only (or equivalent) instead of broad `apps/customer` scan; keep provider-withdraw intent check intact.

### 2) `tests/security/settlementPayableGates.test.ts`
1. **Failing test name**: `settlementPayableNoProviderWithdrawUi` in this suite + possibly multiple test entries that delegate to helper gate
2. **PowerShell script invoked**: `check-settlement-payable-no-provider-withdraw-ui.ps1`
3. **Exact command**: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-settlement-payable-no-provider-withdraw-ui.ps1`
4. **Exact forbidden condition**: changed UI file in scoped directories not in allowed list for settlement-payable domain
5. **Why Customer UI files were listed**: same broad directory-level diff scope catches any changed C 端 files, including service discovery/order-entry slice files and adapters not belonging to settlement-payable path
6. **Failure type**: `PHASE_SCOPE_MISMATCH`
7. **Introduced by 1c71b81 / 16a213a**:
   - `16a213a`: **No**
   - `1c71b81`: **Yes (likely contributor)**
8. **Minimal safe fix**: constrain this script's diff root to intended settlement-payable files only (e.g., admin settlement payable pages/components), or add explicit path-based allowlist for settlement domain and explicitly exclude all `apps/customer/**`.

### 3) `tests/security/settlementPayableQueueGates.test.ts`
1. **Failing test name**: `settlementPayableQueueNoProviderWithdrawUi`-style assertion in this suite
2. **PowerShell script invoked**: `check-settlement-payable-queue-no-provider-withdraw-ui.ps1`
3. **Exact command**: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-settlement-payable-queue-no-provider-withdraw-ui.ps1`
4. **Exact forbidden condition**: any file in `apps/customer|apps/worker|apps/admin` outside fixed allowed set triggers failure
5. **Why Customer UI files were listed**: baseline is an older commit where allowed list does not include newly added C 端 UAT-chain files; those files therefore appear as non-allowed UI diffs
6. **Failure type**: `PHASE_SCOPE_MISMATCH`
7. **Introduced by 1c71b81 / 16a213a**:
   - `16a213a`: **No**
   - `1c71b81`: **Yes (likely contributor)**
8. **Minimal safe fix**: limit diff collection to settlement-payable-queue admin scope and/or gate by file glob (`apps/admin/src/pages/settlement*` etc.) before allowlist.

### 4) `tests/security/workerReceivableStatementExportGates.test.ts`
1. **Failing test name**: `workerReceivableStatementExportNoProviderWithdrawUi`-style assertion in this suite
2. **PowerShell script invoked**: `check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`
3. **Exact command**: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`
4. **Exact forbidden condition**: disallows any changed admin worker-receivable-export-related UI file that is not in script allowlist; here broadened to all UI diffs in apps/customer/worker/admin
5. **Why Customer UI files were listed**: script currently diffs all three app roots; resulting set includes C 端 service-entry and page files not in its `allowed` set
6. **Failure type**: `PHASE_SCOPE_MISMATCH`
7. **Introduced by 1c71b81 / 16a213a**:
   - `16a213a`: **No**
   - `1c71b81`: **Yes (likely contributor)**
8. **Minimal safe fix**: narrow this rule to worker receivable export/admin path patterns and keep explicit deny rule for provider withdraw features unchanged.

### 5) `tests/security/workerReceivableStatementGates.test.ts`
1. **Failing test name**: `workerReceivableStatementNoProviderWithdrawUi`-style assertion in this suite
2. **PowerShell script invoked**: `check-worker-receivable-statement-no-provider-withdraw-ui.ps1`
3. **Exact command**: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-worker-receivable-statement-no-provider-withdraw-ui.ps1`
4. **Exact forbidden condition**: gate throws when changed UI file set outside whitelist is non-empty
5. **Why Customer UI files were listed**: whitelist is centered on worker/settlement review admin path; not on customer service-entry flow paths currently being developed in this phase
6. **Failure type**: `PHASE_SCOPE_MISMATCH`
7. **Introduced by 1c71b81 / 16a213a**:
   - `16a213a`: **No**
   - `1c71b81`: **Yes (likely contributor)**
8. **Minimal safe fix**: constrain checks to worker-receivable statement intended domain directories and do not include `apps/customer/**` in this rule.

### 6) `tests/security/workerReceivableStatementReviewGates.test.ts`
1. **Failing test name**: `workerReceivableStatementReviewNoProviderWithdrawUi`-style assertion in this suite
2. **PowerShell script invoked**: `check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`
3. **Exact command**: `powershell -NoProfile -ExecutionPolicy Bypass -File <repo>/scripts/check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`
4. **Exact forbidden condition**: any non-whitelisted UI change under apps/customer/worker/admin fails.
5. **Why Customer UI files were listed**: customer service route pages/components were added/updated and hit the diff before path filtering into intended review domain.
6. **Failure type**: `PHASE_SCOPE_MISMATCH`
7. **Introduced by 1c71b81 / 16a213a**:
   - `16a213a`: **No**
   - `1c71b81`: **Yes (likely contributor)**
8. **Minimal safe fix**: scope script to worker receivable review admin paths and keep explicit provider-withdraw deny constraints.

## Cross-cutting root-cause assessment
- These failures are **not** data-model, pricing/order/payment-contract, or customer business logic regressions.
- Failures are consistent with a **legacy/global gate** that still diffs broad app roots with static whitelists while current Customer scope has expanded to real service-discovery/order-entry UI paths.
- In short, this is a **security-gate scope baseline mismatch**, i.e., a **false positive** risk for this phase, but should be fixed with narrowly targeted scope correction instead of weakening checks.

## Proposed gate-scope correction (minimal and safe)
1. For each of the 6 scripts, keep all provider-withdraw content checks but switch from:
   - `git diff --name-only <baseline> -- apps/customer apps/worker apps/admin`
   to narrowly-scoped globs targeting the check domain, for example:
   - settlement: `apps/admin/src/pages/settlement*/**`
   - worker receivable: `apps/admin/src/pages/worker*/**` (and review/export/sub-variants)
2. Keep `if ($nonAllowed.Count -gt 0) throw` behavior unchanged.
3. Remove `apps/customer/**` from these scripts unless a customer-specific no-withdraw gate is explicitly required in scope.
4. Preserve hard security intent:
   - keep disallowing provider-withdraw UI
   - do not add broad allowlists
   - do not downgrade to allow fake settlement/receivable actions

This preserves security guarantees and restores phase alignment: C端服务发现/下单入口不在这些结算与Worker收款审核专用门禁的扫描域内。

## Conclusion
These are test gate false positives due to gate scope/baseline drift, not backend contract or C端实现错误. Customer first knife remains blocked on root test stage, and Worker/Admin second knife must remain blocked until this triage is resolved and full root validation is re-run.
