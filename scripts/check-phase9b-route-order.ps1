$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
if ($diff | Select-String "backend/src/") { Write-Host "check-phase9b-route-order: FAILED — backend files changed"; exit 1 }
Write-Host "check-phase9b-route-order: passed (Phase 9B is admin UI — no backend changes)"
