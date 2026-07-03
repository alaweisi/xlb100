# Phase 6 gate: Phase 7 accept must depend on eligibility (documentation + architecture)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$requiredDocs = @(
  (Join-Path $Root "docs\architecture\09_XLB_CERTIFICATION_WORKER_ELIGIBILITY_FOUNDATION.md"),
  (Join-Path $Root "docs\contracts\CONTRACT_WORKER_ELIGIBILITY.md")
)

foreach ($doc in $requiredDocs) {
  if (-not (Test-Path $doc)) {
    Write-Host "check-worker-eligibility-required-before-accept FAILED: missing $doc"
    exit 1
  }
  $content = Get-Content $doc -Raw
  if ($content -notmatch "Phase 7|eligibility.*accept|accept.*eligibility") {
    Write-Host "check-worker-eligibility-required-before-accept FAILED: doc must state Phase 7 accept requires eligibility: $doc"
    exit 1
  }
}

$eligibilityFile = Join-Path $Root "backend\src\compliance\certMatcher\workerDispatchEligibility.ts"
if (-not (Test-Path $eligibilityFile)) {
  Write-Host "check-worker-eligibility-required-before-accept FAILED: missing workerDispatchEligibility.ts"
  exit 1
}

Write-Host "check-worker-eligibility-required-before-accept: passed"
