$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 9A is admin UI only — verify no backend routes were added or modified
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
$backendRoutes = $diff | Select-String "backend/src/.*route"
if ($backendRoutes) {
  Write-Host "check-phase9a-route-order: FAILED — backend routes touched: $backendRoutes"; exit 1
}
# Also verify no new backend source files at all (strict check)
$backendSrc = $diff | Select-String "backend/src/"
if ($backendSrc) {
  Write-Host "check-phase9a-route-order: FAILED — backend source files changed"; exit 1
}
Write-Host "check-phase9a-route-order: passed (Phase 9A is admin UI — no backend changes)"
