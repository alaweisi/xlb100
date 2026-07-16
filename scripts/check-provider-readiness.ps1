$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $Root
try {
  $required = @(
    "packages/config/src/providerReadiness.ts",
    "backend/src/providers/providerSimulation.ts",
    "backend/src/providers/payment/mockPaymentProvider.ts",
    "backend/src/providers/sms/mockSmsProvider.ts",
    "backend/src/providers/objectStorage/objectStorageProvider.ts",
    "backend/src/providers/objectStorage/tencentCosObjectStorageAdapter.ts",
    "backend/src/dispatch/geoProvider.ts",
    "docs/operations/PROVIDER_INTEGRATION_READINESS_CHECKLIST.md"
  )
  foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "provider readiness artifact missing: $path"
    }
  }

  $config = Get-Content -Raw -Encoding UTF8 "packages/config/src/providerReadiness.ts"
  foreach ($truth in @(
    'XLB_OBJECT_STORAGE_PROVIDER',
    'XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED',
    'Tencent COS requires XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true',
    'XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true requires XLB_OBJECT_STORAGE_PROVIDER=cos',
    'XLB_PAYMENT_PROVIDER"\s*,\s*\["mock"\]',
    'XLB_SMS_PROVIDER"\s*,\s*\["mock"\]',
    'XLB_GEO_PROVIDER"\s*,\s*\["local_mock"\]',
    'XLB_ENTERPRISE_WEBHOOK_PROVIDER"\s*,\s*\["mock_only"\]'
  )) {
    if ($config -notmatch $truth) { throw "provider config truth missing: $truth" }
  }

  $runtimeFiles = @(
    Get-ChildItem "backend/src/providers" -Recurse -File -Filter "*.ts"
    Get-Item "backend/src/enterprise/webhookProvider.ts"
    Get-Item "backend/src/dispatch/geoProvider.ts"
  )
  $externalCalls = @($runtimeFiles | Select-String -Pattern '\bfetch\s*\(|https\.request\s*\(')
  if ($externalCalls.Count -gt 0) {
    throw "external provider network execution is present: $($externalCalls.Path -join ', ')"
  }

  $checklist = Get-Content -Raw -Encoding UTF8 "docs/operations/PROVIDER_INTEGRATION_READINESS_CHECKLIST.md"
  foreach ($blocker in @(
    "REAL_PROVIDER_BLOCKED",
    "PRODUCTION_CREDENTIALS_BLOCKED",
    "LEGAL_ENTITY_BLOCKED",
    "ICP_FILING_BLOCKED",
    "PRODUCTION_ACTIVATION_BLOCKED"
  )) {
    if (-not $checklist.Contains($blocker)) { throw "provider blocker missing: $blocker" }
  }
} finally {
  Pop-Location
}
Write-Host "check-provider-readiness: passed"
