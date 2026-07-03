# Phase 6 gate: eligibility / certMatcher must not mutate dispatch_tasks
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\compliance\certMatcher"),
  (Join-Path $Root "backend\src\compliance\qualification"),
  (Join-Path $Root "backend\src\compliance\workerCertification")
)

$forbidden = @(
  "UPDATE dispatch_tasks",
  "INSERT INTO dispatch_tasks",
  "dispatch_tasks SET status"
)

$hits = @()
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  $files = Get-ChildItem -Path $dir -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    if ($file.Name -eq "README.md") { continue }
    $content = Get-Content $file.FullName -Raw
    foreach ($pattern in $forbidden) {
      if ($content -match [regex]::Escape($pattern)) {
        $hits += "$($file.FullName): $pattern"
      }
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-eligibility-no-dispatch-mutation FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-eligibility-no-dispatch-mutation: passed"
