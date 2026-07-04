$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$pageFiles = @(
  (Join-Path $Root "apps/admin/src/pages/SettlementStatementDetailPage.tsx"),
  (Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx")
)
foreach ($pf in $pageFiles) {
  if (Test-Path $pf) {
    $c = Get-Content $pf -Raw
    if ($c -match '\b(approve|export-once|review-once|generate-once|fix|retry|repair|payout|paid|send)\b') {
      Write-Host "check-phase9b-no-mutation-controls: FAILED — $($matches[1]) in $pf"; exit 1
    }
  }
}
Write-Host "check-phase9b-no-mutation-controls: passed"
