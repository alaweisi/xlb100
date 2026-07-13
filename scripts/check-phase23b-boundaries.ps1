$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "xlb-phase23a-auth-data-safety-hardening"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 23B artifact: $Path" }
}
function Require-Match([string]$Label, [string]$Content, [string]$Pattern) {
  if ($Content -notmatch $Pattern) { throw "$Label is missing required evidence: $Pattern" }
  Write-Host "PASS $Label"
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing locked Phase 23A baseline tag: $BaseRef" }

  $locked = @(& git diff --name-only $BaseRef -- db/migrations | Where-Object { $_ -match '^db/migrations/0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-3])_' })
  if ($locked.Count -gt 0) { throw "locked migrations 000-043 changed: $($locked -join ', ')" }
  Write-Host "PASS locked migrations 000-043 are unchanged"

  $migration = @(Get-ChildItem (Join-Path $Root "db/migrations") -Filter "044_*.sql")
  if ($migration.Count -ne 1 -or $migration[0].Name -ne "044_phase23b_event_outbox_reliability.sql") {
    throw "Phase 23B must own exactly 044_phase23b_event_outbox_reliability.sql"
  }

  $protected = @(& git diff --name-only $BaseRef -- backend/src/order backend/src/payment backend/src/fulfillment backend/src/settlement backend/src/aftersale backend/src/providers | Where-Object { $_ -notlike 'backend/src/providers/nlu/*' })
  $phase28OrderTrace = 'backend/src/order/orderTraceRoutes.ts'
  if ($protected -contains $phase28OrderTrace) {
    $phase28Migration = Join-Path $Root 'db/migrations/056_phase28_review_reputation.sql'
    if (-not (Test-Path -LiteralPath $phase28Migration)) {
      throw 'order trace privacy redaction is allowed only after Phase28 migration 056 exists'
    }
    $phase28Base = 'xlb-phase27-notification-foundation^{}'
    & git rev-parse --verify "$phase28Base`^{commit}" *> $null
    if ($LASTEXITCODE -ne 0) { throw 'missing canonical Phase27 base for exact order-trace privacy diff' }
    $traceDiff = @(& git diff --unified=0 $phase28Base -- $phase28OrderTrace)
    $removed = @($traceDiff | Where-Object { $_.StartsWith('-') -and -not $_.StartsWith('---') } | ForEach-Object { $_.Substring(1).Trim() })
    $added = @($traceDiff | Where-Object { $_.StartsWith('+') -and -not $_.StartsWith('+++') } | ForEach-Object { $_.Substring(1).Trim() })
    $expectedRemoved = @(
      'review_comment: string | null;',
      'rev.comment AS review_comment,',
      'comment: row.review_comment,'
    )
    $expectedAdded = @('comment: null,', 'commentRestricted: true,')
    if ($removed.Count -ne $expectedRemoved.Count -or $added.Count -ne $expectedAdded.Count -or
        (Compare-Object $removed $expectedRemoved).Count -ne 0 -or
        (Compare-Object $added $expectedAdded).Count -ne 0) {
      throw 'Phase28 order trace allowlist permits only the exact Review comment redaction diff'
    }
    $trace = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root $phase28OrderTrace)
    if ($trace -match '(?i)\brev\.comment\b|\breview_comment\b' -or
        $trace -notmatch '(?s)review:\s*row\.review_id.*?comment:\s*null,\s*commentRestricted:\s*true') {
      throw 'Phase28 order trace must not select Review comment and must return an explicit restricted marker'
    }
    $protected = @($protected | Where-Object { $_ -ne $phase28OrderTrace })
    Write-Host 'PASS exact Phase28 order-trace Review comment redaction allowlist'
  }
  if ($protected.Count -gt 0) { throw "Phase 23B changed protected business/provider code: $($protected -join ', ')" }

  $allowedRuntime = @(
    "backend/src/dispatch/dispatchService.ts",
    "backend/src/events/eventOutbox.ts",
    "backend/src/events/outboxDeliveryPolicy.ts",
    "backend/src/ledger/ledgerAccrualService.ts",
    "backend/src/ledger/ledgerOutboxConsumer.ts",
    "backend/src/ledger/ledgerReversalService.ts",
    "backend/src/ledger/replay/replayValidator.ts",
    "backend/src/events/platformDeliveryPolicy.ts",
    "backend/src/events/platformEventCompatibility.ts",
    "backend/src/events/platformDeliveryRepository.ts",
    "backend/src/events/platformDeliveryService.ts"
  )
  $runtimeDiff = @(& git diff --name-only $BaseRef -- backend/src/dispatch backend/src/events backend/src/ledger)
  $unexpected = @($runtimeDiff | Where-Object { $allowedRuntime -notcontains $_ })
  if ($unexpected.Count -gt 0) { throw "unexpected Phase 23B runtime files: $($unexpected -join ', ')" }

  $required = @(
    "tests/unit/outboxDeliveryPolicy.test.ts",
    "tests/integration/outboxClaimConcurrency.test.ts",
    "tests/unit/apiClientReliability.test.ts",
    "tests/contract/apiClientCriticalResponseValidation.test.ts",
    ".github/workflows/phase23b-reliability-gates.yml"
  )
  foreach ($path in $required) { Require-Path $path }

  $migrationText = Get-Content $migration[0].FullName -Raw
  foreach ($term in @("processing", "lease_owner", "lease_token", "lease_expires_at", "attempt_count", "max_attempts", "dead_letter")) {
    Require-Match "migration term $term" $migrationText ([regex]::Escape($term))
  }

  $outbox = Get-Content (Join-Path $Root "backend/src/events/eventOutbox.ts") -Raw
  $outboxTypes = Get-Content (Join-Path $Root "packages/types/src/eventOutbox.ts") -Raw
  foreach ($status in @("pending", "processing", "retry_wait", "published", "dead_letter")) {
    Require-Match "outbox status $status" ($outbox + $outboxTypes) ([regex]::Escape($status))
  }
  Require-Match "atomic claim row lock" $outbox '(?is)FOR\s+UPDATE\s+SKIP\s+LOCKED'
  Require-Match "lease-token acknowledgement CAS" $outbox '(?is)acknowledgeClaim.{0,2000}status=.processing.{0,500}lease_owner=\?.{0,300}lease_token=\?'
  Require-Match "expired lease rejection" $outbox '(?is)lease_expires_at\s*>\s*CURRENT_TIMESTAMP'

  foreach ($consumer in @("backend/src/dispatch/dispatchService.ts", "backend/src/ledger/ledgerOutboxConsumer.ts")) {
    $content = Get-Content (Join-Path $Root $consumer) -Raw
    if ($content -match 'findPending(?:OrderCreatedForDispatch|FulfillmentCompletedForLedger|EventsByType)') {
      throw "consumer bypasses atomic claim: $consumer"
    }
    Require-Match "consumer claim $consumer" $content 'claim(?:OrderCreatedForDispatch|FulfillmentCompletedForLedger|EventsByType)'
  }

  $client = Get-Content (Join-Path $Root "packages/api-client/src/createApiClient.ts") -Raw
  foreach ($term in @("AbortController", "timeout", "cancelled", "network", "response_format", "retryAfterMs", "idempotent")) {
    Require-Match "API client reliability $term" $client ([regex]::Escape($term))
  }
  Require-Match "POST retry is explicit" $client '(?is)method\s*===\s*["'']GET["'']\s*\|\|\s*requestOptions\.retry\s*===\s*["'']idempotent["'']'

  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase23b-reliability-gates.yml") -Raw
  Require-Match "hard-blocking Phase 23B workflow" $workflow 'pnpm gate:phase23b'
  if ($workflow -match 'continue-on-error') { throw "Phase 23B workflow must fail closed" }
} finally {
  Pop-Location
}

Write-Host "check-phase23b-boundaries: passed"
