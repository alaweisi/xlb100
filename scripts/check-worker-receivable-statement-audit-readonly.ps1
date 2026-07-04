# Phase 8I gate: audit repository must be read-only (no INSERT/UPDATE/DELETE/CREATE TABLE)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$auditFiles = Get-ChildItem (Join-Path $Root "backend\src\settlement") -Filter "workerReceivableStatementAudit*" -File

if ($auditFiles.Count -eq 0) {
  Write-Host "check-worker-receivable-statement-audit-readonly: FAILED - no audit files found"
  exit 1
}

$forbidden = @(
  '\bINSERT\b',
  '\bUPDATE\b',
  '\bDELETE\b',
  'CREATE\s+TABLE'
)

$violations = @()

foreach ($file in $auditFiles) {
  $lines = Get-Content -Path $file.FullName
  $lineNum = 0
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    # Skip comment-only lines
    if ($trimmed -match '^\s*(//|#|/\*|\*| \*)') { continue }
    # Skip lines that are only SELECT (SELECT ... INTO is still a SELECT)
    if ($trimmed -match '^\s*SELECT\b' -or $trimmed -match 'SELECT\s+') {
      # But check if it also contains a forbidden keyword
      foreach ($pattern in $forbidden) {
        if ($trimmed -match $pattern) {
          $violations += "$($file.Name):$lineNum`: $trimmed"
        }
      }
      continue
    }
    # Check for forbidden patterns
    foreach ($pattern in $forbidden) {
      if ($trimmed -match $pattern -and $trimmed -notmatch '^\s*--') {
        $violations += "$($file.Name):$lineNum`: $trimmed"
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-worker-receivable-statement-audit-readonly: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-readonly: passed"
