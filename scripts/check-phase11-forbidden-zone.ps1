# Phase 11 gate: preserve its customer/worker boundary. Later quality-gate phases may
# update the root manifest when their own boundary gate is present.
param(
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts/lib/later-ui-authorizations.ps1')

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
$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'docs/CURRENT_STATE.md')
$phase29Entry = Join-Path $Root 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29Architecture = Join-Path $Root 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29Contract = Join-Path $Root 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29Registry = Join-Path $Root 'docs/governance/phase-registry.json'
$allowPhase29Frontend =
  ($currentState.Contains('| Phase 29 | IN PROGRESS |') -or $currentState.Contains('| Phase 29 | LOCKED |')) -and
  $currentState.Contains('D01') -and
  $currentState.Contains('D24') -and
  (Test-Path -LiteralPath $phase29Entry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('Every row below is **HUMAN APPROVED**') -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('| D24 |') -and
  (Test-Path -LiteralPath $phase29Architecture) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Architecture).Contains('ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED') -and
  (Test-Path -LiteralPath $phase29Contract) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Contract).Contains('Phase 29 human-approved contract') -and
  (Test-Path -LiteralPath $phase29Registry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Registry).Contains('Entry decisions D01-D24 are approved for continuous construction through independent acceptance.')
$phase29FrontendFiles = @(
  'apps/customer/src/adapters/marketingAdapter.ts',
  'apps/customer/src/pages/CustomerCouponsPage.tsx',
  'apps/customer/src/pages/CustomerOrderCreatePage.tsx',
  'apps/customer/src/pages/customer-coupons.css'
)
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

function Get-Phase11ForbiddenZoneViolations {
  param(
    [Parameter(Mandatory = $true)][string[]]$ChangedFiles,
    [Parameter(Mandatory = $true)][string[]]$LaterUiAuthorizationFiles
  )

  $allowPhase23cFrontend = $ChangedFiles -contains 'db/migrations/045_phase23c_frontend_engineering.sql'
  $violations = @()
  foreach ($rawFile in $ChangedFiles) {
    $file = $rawFile -replace '\\', '/'
    foreach ($fd in $forbiddenDirs) {
      $isForbiddenDir = $file.Equals($fd, [System.StringComparison]::Ordinal) -or
        $file.StartsWith("$fd/", [System.StringComparison]::Ordinal)
      $isPhase23cFrontend = $allowPhase23cFrontend -and ($file -match $phase23cFrontendPattern)
      $isPhase24Support = $phase24SupportFiles -contains $file
      $isPhase27dFrontend = $allowPhase27dFrontend -and $phase27dFrontendFiles -contains $file
      $isPhase29Frontend = $allowPhase29Frontend -and $phase29FrontendFiles -contains $file
      $isExplicitLaterUi = $LaterUiAuthorizationFiles -ccontains $file
      if (
        $isForbiddenDir -and
        -not $isPhase23cFrontend -and
        -not $isPhase24Support -and
        -not $isPhase27dFrontend -and
        -not $isPhase29Frontend -and
        -not $isExplicitLaterUi
      ) {
        $violations += $file
      }
    }
    foreach ($ff in $forbiddenFiles) {
      if ($file -eq $ff -and $allowedLaterPhaseFiles -notcontains $file) {
        $violations += $file
      }
    }
  }

  return @($violations | Sort-Object -Unique)
}

$laterUiAuthorizationFiles = @(Get-LaterUiAuthorizationFiles -RepositoryRoot $Root -CurrentStateText $currentState)

if ($SelfTest) {
  $expectedUnitAFiles = @(
    'apps/customer/package.json',
    'apps/customer/src/pages/CustomerHomePage.tsx',
    'apps/customer/src/pages/CustomerOrdersPage.tsx',
    'apps/customer/src/pages/CustomerServicesPage.tsx',
    'apps/customer/src/pages/customer-order-create.css'
  )
  $positiveViolations = @(Get-Phase11ForbiddenZoneViolations `
    -ChangedFiles $expectedUnitAFiles `
    -LaterUiAuthorizationFiles $laterUiAuthorizationFiles)
  if ($positiveViolations.Count -ne 0) {
    throw "Phase11 self-test rejected exact Unit A files: $($positiveViolations -join ', ')"
  }
  Write-Host 'check-phase11-forbidden-zone: self-test exact Unit A authorization passed'

  foreach ($negativeFile in @(
      'apps/customer/src/pages/UnauthorizedCustomerPage.tsx',
      'apps/worker/src/pages/UnauthorizedWorkerPage.tsx'
    )) {
    $negativeViolations = @(Get-Phase11ForbiddenZoneViolations `
      -ChangedFiles @($negativeFile) `
      -LaterUiAuthorizationFiles $laterUiAuthorizationFiles)
    if ($negativeViolations.Count -ne 1 -or $negativeViolations[0] -ne $negativeFile) {
      throw "Phase11 self-test did not reject unauthorized file: $negativeFile"
    }
  }
  Write-Host 'check-phase11-forbidden-zone: self-test unauthorized Customer/Worker files rejected'

  try {
    Assert-ExactLaterUiAuthorizationPath -Path 'apps/customer/**' | Out-Null
    throw 'Phase11 self-test accepted a broad Customer path'
  } catch {
    if ($_.Exception.Message -eq 'Phase11 self-test accepted a broad Customer path') { throw }
  }
  Write-Host 'check-phase11-forbidden-zone: self-test broad paths rejected'
  exit 0
}

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase11-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @(Get-Phase11ForbiddenZoneViolations `
  -ChangedFiles $changedFiles `
  -LaterUiAuthorizationFiles $laterUiAuthorizationFiles)

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-forbidden-zone: FAILED - forbidden files/dirs changed"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-forbidden-zone: passed"
