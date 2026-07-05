$ErrorActionPreference = "Stop"
# unsafe_fixtures — self-test
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-city.ts"
  "const sql = 'SELECT * FROM settlement_batches WHERE batch_id = ?';" | Out-File -FilePath $fixtureFile -Encoding UTF8
  $content = Get-Content $fixtureFile -Raw
  if ($content -notmatch 'city_code' -and $content -notmatch 'cityCode' -and $content -notmatch 'assertCityScopedContext' -and $content -notmatch 'buildCityScopedWhere' -and $content -notmatch 'getRequestContext') {
    Write-Host "check-phase12-city-scope: self-test passed (fixture correctly rejected)"
  } else { Write-Host "SELF-TEST FAILED"; exit 1 }
} finally { Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue }

# Normal gate logic
$Root = Split-Path -Parent $PSScriptRoot
$preparationDir = Join-Path $Root "backend\src\preparation"
$violations = @()
if (-not (Test-Path $preparationDir)) { Write-Host "check-phase12-city-scope: passed (preparation directory not yet created)"; exit 0 }
$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
foreach ($file in $tsFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  if ($content -match 'city_code\s*=\s*\?' -or $content -match 'cityCode' -or $content -match 'assertCityScopedContext' -or $content -match 'buildCityScopedWhere' -or $content -match 'getRequestContext') { continue }
  if ($content -notmatch '\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b') { continue }
  $violations += "$($file.Name): missing city scope"
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-city-scope: FAILED"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-city-scope: passed"
