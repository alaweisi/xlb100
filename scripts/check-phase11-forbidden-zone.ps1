# Phase 11 gate: preserve its customer/worker boundary. Later quality-gate phases may
# update the root manifest when their own boundary gate is present.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenDirs = @(
  "apps/customer",
  "apps/worker"
)

$forbiddenFiles = @(
  "package.json"
)
$allowedLaterPhaseFiles = @()
if (Test-Path (Join-Path $Root "scripts/check-phase22-boundaries.ps1")) {
  $allowedLaterPhaseFiles += "package.json"
}
$allowPhase23cFrontend = $false
$phase23cFrontendPattern = '^apps/(?:customer/src/(?:main\.tsx|app/App\.tsx)|worker/src/(?:main\.tsx|app/App\.tsx|(?:pages|features)/.+))$'
$phase24SupportFiles = @(
  "apps/customer/src/app/App.tsx",
  "apps/customer/src/features/support/reducer.ts",
  "apps/customer/src/pages/CustomerAftersalePage.tsx",
  "apps/customer/src/pages/CustomerSupportPage.tsx",
  "apps/customer/src/pages/customerPageShell.tsx",
  "apps/worker/src/app/App.tsx",
  "apps/worker/src/features/support/reducer.ts",
  "apps/worker/src/pages/WorkerSupportPage.tsx"
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase11-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}
$allowPhase23cFrontend = $changedFiles -contains "db/migrations/045_phase23c_frontend_engineering.sql"

$violations = @()
foreach ($file in $changedFiles) {
  foreach ($fd in $forbiddenDirs) {
    $isPhase23cFrontend = $allowPhase23cFrontend -and (($file -replace '\\', '/') -match $phase23cFrontendPattern)
    $isPhase24Support = $phase24SupportFiles -contains ($file -replace '\\', '/')
    if ($file.StartsWith($fd) -and -not $isPhase23cFrontend -and -not $isPhase24Support) {
      $violations += $file
    }
  }
  foreach ($ff in $forbiddenFiles) {
    if ($file -eq $ff -and $allowedLaterPhaseFiles -notcontains $file) {
      $violations += $file
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-forbidden-zone: FAILED - forbidden files/dirs changed"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-forbidden-zone: passed"
