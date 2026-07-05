# Phase 11 gate: verify apps/customer, apps/worker, package.json, pnpm-lock unchanged.
# Phase 11 is backend governance-only; no customer/worker impact allowed.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenDirs = @(
  "apps/customer",
  "apps/worker"
)

$forbiddenFiles = @(
  "package.json",
  "pnpm-lock.yaml"
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase11-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @()
foreach ($file in $changedFiles) {
  foreach ($fd in $forbiddenDirs) {
    if ($file.StartsWith($fd)) {
      $violations += $file
    }
  }
  foreach ($ff in $forbiddenFiles) {
    if ($file -eq $ff) {
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
