# Phase 8J gate: review summary code must not write to event outbox
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$summaryFiles = Get-ChildItem (Join-Path $Root "backend\src\settlement") -Filter "workerReceivableStatementReviewSummary*" -File

if ($summaryFiles.Count -eq 0) {
  Write-Host "check-phase8j-no-outbox-write: FAILED - no WorkerReceivableStatementReviewSummary files found"
  exit 1
}

$forbiddenCalls = @(
  'eventOutbox\.insert',
  'eventOutbox\.create',
  'eventOutbox\.publish',
  'eventOutbox\.enqueue'
)

$violations = @()

foreach ($file in $summaryFiles) {
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
  Write-Host "check-phase8j-no-outbox-write: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase8j-no-outbox-write: passed"
