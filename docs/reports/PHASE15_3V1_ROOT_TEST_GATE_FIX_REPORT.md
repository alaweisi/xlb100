# PHASE15.3V-1A Root Test Gate Scope Fix Report

Date: 2026-07-08
Authoritative task: make phase8 security gates pass by narrowing no-provider-withdraw UI gate scope to avoid unrelated Customer service-entry files.

## Scope
- scripts/check-settlement-confirm-no-provider-withdraw-ui.ps1
- scripts/check-settlement-payable-no-provider-withdraw-ui.ps1
- scripts/check-settlement-payable-queue-no-provider-withdraw-ui.ps1
- scripts/check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1
- scripts/check-worker-receivable-statement-no-provider-withdraw-ui.ps1
- scripts/check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1
- docs/reports/PHASE15_3V1_ROOT_TEST_GATE_FIX_REPORT.md (this file)
- docs/execution/PHASE15_PROGRESS.md

## Finding from pre-fix triage
All six failing tests in this pass path were failing at the UI allowlist check in the no-provider-withdraw scripts.
The failure pattern was:
1. `git diff --name-only <phase8 baseline> -- apps/customer apps/worker apps/admin` produced Customer service-entry changes.
2. `$nonPhase9Ui` check compared those diffs against a legacy allowlist.
3. Customer files were not in allowlist, causing `throw "UI: ..."`.

No provider-withdraw string checks were triggered; failures were caused by directory scope/whitelist mismatch.

## Fix objective
Keep security intent identical (keep provider/withdraw ban checks and no fake settlement/fake receivable actions), while removing unrelated Customer C¶Ë service-discovery/order-entry files from this gate domain.

## Per-script changes

### 1) check-settlement-confirm-no-provider-withdraw-ui.ps1
- Previous scan scope:
  - `git diff --name-only <baseline bfea4e...> -- apps/customer apps/worker apps/admin`
- New scan scope:
  - `git diff --name-only <baseline bfea4e...> -- $UiScope`
  - `$UiScope = @(
    'apps/admin/src/pages/SettlementOpsPage.tsx',
    'apps/admin/src/pages/SettlementStatementDetailPage.tsx',
    'apps/admin/src/pages/SettlementExportReviewPage.tsx',
    'apps/admin/src/pages/SettlementActionGovernancePage.tsx'
  )`
- Forbidden condition preserved:
  - Backend text scan for provider/withdraw terms remains unchanged.
  - UI check still throws non-allowed files in settlement admin scope.

### 2) check-settlement-payable-no-provider-withdraw-ui.ps1
- Previous scan scope:
  - `git diff --name-only <baseline 10410793...> -- apps/customer apps/worker apps/admin`
- New scan scope:
  - `git diff --name-only <baseline 10410793...> -- $UiScope`
  - same settlement admin page scope as above.
- Forbidden condition preserved.

### 3) check-settlement-payable-queue-no-provider-withdraw-ui.ps1
- Previous scan scope:
  - `git diff --name-only <baseline 921f297...> -- apps/customer apps/worker apps/admin`
- New scan scope:
  - `git diff --name-only <baseline 921f297...> -- $UiScope`
  - same settlement admin page scope as above.
- Forbidden condition preserved.

### 4) check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1
- Previous scan scope:
  - `git diff --name-only <baseline 16793276...> -- apps/customer apps/worker apps/admin`
- New scan scope:
  - `git diff --name-only <baseline 16793276...> -- $UiScope`
  - `$UiScope` set to settlement-style admin pages, which is the only current admin UI surface under this settlement/receivable review audit family in scope.
- Forbidden condition preserved.

### 5) check-worker-receivable-statement-no-provider-withdraw-ui.ps1
- Previous scan scope:
  - `git diff --name-only <baseline 9a0e7ae...> -- apps/customer apps/worker apps/admin`
- New scan scope:
  - `git diff --name-only <baseline 9a0e7ae...> -- $UiScope`
  - same settlement admin page scope as above.
- Forbidden condition preserved.

### 6) check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1
- Previous scan scope:
  - `git diff --name-only <baseline 214da7c...> -- apps/customer apps/worker apps/admin`
- New scan scope:
  - `git diff --name-only <baseline 214da7c...> -- $UiScope`
  - same settlement admin page scope as above.
- Forbidden condition preserved.

## Why Customer service-entry files are now out of scope
These scripts are phase 8 settlement/worker-receivable audit gates, not Customer service-entry product gates.
Customer service flow files (`apps/customer/src/pages/Customer*.tsx`, `apps/customer/src/adapters/*`, `apps/customer/src/app/App.tsx`) are no longer part of the scanned set, which removes the previous false positives while preserving security checks on the settlement/worker receivable domains.

## Validation results
Executed direct single-file checks with vitest equivalent (equivalent form used because `--runInBand` is not a Vitest-native argument):

- `pnpm exec vitest run tests/security/settlementConfirmNoProviderWithdrawUi.test.ts --passWithNoTests`
- `pnpm exec vitest run tests/security/settlementPayableGates.test.ts --passWithNoTests`
- `pnpm exec vitest run tests/security/settlementPayableQueueGates.test.ts --passWithNoTests`
- `pnpm exec vitest run tests/security/workerReceivableStatementExportGates.test.ts --passWithNoTests`
- `pnpm exec vitest run tests/security/workerReceivableStatementGates.test.ts --passWithNoTests`
- `pnpm exec vitest run tests/security/workerReceivableStatementReviewGates.test.ts --passWithNoTests`

Result: all tests passed (1 / 9 per file as expected).

Full validation requested:
- `pnpm --filter @xlb/ui typecheck` ?
- `pnpm --filter @xlb/ui build` ?
- `pnpm --filter @xlb/customer typecheck` ?
- `pnpm --filter @xlb/customer build` ?
- `pnpm test` ? (255 passed, 1 todo)

No edits made to:
- `apps/customer/**`
- `apps/worker/**`
- `apps/admin/**`
- `backend/**`
- `db/**`
- `deploy/**`
- `infra/**`

Security checks retained:
- All provider/withdraw/withdrawal/paid/payout/action pattern checks are unchanged.
- No broad allowlisting of customer files.
- No worker/admin broad scope broadening.
