# Phase 11 gate: planner/governance modules must not import from settlement write,
# payment write, ledger write, refund, reversal, or provider modules.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$plannerDir = Join-Path $Root "backend\src\planner"
$governanceDir = Join-Path $Root "backend\src\governance"

$forbiddenImports = @(
  'settlement\/settlementConfirmationService',
  'settlement\/settlementPayableService',
  'settlement\/settlementPayableQueueService',
  'payment\/paymentOrderService',
  'payment\/paymentRepository',
  'ledger\/ledgerAccrualService',
  'ledger\/ledgerOutboxConsumer',
  'ledger\/ledgerRepository',
  'providers\/',
  'refund\/',
  'reversal\/',
  'aftersale\/',
  'payout\/'
)

$violations = @()

foreach ($dir in @($plannerDir, $governanceDir)) {
  if (-not (Test-Path $dir)) { continue }
  $tsFiles = Get-ChildItem -Path $dir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $tsFiles) {
    $lines = Get-Content -Path $file.FullName
    $lineNum = 0
    foreach ($line in $lines) {
      $lineNum++
      if ($line -match '^\s*(//|/\*|\*| \*)') { continue }
      if ($line -match '^\s*import\b' -or $line -match '^\s*(const|let|var)\s+\w+\s*=\s*require') {
        foreach ($pat in $forbiddenImports) {
          if ($line -match $pat) {
            $violations += "$($file.FullName.Substring($Root.Length + 1)):$lineNum`: $($line.Trim())"
            break
          }
        }
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-no-forbidden-imports: FAILED - forbidden imports found"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-no-forbidden-imports: passed"
