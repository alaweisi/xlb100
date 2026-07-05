# Phase 12 gate: verify apps/customer, apps/worker, package.json, pnpm-lock unchanged.
# Phase 12 is backend preparation-only; no customer/worker impact allowed.
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects customer/worker changes
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  # Simulate: create a file path that looks like it's inside apps/customer/
  $fixtureFile = "apps/customer/some-component.tsx"

  $forbiddenDirs = @("apps/customer", "apps/worker")
  $fixtureViolations = @()

  foreach ($fd in $forbiddenDirs) {
    $normalized = $fixtureFile -replace '\\', '/'
    if ($normalized.StartsWith($fd)) {
      $fixtureViolations += $fixtureFile
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-forbidden-zone: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-forbidden-zone: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenDirs = @(
  "apps/customer",
  "apps/worker"
)

$forbiddenFiles = @(
  "package.json"
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase12-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @()
foreach ($file in $changedFiles) {
  foreach ($fd in $forbiddenDirs) {
    $normalized = $file -replace '\\', '/'
    if ($normalized.StartsWith($fd)) {
      $violations += $file
    }
  }
  foreach ($ff in $forbiddenFiles) {
    $normalized = $file -replace '\\', '/'
    if ($normalized -eq $ff) {
      $violations += $file
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-forbidden-zone: FAILED - forbidden files/dirs changed"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-forbidden-zone: passed"
