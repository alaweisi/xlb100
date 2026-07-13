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
$currentState = Get-Content -Raw -LiteralPath (Join-Path $Root 'docs/CURRENT_STATE.md')
$allowPhase27dFrontend =
  $currentState.Contains('Phase 27 | PHASE27E EXIT VERIFICATION') -or
  $currentState.Contains('Phase 27 | LOCKED')
$phase27dFrontendFiles = @(
  'apps/customer/src/app/mobile-shell.css',
  'apps/customer/src/pages/CustomerNotificationsPage.tsx',
  'apps/customer/src/pages/CustomerProfilePage.tsx',
  'apps/worker/src/pages/WorkerNotificationsPage.tsx',
  'apps/worker/src/pages/worker-notifications.css'
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
    $isPhase27dFrontend = $allowPhase27dFrontend -and $phase27dFrontendFiles -contains ($file -replace '\\', '/')
    if ($file.StartsWith($fd) -and -not $isPhase23cFrontend -and -not $isPhase24Support -and -not $isPhase27dFrontend) {
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
