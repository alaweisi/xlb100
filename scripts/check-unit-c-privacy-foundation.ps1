$ErrorActionPreference = 'Stop'

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

function Read-Utf8([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Unit C required artifact is missing: $Path"
  }
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
}

function Require-Contains([string]$Text, [string]$Needle, [string]$Label) {
  if (-not $Text.Contains($Needle)) {
    throw "Unit C evidence is missing ${Label}: $Needle"
  }
}

function Require-CountAtLeast([string]$Text, [string]$Pattern, [int]$Minimum, [string]$Label) {
  $count = ([regex]::Matches($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count
  if ($count -lt $Minimum) {
    throw "Unit C ${Label} count must be at least $Minimum; found $count"
  }
}

$inventoryPath = 'docs/compliance/privacy/XLB_PERSONAL_INFORMATION_INVENTORY.md'
$privacyPath = 'docs/compliance/privacy/XLB_PRIVACY_POLICY_DRAFT.md'
$agreementPath = 'docs/compliance/legal/XLB_USER_SERVICE_AGREEMENT_DRAFT.md'
$threatPath = 'docs/security/XLB_THREAT_MODEL_2026-07-19.md'

$inventory = Read-Utf8 $inventoryPath
$privacy = Read-Utf8 $privacyPath
$agreement = Read-Utf8 $agreementPath
$threat = Read-Utf8 $threatPath

foreach ($required in @(
  'UNIT_C_INVENTORY_REQUIRED:', 'identity', 'otp_session', 'browser_storage',
  'address_order', 'precise_location', 'media', 'support', 'review', 'marketing',
  'finance', 'enterprise', 'outbox_logs', 'backup', 'data_subject_rights',
  'w5a_boundary', 'Customer', 'Worker', 'Admin', 'Enterprise', 'Outbox'
)) {
  Require-Contains $inventory $required "inventory term"
}
Require-CountAtLeast $inventory '^\| D\d{2} \|' 30 'data inventory row'

foreach ($draft in @(
  @{ Path = $privacyPath; Text = $privacy },
  @{ Path = $agreementPath; Text = $agreement }
)) {
  Require-Contains $draft.Text 'legal_status: DRAFT_NOT_LEGAL_ADVICE' "draft legal status in $($draft.Path)"
  Require-Contains $draft.Text 'production_approved: false' "production block in $($draft.Path)"
  Require-Contains $draft.Text 'DRAFT_NOT_LEGAL_ADVICE' "publication warning in $($draft.Path)"
  Require-Contains $draft.Text 'production_approved: false' "operator/business publication block in $($draft.Path)"
  if ($draft.Text.Contains('production_approved: true')) {
    throw "Unit C engineering drafts must never claim production approval: $($draft.Path)"
  }
}

foreach ($required in @(
  'UNIT_C_PRIVACY_REQUIRED:', 'separate_consent', 'consent_withdrawal',
  'account_cancellation', 'third_party_sdk', 'minors', 'automated_decision',
  'cross_border', 'retention_deletion', 'rights', 'security_incident',
  'publication_gate', 'DRAFT_NOT_LEGAL_ADVICE'
)) {
  Require-Contains $privacy $required 'privacy policy section'
}
Require-CountAtLeast $privacy 'https://(www\.)?(cac|samr)\.gov\.cn/' 6 'official privacy source'

foreach ($required in @(
  'UNIT_C_AGREEMENT_REQUIRED:', 'operator', 'business_model', 'order_contract',
  'price_payment', 'invoice', 'cancellation_refund', 'service_safety', 'privacy',
  'platform_rule_change', 'dispute', 'publication_gate', 'no_final_interpretation'
)) {
  Require-Contains $agreement $required 'user agreement section'
}
Require-CountAtLeast $agreement 'https://(www\.)?(npc|samr)\.gov\.cn/' 5 'official agreement source'

foreach ($required in @(
  'UNIT_C_THREAT_REQUIRED:', 'STRIDE', 'launch_blockers', 'TM-01', 'TM-04A', 'TM-04B',
  'TM-12A', 'TM-31', 'auth_idor', 'admin_city_scope', 'mock_payment',
  'REAL_STAGING = BLOCKED', 'PUBLIC_COMMERCIAL_RELEASE = NO-GO'
)) {
  Require-Contains $threat $required 'threat model evidence'
}
Require-CountAtLeast $threat '^\| TM-\d{2}[A-Z]? \|' 30 'threat register row'

$referencedPaths = @(
  'db/migrations/028_customers_admin_users.sql',
  'db/migrations/029_order_service_address_schedule.sql',
  'db/migrations/032_customer_admin_fks_worker_finance.sql',
  'db/migrations/035_phase18_fulfillment_evidence_object_storage.sql',
  'db/migrations/039_phase20_lbs_lite_dispatch.sql',
  'db/migrations/047_phase24b_support_ticket_mvp.sql',
  'db/migrations/051_phase24d_support_realtime_conversations.sql',
  'backend/src/auth/otpService.ts',
  'backend/src/auth/tokenAuth.ts',
  'backend/src/order/orderService.ts',
  'backend/src/payment/paymentWebhook.ts',
  'backend/src/streams/outboxRetentionPolicy.ts',
  'apps/customer/src/pages/customerPageShell.tsx',
  'apps/admin/src/adminAuth.ts'
)
foreach ($path in $referencedPaths) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Unit C referenced code evidence is missing: $path"
  }
}

Write-Output 'check-unit-c-privacy-foundation: passed'
