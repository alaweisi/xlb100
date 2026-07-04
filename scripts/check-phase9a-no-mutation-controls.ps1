$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$pageFile = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
if (Test-Path $pageFile) {
  $content = Get-Content $pageFile -Raw
  # Use word boundaries to avoid false matches on interface property names like "approvedStatements"
  if ($content -match '\b(approve|export-once|review-once|generate-once|fix|retry|repair|payout|paid|send)\b') {
    Write-Host "check-phase9a-no-mutation-controls: FAILED — forbidden: $($matches[1])"; exit 1
  }
}
Write-Host "check-phase9a-no-mutation-controls: passed"
