# Phase 11 gate: planner only does SELECT on non-planner tables
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$plannerDir = Join-Path $Root "backend\src\planner"
$allowedWriteTablePattern = 'settlement_execution_dry_run_|settlement_action_governance_'
$violations = @()
if (Test-Path $plannerDir) {
  $tsFiles = Get-ChildItem -Path $plannerDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $tsFiles) {
    $lines = Get-Content -Path $file.FullName; $lineNum = 0
    foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
      if ($trimmed -match '^(?!\s*SELECT\b)\s*\w.*\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b' -and $trimmed -notmatch $allowedWriteTablePattern) { $violations += "$($file.Name):$lineNum`: $trimmed" }
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase11-readonly-planner: FAILED - non-SELECT operations on non-planner tables"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase11-readonly-planner: passed (planner reads only on non-governance tables)"
