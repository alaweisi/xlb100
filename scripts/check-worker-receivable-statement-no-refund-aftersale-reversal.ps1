$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementService.ts")
if ($Service -match '(?i)refund|aftersale|reversal') { throw "Phase 8F must not implement refund, aftersale, or reversal." }
Write-Host "PASS: worker receivable statements have no refund, aftersale, or reversal scope."
