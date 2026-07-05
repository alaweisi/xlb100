$ErrorActionPreference = "Stop"
# unsafe_fixtures — self-test
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-import.ts"
  "import { paymentOrderService } from '../payment/paymentOrderService.js';" | Out-File -FilePath $fixtureFile -Encoding UTF8
  $forbiddenImports = @('paymentOrderService','paymentOrderRepository','ledgerAccrualService','ledgerRepository','settlementConfirmationService','settlementPayableService','settlementPayableQueueService','workerReceivableStatementExportService','providerService','refundService','reversalService')
  $fixtureViolations = @()
  $content = Get-Content $fixtureFile -Raw
  foreach ($imp in $forbiddenImports) { if ($content -match $imp) { $fixtureViolations += "$fixtureFile imports $imp" } }
  if ($fixtureViolations.Count -eq 0) { Write-Host "SELF-TEST FAILED"; exit 1 }
  Write-Host "check-phase12-no-forbidden-imports: self-test passed (fixture correctly rejected)"
} finally { Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue }

# Normal gate logic
$Root = Split-Path -Parent $PSScriptRoot
$forbiddenImports = @('paymentOrderService','paymentOrderRepository','ledgerAccrualService','ledgerRepository','settlementConfirmationService','settlementPayableService','settlementPayableQueueService','workerReceivableStatementExportService','providerService','refundService','reversalService')
$forbiddenZones = @('/payment/','/ledger/','/refund/','/reversal/','/provider/','/settlement/')
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
$violations = @()

function Get-ImportStatements([string]$Content) {
  $pattern = [regex]::new("(?ms)^\\s*import\\b[\\s\\S]*?;", [System.Text.RegularExpressions.RegexOptions]::Multiline)
  return $pattern.Matches($Content)
}

function Get-ImportInfo([string]$Statement) {
  $info = @{
    Source = ""
    ImportedNames = @()
  }

  if ($Statement -match "^\s*import\s*['""]([^'""]+)['""]\s*;?\s*$") {
    return $info
  }

  if ($Statement -match "^\s*import(?:\s+type)?\s+([\s\S]+?)\s+from\s+['""]([^'""]+)['""]\s*;?\s*$") {
    $importClause = $matches[1]
    $info.Source = $matches[2]
    $names = [regex]::Matches($importClause, '\b[a-zA-Z_][a-zA-Z0-9_]*\b') | ForEach-Object { $_.Value }
    $info.ImportedNames = @($names | Where-Object { $_ -ne "as" })
  }

  return $info
}

function Is-ForbiddenSourcePath([string]$SourcePath) {
  if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    return $false
  }
  foreach ($zone in $forbiddenZones) {
    if ($SourcePath -match [regex]::Escape($zone)) {
      return $true
    }
  }
  return $false
}

foreach ($file in $changedFiles) {
  if ($file -match 'scripts/|tests/') { continue }
  if ($file -eq 'backend/src/app.ts') { continue }
  if ($file -notmatch '\.(ts|tsx)$') { continue }
  $fullPath = Join-Path $Root $file; if (-not (Test-Path $fullPath)) { continue }
  $content = Get-Content $fullPath -Raw
  $isLedgerFile = $file -like "backend/src/ledger/*"
  $importStatements = Get-ImportStatements $content
  foreach ($match in $importStatements) {
    $importInfo = Get-ImportInfo $match.Value
    $source = $importInfo.Source
    $allowsLedgerSelfImport = $false
    if ($isLedgerFile -and $source -match '^\./(ledgerRepository|ledgerAccrualService)(\.js)?$') {
      $allowsLedgerSelfImport = $true
    }
    if ((Is-ForbiddenSourcePath $source) -and -not ($isLedgerFile -and $source -match '^\./(ledgerRepository|ledgerAccrualService)(\.js)?$')) {
      $violations += "$file references forbidden zone path $source"
    }
    foreach ($imp in $importInfo.ImportedNames) {
      if ($forbiddenImports -contains $imp) {
        if (-not $allowsLedgerSelfImport) {
          $violations += "$file imports $imp"
        }
      }
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-no-forbidden-imports: FAILED"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-forbidden-imports: passed"
