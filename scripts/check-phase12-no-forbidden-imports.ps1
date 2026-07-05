# Phase 12 gate: preparation module must not import from payment/ledger/refund/reversal/provider/settlement-write.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$preparationDir = Join-Path $Root "backend\src\preparation"

$forbiddenImports = @(
  'payment\/paymentOrderService',
  'payment\/paymentRepository',
  'payment\/',
  'ledger\/ledgerAccrualService',
  'ledger\/ledgerOutboxConsumer',
  'ledger\/ledgerRepository',
  'ledger\/',
  'refund\/',
  'reversal\/',
  'providers\/',
  'provider\/',
  'settlement\/settlementConfirmationService',
  'settlement\/settlementPayableService',
  'settlement\/settlementPayableQueueService',
  'settlement\/settlementWrite',
  'settlement-write\/'
)

$violations = @()

if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-no-forbidden-imports: passed (preparation directory not yet created)"
  exit 0
}

$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
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

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-forbidden-imports: FAILED - forbidden imports found"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-no-forbidden-imports: passed"
