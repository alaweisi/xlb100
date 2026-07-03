# Scan backend/src for raw MySQL pool/connection outside dal/
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$backendSrc = Join-Path $Root "backend\src"
$dalDir = Join-Path $backendSrc "dal"

$patterns = @(
  "createPool",
  "createConnection",
  "mysql\.createPool",
  "mysql\.createConnection",
  "mysql2/promise"
)

$violations = @()
$files = Get-ChildItem -Path $backendSrc -Recurse -Include "*.ts" -File |
  Where-Object { $_.FullName -notlike "$dalDir*" }

foreach ($file in $files) {
  $content = Get-Content -Path $file.FullName -Raw
  foreach ($pattern in $patterns) {
    if ($content -match $pattern) {
      $violations += "$($file.FullName): matches '$pattern'"
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-no-raw-db-query: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-raw-db-query: passed"
