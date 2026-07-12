$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 24D artifact: $Path" }
}

Push-Location $Root
try {
  if (Test-Path "db/migrations/024_*") { throw "migration 024 is a permanent historical gap" }
  $migration = @(Get-ChildItem "db/migrations" -File -Filter "051_*.sql")
  if ($migration.Count -ne 1 -or $migration[0].Name -ne "051_phase24d_support_realtime_conversations.sql") { throw "Phase 24D must own migration 051 exactly once" }
  foreach ($path in @(
    "docs/architecture/support-realtime-design.md",
    "docs/contracts/CONTRACT_SUPPORT_REALTIME.md",
    "backend/src/support/conversation",
    "tests/contract/supportRealtime.contract.test.ts"
  )) { Require-Path $path }

  $contract = Get-Content "docs/contracts/CONTRACT_SUPPORT_REALTIME.md" -Raw
  foreach ($fact in @("serverSeq", "single-use", "Redis", "support.message.created")) {
    if (-not $contract.Contains($fact)) { throw "realtime contract missing: $fact" }
  }
  $types = Get-Content "packages/types/src/support.ts" -Raw
  foreach ($fact in @("SupportConversation", "SupportMessage", "SupportRealtimeClientFrame", "protocolVersion: 1")) {
    if (-not $types.Contains($fact)) { throw "realtime types missing: $fact" }
  }
  $outbox = Get-Content "packages/types/src/eventOutbox.ts" -Raw
  foreach ($fact in @("support.conversation.started", "support.conversation.transferred", "support.conversation.closed", "support.message.created")) {
    if (-not $outbox.Contains($fact)) { throw "Outbox closed set missing: $fact" }
  }

  $runtime = @(Get-ChildItem "backend/src/support/conversation" -File -Recurse -ErrorAction SilentlyContinue)
  $forbiddenSql = '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:orders|payment_orders|dispatch_|worker_|aftersale_|ledger_|settlement_)'
  foreach ($file in $runtime) { if ((Get-Content $file.FullName -Raw) -match $forbiddenSql) { throw "realtime writes protected domain: $($file.Name)" } }
  $falseProviderClaims = @(Get-ChildItem "backend/src/support/conversation" -File -Recurse -Filter "*.ts" | Select-String -Pattern 'externalProviderExecuted\s*:\s*true')
  if ($falseProviderClaims.Count -gt 0) { throw "Phase 24D cannot claim external provider execution" }
} finally { Pop-Location }

Write-Host "check-phase24d-boundaries: passed"
