# XLB Phase 0 architecture preflight
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "README.md",
  "AGENTS.md",
  "backend/src/server.ts",
  "backend/src/app.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/architecture-guard.yml",
  ".cursor/rules/xlb-architecture-mandatory.mdc",
  "docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md",
  "docs/architecture/02_XLB_ENGINEERING_FOUNDATION.md",
  "docs/contracts/README.md"
)

$requiredDirs = @(
  "apps",
  "packages",
  "backend",
  "db",
  "infra",
  "deploy",
  "tests",
  "docs",
  "scripts",
  ".github",
  ".cursor",
  "apps/customer",
  "apps/worker",
  "apps/admin",
  "packages/types",
  "packages/validators",
  "packages/config",
  "packages/api-client",
  "packages/ui",
  "packages/module-loader",
  "docs/architecture",
  "docs/contracts"
)

$missing = @()

foreach ($f in $requiredFiles) {
  $path = Join-Path $Root $f
  if (-not (Test-Path $path)) {
    $missing += $f
  }
}

foreach ($d in $requiredDirs) {
  $path = Join-Path $Root $d
  if (-not (Test-Path $path)) {
    $missing += "$d/"
  }
}

if ($missing.Count -gt 0) {
  Write-Host "XLB Phase 0 architecture preflight FAILED."
  Write-Host "Missing:"
  $missing | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "XLB Phase 0 architecture preflight passed."
