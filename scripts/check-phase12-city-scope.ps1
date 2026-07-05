# Phase 12 gate: preparation SQL uses city scope.
# All preparation/ SQL must use city_code = ? or buildCityScopedWhere
# or assertCityScopedContext.
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects SQL without city scope
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "no-city-scope.ts"
  "SELECT * FROM settlement_execution_preparation_envelopes WHERE id = 'env_1'" | Out-File -FilePath $fixtureFile -Encoding UTF8

  $fixtureViolations = @()
  $content = Get-Content $fixtureFile -Raw

  if ($content -match 'city_code\s*=\s*\?' -or
      $content -match 'cityCode' -or
      $content -match 'assertCityScopedContext' -or
      $content -match 'buildCityScopedWhere' -or
      $content -match 'getRequestContext') {
    # has city scope - fixture should NOT have city scope, so this should not trigger
    # but if it does, fixture is bad
  }

  if ($content -match '\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b') {
    # Has SQL but no city scope - should be violation
    if ($content -notmatch 'city_code\s*=\s*\?' -and
        $content -notmatch 'cityCode' -and
        $content -notmatch 'assertCityScopedContext' -and
        $content -notmatch 'buildCityScopedWhere' -and
        $content -notmatch 'getRequestContext') {
      $fixtureViolations += "$fixtureFile: missing city scope"
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-city-scope: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-city-scope: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot

$preparationDir = Join-Path $Root "backend\src\preparation"
$violations = @()

if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-city-scope: passed (preparation directory not yet created)"
  exit 0
}

$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue

foreach ($file in $tsFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  if ($content -match 'city_code\s*=\s*\?' -or
      $content -match 'cityCode' -or
      $content -match 'assertCityScopedContext' -or
      $content -match 'buildCityScopedWhere' -or
      $content -match 'getRequestContext') {
    continue
  }
  if ($content -notmatch '\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b') {
    continue
  }
  $violations += "$($file.Name): missing city scope (has SQL queries but no city_code = ? / buildCityScopedWhere / assertCityScopedContext)"
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-city-scope: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-city-scope: passed"
