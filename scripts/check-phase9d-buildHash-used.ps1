$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $Root "apps/admin/src/app/App.tsx"
$c = Get-Content $app -Raw
if ($c -notmatch 'buildHash') { Write-Host "check-phase9d-buildHash-used: FAILED"; exit 1 }
Write-Host "check-phase9d-buildHash-used: passed"
