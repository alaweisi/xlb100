# Phase 0: mandatory architecture checks (minimal)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "preflight-architecture.ps1")
Write-Host "check-architecture-mandatory: passed"
