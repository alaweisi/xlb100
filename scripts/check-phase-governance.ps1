$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  node scripts/check-phase-governance.mjs
} finally {
  Pop-Location
}
