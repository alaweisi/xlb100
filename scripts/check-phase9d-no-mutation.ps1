$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
# Exclude JavaScript Map.delete() — "sp.delete(k)" is not HTTP DELETE
$diff = $diff -replace '\bsp\.delete\b', 'SP_DELETE_CALL'
if ($diff -match '\bDELETE\b') { Write-Host "check-phase9d-no-mutation: FAILED"; exit 1 }
Write-Host "check-phase9d-no-mutation: passed"
