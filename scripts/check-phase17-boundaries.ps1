# Phase 17 gate: aftersale workflows must not execute payment, refund, ledger, or dispatch assignment.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$SourceFiles = @(
  Get-ChildItem (Join-Path $Root "backend\src\order\reverse") -Filter "*.ts" -File -Recurse
  Get-ChildItem (Join-Path $Root "backend\src\aftersale\case") -Filter "*.ts" -File -Recurse
)
$Violations = @()

foreach ($file in $SourceFiles) {
  $content = Get-Content -Raw $file.FullName
  $relative = $file.FullName.Substring($Root.Length + 1)
  $forbidden = @(
    '(?im)^\s*import .*ledger',
    '(?im)^\s*import .*aftersale/refund',
    '(?im)^\s*import .*refundService',
    '(?im)^\s*import .*payment.*Service',
    '(?im)\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(ledger_|payment_orders|aftersale_refund_requests|dispatch_offers|worker_task_acceptances)',
    '(?im)approveRefund|executeRefund|reverseLedger|providerRefund'
  )
  foreach ($pattern in $forbidden) {
    if ($content -match $pattern) {
      $Violations += "$relative matched forbidden Phase 17 pattern: $pattern"
    }
  }
}

$migration = Get-Content -Raw (Join-Path $Root "db\migrations\034_phase17_order_reverse_aftersale_complaints.sql")
foreach ($required in @(
  "city_code <> '__global__'",
  "provider_execution_status VARCHAR(32) NOT NULL DEFAULT 'not_executed'",
  "provider_execution_status = 'not_executed'"
)) {
  if (-not $migration.Contains($required)) {
    $Violations += "migration 034 missing required boundary: $required"
  }
}

if ($Violations.Count -gt 0) {
  Write-Host "check-phase17-boundaries: FAILED"
  $Violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase17-boundaries: passed"
