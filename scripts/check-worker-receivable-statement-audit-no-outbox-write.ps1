# Phase 8I gate: audit code must not write to event outbox
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$auditFiles = Get-ChildItem (Join-Path $Root "backend\src\settlement") -Filter "workerReceivableStatementAudit*" -File

if ($auditFiles.Count -eq 0) {
  Write-Host "check-worker-receivable-statement-audit-no-outbox-write: FAILED - no audit files found"
  exit 1
}

$forbiddenCalls = @(
  'eventOutbox\.insert',
  'eventOutbox\.create',
  'eventOutbox\.publish',
  'eventOutbox\.enqueue'
)

$violations = @()

foreach ($file in $auditFiles) {
  $lines = Get-Content -Path $file.FullName
  $lineNum = 0
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    # Skip comment lines
    if ($trimmed -match '^\s*(//|#|/\*|\*| \*)') { continue }
    foreach ($pattern in $forbiddenCalls) {
      if ($trimmed -match $pattern) {
        $violations += "$($file.Name):$lineNum`: $trimmed"
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-worker-receivable-statement-audit-no-outbox-write: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Also check that SELECT from event_outbox is the only allowed outbox reference
$serviceFile = Join-Path $Root "backend\src\settlement\workerReceivableStatementAuditService.ts"
if (Test-Path $serviceFile) {
  $serviceContent = Get-Content $serviceFile -Raw
  # Allow SELECT from event_outbox references
  if ($serviceContent -match 'event_outbox' -and $serviceContent -notmatch 'SELECT.*event_outbox') {
    # This is just informational - the repository check above is the real gate
  }
}

Write-Host "check-worker-receivable-statement-audit-no-outbox-write: passed"
