# Phase 11 gate: admin governance page must have no enabled execute/payout/refund/download/export buttons.
# Phase 11 planner is dry-run only with disabled execution controls.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$governancePage = Join-Path $Root "apps\admin\src\pages\SettlementActionGovernancePage.tsx"

if (-not (Test-Path $governancePage)) {
  Write-Host "check-phase11-no-ui-execution-controls: passed (governance page not found)"
  exit 0
}

$content = Get-Content $governancePage -Raw

$forbiddenUiPatterns = @(
  'execute_payout',
  'pay_now',
  'provider_withdrawal',
  'execute_refund',
  'download_export',
  'generate_export',
  'batch_payout'
)

$violations = @()
foreach ($pat in $forbiddenUiPatterns) {
  if ($content -match $pat) {
    # Check if the match is in a disabled/comment context
    $matches = [regex]::Matches($content, ".{0,80}${pat}.{0,80}")
    foreach ($m in $matches) {
      $ctx = $m.Value
      # Allow if disabled, commented out, or in a boundary doc comment
      if ($ctx -match 'disabled|commented|//.*disabled|{/\*.*disabled|boundary|rejection|not.*enabled|future.*phase') {
        continue
      }
      $violations += "$pat found in governance page UI: ...$($ctx.Trim())..."
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-no-ui-execution-controls: FAILED - enabled execution controls found"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-no-ui-execution-controls: passed"
