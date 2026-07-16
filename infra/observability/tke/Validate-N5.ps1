[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) { throw "Validate-N5.ps1 must run inside the XLB repository" }

Write-Host "N5 offline validation: no cloud, cluster, deploy, or production-data operation will run."
& node (Join-Path $Root "infra/observability/tke/validate.mjs")
if ($LASTEXITCODE -ne 0) { throw "N5 Node validation failed" }

Write-Host "PASS: N5 single-entry offline validation completed."
