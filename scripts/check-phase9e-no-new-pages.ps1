$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'docs/CURRENT_STATE.md')
$phase29Entry = Join-Path $Root 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29Architecture = Join-Path $Root 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29Contract = Join-Path $Root 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29Registry = Join-Path $Root 'docs/governance/phase-registry.json'
$phase29Authorized =
  ($currentState.Contains('| Phase 29 | IN PROGRESS |') -or $currentState.Contains('| Phase 29 | LOCKED |')) -and
  $currentState.Contains('D01') -and
  $currentState.Contains('D24') -and
  (Test-Path -LiteralPath $phase29Entry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('Every row below is **HUMAN APPROVED**') -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('| D24 |') -and
  (Test-Path -LiteralPath $phase29Architecture) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Architecture).Contains('ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED') -and
  (Test-Path -LiteralPath $phase29Contract) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Contract).Contains('Phase 29 human-approved contract') -and
  (Test-Path -LiteralPath $phase29Registry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Registry).Contains('Entry decisions D01-D24 are approved for continuous construction through independent acceptance.')
$phase29AdminPages = @(
  'apps/admin/src/pages/MarketingOperationsPage.tsx',
  'apps/admin/src/pages/OrderTracePage.tsx',
  'apps/admin/src/pages/marketing-operations.css'
)
# Phase 10 governance page is a legitimate Phase 10A admin addition
$vs = $diff | Where-Object {
  $changedPath = $_.ToString().Trim() -replace '\\', '/'
  $changedPath.StartsWith('apps/admin/src/pages/') -and
    $changedPath -notmatch 'SettlementOpsPage|SettlementStatementDetailPage|SettlementExportReviewPage|SettlementActionGovernancePage|PlatformOperationsPage|SupportTicketsPage|SupportRoutingConfigPage|SupportKnowledgeBasePage|SupportQualityPage' -and
    (-not $phase29Authorized -or $phase29AdminPages -notcontains $changedPath)
}
if ($vs) { Write-Host "check-phase9e-no-new-pages: FAILED"; exit 1 }
Write-Host "check-phase9e-no-new-pages: passed (exact later-phase page allowlist)"
