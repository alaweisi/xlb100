$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$pageFiles = @(
  (Join-Path $Root "apps/admin/src/pages/SettlementStatementDetailPage.tsx"),
  (Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx")
)
foreach ($pf in $pageFiles) {
  if (Test-Path $pf) {
    $c = Get-Content $pf -Raw
    if ($c -match '\b(POST|PUT|PATCH|DELETE|post|put|patch|delete)\b') {
      Write-Host "check-phase9b-locked-readonly-api: FAILED — mutation verb in $pf"; exit 1
    }
  }
}
Write-Host "check-phase9b-locked-readonly-api: passed"
