# Phase 12 gate: no forbidden imports in preparation module
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects forbidden imports
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-import.ts"
  "import { paymentOrderService } from '../payment/paymentOrderService.js';" | Out-File -FilePath $fixtureFile -Encoding UTF8

  $forbiddenImports = @(
    'paymentOrderService','paymentOrderRepository','ledgerAccrualService',
    'ledgerRepository','settlementConfirmationService','settlementPayableService',
    'settlementPayableQueueService','workerReceivableStatementExportService',
    'providerService','refundService','reversalService'
  )
  $forbiddenZones = @('/payment/','/ledger/','/refund/','/reversal/','/provider/')

  $fixtureViolations = @()
  $content = Get-Content $fixtureFile -Raw
  foreach ($imp in $forbiddenImports) {
    if ($content -match "import.*$imp|require.*$imp|from.*$imp") {
      $fixtureViolations += "$fixtureFile imports $imp"
    }
  }
  foreach ($zone in $forbiddenZones) {
    if ($content -match [regex]::Escape($zone)) {
      $fixtureViolations += "$fixtureFile references forbidden zone $zone"
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-no-forbidden-imports: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-no-forbidden-imports: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot
$forbiddenImports = @(
  'paymentOrderService','paymentOrderRepository','ledgerAccrualService',
  'ledgerRepository','settlementConfirmationService','settlementPayableService',
  'settlementPayableQueueService','workerReceivableStatementExportService',
  'providerService','refundService','reversalService'
)
$forbiddenZones = @('/payment/','/ledger/','/refund/','/reversal/','/provider/','/settlement/')
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
$violations = @()
foreach ($file in $changedFiles) {
  if ($file -match 'scripts/check-') { continue }
  if ($file -notmatch '\.(ts|tsx)$') { continue }
  $fullPath = Join-Path $Root $file; if (-not (Test-Path $fullPath)) { continue }
  $content = Get-Content $fullPath -Raw
  foreach ($imp in $forbiddenImports) {
    if ($content -match "import.*$imp|require.*$imp|from.*$imp") {
      $violations += "$file imports $imp"
    }
  }
  foreach ($zone in $forbiddenZones) {
    if ($content -match [regex]::Escape($zone)) {
      $violations += "$file references forbidden zone $zone"
    }
  }
}
if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-forbidden-imports: FAILED - forbidden imports found"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase12-no-forbidden-imports: passed"
