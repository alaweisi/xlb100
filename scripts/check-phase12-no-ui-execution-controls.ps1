$ErrorActionPreference = "Stop"
# self-test
$d = Join-Path $env:TEMP ("p12-ui-" + [Guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $d -Force | Out-Null
try {
  $f = Join-Path $d "bad.tsx"
  "<Button onClick={handleExecute}>Execute</Button>" | Out-File -FilePath $f -Encoding UTF8
  $c = Get-Content $f -Raw
  if ($c -match '<Button' -and $c -notmatch 'disabled') { Write-Host "check-phase12-no-ui-execution-controls: self-test passed" }
  else { Write-Host "SELF-TEST FAILED"; exit 1 }
} finally { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }

# Normal
$Root = Split-Path -Parent $PSScriptRoot
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
$laterPhaseUiFiles = @(
  'apps/admin/src/pages/AftersaleOpsPage.tsx',
  'apps/admin/src/pages/SettlementExportReviewPage.tsx',
  'apps/admin/src/pages/SettlementOpsPage.tsx',
  'apps/admin/src/pages/SettlementStatementDetailPage.tsx'
)
$vs = @()
foreach ($file in $changedFiles) {
  if ($file -notmatch '^apps/admin/.*\.(tsx|ts)$') { continue }
  if ($laterPhaseUiFiles -contains ($file -replace '\\', '/')) { continue }
  $fp = Join-Path $Root $file; if (-not (Test-Path $fp)) { continue }
  $lines = Get-Content $fp; $n = 0
  foreach ($line in $lines) { $n++; $t = $line.Trim(); if ($t -match '^\s*(//|/\*|\*|--)') { continue }
    if (($t -match '<Button' -or $t -match '<button') -and $t -notmatch 'disabled' -and $t -match '(Execute|Payout|Refund|Reverse|Commit|Download|Export|Withdraw)') { $vs += "$file`:$n`: $t" }
  }
}
if ($vs.Count -gt 0) { Write-Host "FAILED"; $vs | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-ui-execution-controls: passed"
