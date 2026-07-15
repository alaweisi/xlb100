# XLB agent context snapshot — run at session start (read-only)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== XLB Agent Context Snapshot ==="
Write-Host "timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

Write-Host "--- git ---"
git branch --show-current
git status -sb
Write-Host "main: $(git rev-parse --short main 2>$null)"
Write-Host "HEAD: $(git rev-parse --short HEAD)"
Write-Host ""

Write-Host "--- latest tags ---"
git tag -l "xlb-phase*" | Sort-Object | Select-Object -Last 5
Write-Host ""

Write-Host "--- recent commits ---"
git log --oneline -8
Write-Host ""

$currentState = Join-Path $Root "docs\CURRENT_STATE.md"
if (Test-Path $currentState) {
  Write-Host "--- CURRENT_STATE (first 25 lines) ---"
  Get-Content $currentState -Encoding UTF8 -TotalCount 25
} else {
  Write-Host "WARN: docs/CURRENT_STATE.md missing"
}

Write-Host ""
Write-Host "Read full: docs/CURRENT_STATE.md"
Write-Host "Skills: .cursor/skills/xlb-session-sync/SKILL.md"
