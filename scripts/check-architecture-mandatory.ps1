# Phase 2: mandatory architecture checks
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "preflight-architecture.ps1")
& (Join-Path $PSScriptRoot "check-no-raw-db-query.ps1")
Write-Host "check-architecture-mandatory: passed"
