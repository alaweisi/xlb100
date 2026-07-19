$ErrorActionPreference = 'Stop'

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

function Read-Utf8([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Unit C required artifact is missing: $Path"
  }
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
}

function Read-FrontMatter([string]$Text, [string]$Path) {
  $match = [regex]::Match($Text, '\A---\r?\n(?<front>[\s\S]*?)\r?\n---\r?\n')
  if (-not $match.Success) {
    throw "Unit C artifact must start with YAML front matter: $Path"
  }
  $result = @{}
  foreach ($line in ($match.Groups['front'].Value -split '\r?\n')) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^([a-z_]+):\s*(.+?)\s*$') {
      throw "Unit C front matter line is invalid in ${Path}: $line"
    }
    $key = $Matches[1]
    if ($result.ContainsKey($key)) {
      throw "Unit C front matter key is duplicated in ${Path}: $key"
    }
    $result[$key] = $Matches[2]
  }
  return $result
}

function Require-FrontValue([hashtable]$Front, [string]$Key, [string]$Expected, [string]$Path) {
  if (-not $Front.ContainsKey($Key) -or $Front[$Key] -cne $Expected) {
    $actual = if ($Front.ContainsKey($Key)) { $Front[$Key] } else { '<missing>' }
    throw "Unit C front matter ${Key} must be '${Expected}' in ${Path}; found '${actual}'"
  }
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
$statePath = 'docs/CURRENT_STATE.md'
$reportPath = 'docs/reports/UNIT_C_PRIVACY_FOUNDATION_LOCK_REPORT.md'

$inventory = Read-Utf8 $inventoryPath
$privacy = Read-Utf8 $privacyPath
$agreement = Read-Utf8 $agreementPath
$threat = Read-Utf8 $threatPath
$state = Read-Utf8 $statePath
$report = Read-Utf8 $reportPath

$inventoryFront = Read-FrontMatter $inventory $inventoryPath
$privacyFront = Read-FrontMatter $privacy $privacyPath
$agreementFront = Read-FrontMatter $agreement $agreementPath
$threatFront = Read-FrontMatter $threat $threatPath
$reportFront = Read-FrontMatter $report $reportPath

foreach ($pair in @(
  @{ Front = $inventoryFront; Path = $inventoryPath; Publication = 'INTERNAL_ENGINEERING_ONLY' },
  @{ Front = $threatFront; Path = $threatPath; Publication = 'INTERNAL_ENGINEERING_ONLY' },
  @{ Front = $reportFront; Path = $reportPath; Publication = 'INTERNAL_ENGINEERING_ONLY' },
  @{ Front = $privacyFront; Path = $privacyPath; Publication = 'NOT_FOR_PUBLICATION' },
  @{ Front = $agreementFront; Path = $agreementPath; Publication = 'NOT_FOR_PUBLICATION' }
)) {
  Require-FrontValue $pair.Front 'production_approved' 'false' $pair.Path
  Require-FrontValue $pair.Front 'publication_status' $pair.Publication $pair.Path
  Require-FrontValue $pair.Front 'release_decision' 'NO_GO' $pair.Path
}

foreach ($pair in @(
  @{ Front = $privacyFront; Path = $privacyPath },
  @{ Front = $agreementFront; Path = $agreementPath }
)) {
  Require-FrontValue $pair.Front 'legal_status' 'DRAFT_NOT_LEGAL_ADVICE' $pair.Path
  Require-FrontValue $pair.Front 'unresolved_placeholders' 'true' $pair.Path
}

foreach ($pair in @(
  @{ Front = $inventoryFront; Path = $inventoryPath },
  @{ Front = $threatFront; Path = $threatPath }
)) {
  Require-FrontValue $pair.Front 'engineering_status' 'LOCKED' $pair.Path
}
Require-FrontValue $reportFront 'engineering_status' 'LOCKED' $reportPath
Require-FrontValue $reportFront 'canonical_tag' 'xlb-unit-c-privacy-foundation-v1' $reportPath

foreach ($text in @($inventory, $privacy, $agreement, $threat)) {
  if ($text.Contains('UNIT_C_INVENTORY_REQUIRED:') -or
      $text.Contains('UNIT_C_PRIVACY_REQUIRED:') -or
      $text.Contains('UNIT_C_AGREEMENT_REQUIRED:') -or
      $text.Contains('UNIT_C_THREAT_REQUIRED:')) {
    throw 'Unit C semantic evidence must live in real sections, not a keyword-only marker comment'
  }
}

Require-CountAtLeast $inventory '^## ' 10 'inventory section'
Require-CountAtLeast $inventory '^\| D\d{2} \|' 30 'data inventory row'
foreach ($required in @(
  'Customer', 'Worker', 'Admin/Operator/Auditor', 'Enterprise', 'localStorage',
  'worker_locations', 'media_assets', 'db/migrations/051_phase24d_support_realtime_conversations.sql', 'worker_bank_accounts',
  'event_outbox', 'IMPORTANT_DATA_CLASSIFICATION = NOT_DETERMINED',
  'backend/src/auth/otpService.ts'
)) {
  Require-Contains $inventory $required 'inventory evidence'
}

Require-CountAtLeast $privacy '^## ' 20 'privacy policy section'
Require-CountAtLeast $privacy 'RELEASE_BLOCKER:' 8 'privacy release blocker'
foreach ($required in @(
  'Customer', 'Worker', 'Admin/Operator/Auditor', 'city_scopes', 'MFA/SSO',
  'localStorage', 'SMS Provider', 'Tencent COS', 'Payment Provider', 'W5B',
  'DRAFT_NOT_LEGAL_ADVICE', 'NOT_FOR_PUBLICATION', 'NO_GO'
)) {
  Require-Contains $privacy $required 'privacy policy evidence'
}
foreach ($source in @(
  'https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm',
  'https://www.cac.gov.cn/2024-09/30/c_1729384452307680.htm',
  'https://www.cac.gov.cn/2021-03/22/c_1617990997054277.htm',
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2024/art_0aea188276a44f0baf940ab95ee00e0a.html',
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_4b47c79b8d994a42bba4835997688faa.html',
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2026/art_85b474fc5a08494bb60ca6a280b98d7d.html'
)) {
  Require-Contains $privacy $source 'official privacy source'
}

Require-CountAtLeast $agreement '^## ' 19 'agreement section'
Require-CountAtLeast $agreement 'RELEASE_BLOCKER:' 8 'agreement release blocker'
foreach ($required in @(
  'Customer', 'Worker', 'XLB_PRIVACY_POLICY_DRAFT.md',
  'DRAFT_NOT_LEGAL_ADVICE', 'NOT_FOR_PUBLICATION', 'NO_GO'
)) {
  Require-Contains $agreement $required 'agreement evidence'
}
foreach ($source in @(
  'https://www.npc.gov.cn/npc/c2/c30834/202009/t20200921_307713.html',
  'https://www.samr.gov.cn/zfjcj/tzgg/art/2023/art_d337c3291e8b40459ca03dea54395856.html',
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2024/art_0aea188276a44f0baf940ab95ee00e0a.html',
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2025/art_4b47c79b8d994a42bba4835997688faa.html',
  'https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2026/art_85b474fc5a08494bb60ca6a280b98d7d.html'
)) {
  Require-Contains $agreement $source 'official agreement source'
}

Require-CountAtLeast $threat '^## ' 10 'threat model section'
Require-CountAtLeast $threat '^\| TM-\d{2}[A-Z]? \|' 36 'threat register row'
foreach ($required in @(
  'STRIDE', 'TM-01', 'TM-04A', 'TM-04B', 'TM-12A', 'TM-31', 'TM-36',
  'backend/src/order/orderService.ts', 'backend/src/dal/adminQueryGuard.ts',
  '/api/payments/mock-webhook', 'REAL_STAGING = BLOCKED',
  'PUBLIC_COMMERCIAL_RELEASE = NO-GO'
)) {
  Require-Contains $threat $required 'threat model evidence'
}

foreach ($required in @(
  'Commercialization Unit C', 'Privacy Inventory, Draft Agreements, Threat Model (LOCKED)',
  'xlb-unit-c-privacy-foundation-v1', 'P0/P1/P2/P3 = 0/0/0/0',
  'production_approved: false', 'PRODUCTION BLOCKED',
  'UNIT_C_PRIVACY_FOUNDATION_LOCK_REPORT.md'
)) {
  Require-Contains $state $required 'current state lock evidence'
}
foreach ($required in @(
  'UNIT_C_W5A_ENGINEERING_BASELINE = LOCKED', 'PRODUCTION_APPROVED = FALSE',
  'PUBLIC_COMMERCIAL_RELEASE = NO_GO', '0de3fe04654018fc2941e52b494bef0a747f89fd',
  'AUTH-ORDER-P0', 'AUTH-CITY-P0', 'PAY-MOCK-P0',
  'P0/P1/P2/P3 = 0/0/0/0', 'DRAFT_NOT_LEGAL_ADVICE'
)) {
  Require-Contains $report $required 'lock report evidence'
}

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
  'backend/src/dal/adminQueryGuard.ts',
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
