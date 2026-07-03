# Phase 7A gate: accept must require eligibility check
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$file = Join-Path $Root "backend\src\worker\workerAcceptService.ts"
if (-not (Test-Path $file)) {
  Write-Host "check-accept-requires-eligibility FAILED: missing workerAcceptService.ts"
  exit 1
}

$content = Get-Content $file -Raw
$required = @(
  "workerDispatchEligibilityService",
  "computeEligibility",
  "isEligible"
)

foreach ($pattern in $required) {
  if ($content -notmatch [regex]::Escape($pattern)) {
    Write-Host "check-accept-requires-eligibility FAILED: missing $pattern in workerAcceptService.ts"
    exit 1
  }
}

Write-Host "check-accept-requires-eligibility: passed"
