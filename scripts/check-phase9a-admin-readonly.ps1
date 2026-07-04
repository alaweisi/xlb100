$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$pageFile = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
if (Test-Path $pageFile) {
  $content = Get-Content $pageFile -Raw
  # Only check UI action words, not interface property names like "approvedStatements"
  # Use word boundaries to avoid substring false matches
  if ($content -match '\b(approve|payout|paid|export-once|review-once|generate-once|fix|retry|repair)\b') {
    Write-Host "check-phase9a-admin-readonly: FAILED — mutation controls found: $($matches[1])"; exit 1
  }
}
Write-Host "check-phase9a-admin-readonly: passed"
