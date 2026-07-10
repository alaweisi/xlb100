# Phase 19 gate: migration, city/client isolation, API keys, idempotency, webhook retry, and non-execution.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MysqlContainer = "xlb-mysql-local"
function Scalar([string]$Sql) { $raw=& docker exec -e MYSQL_PWD=xlb_local_password $MysqlContainer mysql -uxlb --default-character-set=utf8mb4 -N -B xlb_local -e $Sql; if($LASTEXITCODE-ne 0){throw "MySQL query failed: $Sql"};return (($raw|Out-String).Trim()) }
function Equal([string]$Label,[string]$Expected,[string]$Actual){if($Actual-ne$Expected){throw "$Label expected $Expected but found $Actual"};Write-Host "PASS $Label = $Actual"}
$health=(& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $MysqlContainer 2>$null|Out-String).Trim();if($health-ne"healthy"){throw "$MysqlContainer must be healthy; status: $health"}
Push-Location $Root
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1; if($LASTEXITCODE-ne 0){throw "migration failed"}
  Equal "migration 037 applied once" "1" (Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='037_phase19_enterprise_openapi_webhooks'")
  Equal "migration 038 applied once" "1" (Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='038_phase19_enterprise_tenant_hardening'")
  Equal "Phase 19 table count" "8" (Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('business_clients','business_client_contacts','business_api_credentials','business_agreement_prices','business_orders','business_webhook_subscriptions','business_webhook_deliveries','enterprise_bill_snapshots')")
  Equal "Phase 19 global city rows" "0" (Scalar "SELECT (SELECT COUNT(*) FROM business_clients WHERE city_code='__global__')+(SELECT COUNT(*) FROM business_client_contacts WHERE city_code='__global__')+(SELECT COUNT(*) FROM business_api_credentials WHERE city_code='__global__')+(SELECT COUNT(*) FROM business_agreement_prices WHERE city_code='__global__')+(SELECT COUNT(*) FROM business_orders WHERE city_code='__global__')+(SELECT COUNT(*) FROM business_webhook_subscriptions WHERE city_code='__global__')+(SELECT COUNT(*) FROM business_webhook_deliveries WHERE city_code='__global__')+(SELECT COUNT(*) FROM enterprise_bill_snapshots WHERE city_code='__global__')")
  Equal "invalid credential hashes" "0" (Scalar "SELECT COUNT(*) FROM business_api_credentials WHERE secret_hash NOT REGEXP '^[a-f0-9]{64}$'")
  Equal "cross-city enterprise orders" "0" (Scalar "SELECT COUNT(*) FROM business_orders bo JOIN orders o ON o.order_id=bo.order_id WHERE bo.city_code<>o.city_code")
  Equal "cross-city webhook events" "0" (Scalar "SELECT COUNT(*) FROM business_webhook_deliveries d JOIN event_outbox e ON e.event_id=d.event_id WHERE d.city_code<>e.city_code")
  Equal "cross-client agreement references" "0" (Scalar "SELECT COUNT(*) FROM business_orders bo JOIN business_agreement_prices ap ON ap.agreement_price_id=bo.agreement_price_id WHERE bo.business_client_id<>ap.business_client_id OR bo.city_code<>ap.city_code")
  Equal "cross-client webhook references" "0" (Scalar "SELECT COUNT(*) FROM business_webhook_deliveries d JOIN business_webhook_subscriptions s ON s.subscription_id=d.subscription_id WHERE d.business_client_id<>s.business_client_id OR d.city_code<>s.city_code")
  Equal "Phase 19 tenant composite foreign keys" "2" (Scalar "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('fk_business_order_agreement_client','fk_business_delivery_subscription_client')")
  Equal "Phase 19 idempotency unique indexes" "3" (Scalar "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name IN ('uq_business_order_external','uq_business_order_idempotency','uq_business_delivery_subscription_event')")
  Equal "real webhook provider executions in verification data" "0" (Scalar "SELECT COUNT(*) FROM business_webhook_deliveries WHERE JSON_EXTRACT(provider_envelope_json,'$.externalProviderExecuted')=true")
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase19-boundaries.ps1; if($LASTEXITCODE-ne 0){throw "boundary gate failed"}
  & npx.cmd vitest run tests/contract/enterprise.contract.test.ts tests/unit/enterpriseWebhookProvider.test.ts tests/unit/enterpriseWebhookSignature.test.ts tests/integration/phase19EnterpriseOpenApi.test.ts tests/security/phase19EnterpriseSecurity.test.ts; if($LASTEXITCODE-ne 0){throw "Phase 19 tests failed"}
  Equal "invalid credential hashes after tests" "0" (Scalar "SELECT COUNT(*) FROM business_api_credentials WHERE secret_hash NOT REGEXP '^[a-f0-9]{64}$'")
} finally { Pop-Location }
Write-Host "check-phase19-migration-verification: passed"
