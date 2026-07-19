# Production edge and non-durable business smoke. The realtime ticket is a
# one-time Redis record; every business assertion is read-only and leaves no
# persistent domain mutation.
param(
  [string]$EnvFile = ".env.production",
  [ValidateRange(3, 120)][int]$TimeoutSec = 15,
  [switch]$DryRun,
  [switch]$AllowLocalhost
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envPath = if ([IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $root $EnvFile }

function Fail([string]$Message) {
  Write-Host "smoke-prod: FAILED - $Message"
  exit 1
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "required env file not found: $Path"
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

$envValues = Read-EnvFile $envPath

function Get-ConfigValue([string]$Name) {
  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if ($processValue) { return $processValue }
  return $envValues[$Name]
}

function Require-ConfigValue([string]$Name) {
  $value = Get-ConfigValue $Name
  if (-not $value) { Fail "missing production smoke setting: $Name" }
  return $value
}

function Assert-ProductionUri([string]$Name, [string]$Value) {
  try { $uri = [Uri]$Value } catch { Fail "invalid URL for ${Name}: $Value" }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne "https") {
    Fail "production URL must use https for ${Name}: $Value"
  }
  if ($uri.Host.EndsWith(".invalid") -or $uri.Host -eq "example.invalid") {
    Fail "production URL still uses a non-routable placeholder for ${Name}: $Value"
  }
  if (-not $AllowLocalhost -and ($uri.Host -in @("localhost", "127.0.0.1", "::1"))) {
    Fail "production URL must not target localhost for ${Name}: $Value"
  }
  return $uri
}

function Join-AppUrl([Uri]$Base, [string]$Path) {
  return "{0}://{1}{2}" -f $Base.Scheme, $Base.Authority, $Path
}

function Read-SecretFile([string]$Name, [string]$Path) {
  $resolved = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $root $Path }
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    Fail "$Name must point to a readable secret-manager materialized file"
  }
  $value = (Get-Content -LiteralPath $resolved -Raw).Trim()
  if (-not $value) { Fail "$Name secret file is empty" }
  return $value
}

function Invoke-JsonGet([string]$Name, [string]$Url, [hashtable]$Headers = @{}) {
  Write-Host "smoke-prod: checking $Name -> $Url"
  try {
    return Invoke-RestMethod -Uri $Url -Method Get -Headers $Headers -MaximumRedirection 0 -TimeoutSec $TimeoutSec
  } catch {
    Fail "$Name request failed: $($_.Exception.Message)"
  }
}

function Invoke-JsonPost([string]$Name, [string]$Url, [hashtable]$Headers, [object]$Body) {
  Write-Host "smoke-prod: checking $Name -> $Url"
  try {
    return Invoke-RestMethod -Uri $Url -Method Post -Headers $Headers -ContentType "application/json" `
      -Body ($Body | ConvertTo-Json -Compress) -MaximumRedirection 0 -TimeoutSec $TimeoutSec
  } catch {
    Fail "$Name request failed: $($_.Exception.Message)"
  }
}

function Assert-Frontend([string]$Name, [Uri]$Uri) {
  Write-Host "smoke-prod: checking $Name frontend -> $Uri"
  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -MaximumRedirection 0 -TimeoutSec $TimeoutSec
    if ($response.StatusCode -ne 200) { throw "status $($response.StatusCode)" }
    if ($response.Content.Length -lt 100 -or $response.Content -notmatch '<(html|!doctype)') {
      throw "frontend response is not an application HTML document"
    }
    if (-not $response.Headers["Strict-Transport-Security"]) { throw "HSTS header is missing" }
    if (-not $response.Headers["Content-Security-Policy"]) { throw "Content-Security-Policy header is missing" }
    if ($response.Headers["X-Content-Type-Options"] -ne "nosniff") { throw "nosniff header is missing" }
  } catch {
    Fail "$Name frontend failed: $($_.Exception.Message)"
  }
}

function Assert-DebugRouteDisabled([Uri]$CustomerOrigin) {
  $url = Join-AppUrl $CustomerOrigin "/api/auth/customer/debug-code?phone=13800000000"
  Write-Host "smoke-prod: checking production debug route is disabled"
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec $TimeoutSec
    Fail "production debug-code route unexpectedly returned status $($response.StatusCode)"
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -ne 404) { Fail "production debug-code route must return 404; received $status" }
  }
}

function Receive-WebSocketJson(
  [System.Net.WebSockets.ClientWebSocket]$Socket,
  [Threading.CancellationToken]$CancellationToken
) {
  $buffer = New-Object byte[] 65536
  $builder = [Text.StringBuilder]::new()
  do {
    $segment = [ArraySegment[byte]]::new($buffer)
    $result = $Socket.ReceiveAsync($segment, $CancellationToken).GetAwaiter().GetResult()
    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw "server closed WebSocket before the smoke exchange completed"
    }
    [void]$builder.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
  } until ($result.EndOfMessage)
  return $builder.ToString() | ConvertFrom-Json
}

function Assert-WebSocket([Uri]$CustomerOrigin, [hashtable]$Headers, [string]$Ticket) {
  $builder = [UriBuilder]::new($CustomerOrigin)
  $builder.Scheme = "wss"
  $builder.Path = "/api/support/realtime"
  $builder.Query = "ticket=$([Uri]::EscapeDataString($Ticket))"

  Write-Host "smoke-prod: checking customer same-origin WebSocket upgrade"
  $socket = [System.Net.WebSockets.ClientWebSocket]::new()
  foreach ($name in $Headers.Keys) { $socket.Options.SetRequestHeader($name, [string]$Headers[$name]) }
  $timeout = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSec))
  try {
    $socket.ConnectAsync($builder.Uri, $timeout.Token).GetAwaiter().GetResult()
    $ready = Receive-WebSocketJson $socket $timeout.Token
    if ($ready.protocolVersion -ne 1 -or $ready.type -ne "ready") {
      throw "expected protocolVersion=1 ready frame"
    }

    $requestId = "prod-smoke-$([Guid]::NewGuid().ToString('N'))"
    $payload = @{ protocolVersion = 1; type = "ping"; requestId = $requestId } | ConvertTo-Json -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    $socket.SendAsync(
      $segment,
      [System.Net.WebSockets.WebSocketMessageType]::Text,
      $true,
      $timeout.Token
    ).GetAwaiter().GetResult()
    $pong = Receive-WebSocketJson $socket $timeout.Token
    if ($pong.protocolVersion -ne 1 -or $pong.type -ne "pong" -or $pong.requestId -ne $requestId) {
      throw "expected matching protocolVersion=1 pong frame"
    }
    $socket.CloseAsync(
      [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
      "production smoke complete",
      $timeout.Token
    ).GetAwaiter().GetResult()
  } catch {
    Fail "customer same-origin WebSocket failed: $($_.Exception.Message)"
  } finally {
    $timeout.Dispose()
    $socket.Dispose()
  }
}

$backendHealth = Assert-ProductionUri "backend health" (Require-ConfigValue "PROD_BACKEND_HEALTH_URL")
$backendDbHealth = Assert-ProductionUri "backend db-health" (Require-ConfigValue "PROD_BACKEND_DB_HEALTH_URL")
$customerOrigin = Assert-ProductionUri "customer" (Require-ConfigValue "PROD_CUSTOMER_URL")
$workerOrigin = Assert-ProductionUri "worker" (Require-ConfigValue "PROD_WORKER_URL")
$adminOrigin = Assert-ProductionUri "admin" (Require-ConfigValue "PROD_ADMIN_URL")

$cityCode = Require-ConfigValue "PROD_SMOKE_CITY_CODE"
$skuId = Require-ConfigValue "PROD_SMOKE_SKU_ID"
$orderId = Require-ConfigValue "PROD_SMOKE_ORDER_ID"
$tokenFile = Require-ConfigValue "PROD_SMOKE_CUSTOMER_TOKEN_FILE"
$customerToken = Read-SecretFile "PROD_SMOKE_CUSTOMER_TOKEN_FILE" $tokenFile

$routingChecks = @(
  @{ Name = "customer same-origin API"; Url = Join-AppUrl $customerOrigin "/api/system/status" },
  @{ Name = "worker same-origin API"; Url = Join-AppUrl $workerOrigin "/api/system/status" },
  @{ Name = "admin same-origin API"; Url = Join-AppUrl $adminOrigin "/api/system/status" }
)

if ($DryRun) {
  Write-Host "smoke-prod: dry-run validated HTTPS origins and the customer smoke token file"
  Write-Host "smoke-prod: dry-run would check backend health and db-health"
  foreach ($check in $routingChecks) { Write-Host "smoke-prod: dry-run would check $($check.Name) -> $($check.Url)" }
  Write-Host "smoke-prod: dry-run would check three frontend documents and required security headers"
  Write-Host "smoke-prod: dry-run would assert production debug-code is disabled"
  Write-Host "smoke-prod: dry-run would read catalog, quote SKU '$skuId', and read smoke order '$orderId' in city '$cityCode'"
  Write-Host "smoke-prod: dry-run would issue a one-time realtime ticket and verify WebSocket ready/ping/pong"
  exit 0
}

$health = Invoke-JsonGet "backend health" $backendHealth.AbsoluteUri
if ($health.status -ne "ok" -or $health.service -ne "xlb-backend") {
  Fail "backend health payload is not ready"
}

$dbHealth = Invoke-JsonGet "backend db-health" $backendDbHealth.AbsoluteUri
if (-not $dbHealth.ok -or $dbHealth.mysql -ne "ok" -or $dbHealth.redis -ne "ok") {
  Fail "database or Redis connectivity is not ready"
}
if (-not $dbHealth.dataReliability.ready -or $dbHealth.jobWorker.state -ne "fresh") {
  Fail "data reliability or dedicated jobs heartbeat is not ready"
}

foreach ($check in $routingChecks) {
  $status = Invoke-JsonGet $check.Name $check.Url
  if (-not $status.ok -or $status.project -ne "XLB" -or $status.backend -ne "ready") {
    Fail "$($check.Name) did not reach the backend system status endpoint"
  }
}

Assert-Frontend "customer" $customerOrigin
Assert-Frontend "worker" $workerOrigin
Assert-Frontend "admin" $adminOrigin
Assert-DebugRouteDisabled $customerOrigin

$headers = @{
  Authorization = "Bearer $customerToken"
  "x-xlb-city-code" = $cityCode
}

$catalogUrl = Join-AppUrl $customerOrigin "/api/catalog"
$catalog = Invoke-JsonGet "customer catalog" $catalogUrl $headers
if (
  -not $catalog.ok -or -not $catalog.catalog -or $catalog.catalog.cityCode -ne $cityCode `
  -or -not $catalog.catalog.categories -or $catalog.catalog.categories.Count -lt 1
) { Fail "customer catalog payload is invalid or references the wrong city" }
$catalogSkuIds = @($catalog.catalog.categories | ForEach-Object {
  $_.items | ForEach-Object { $_.skus | ForEach-Object { $_.skuId } }
})
if ($skuId -notin $catalogSkuIds) { Fail "configured smoke SKU is not present in the enabled catalog" }

$quoteUrl = Join-AppUrl $customerOrigin "/api/pricing/quote?skuId=$([Uri]::EscapeDataString($skuId))"
$quote = Invoke-JsonGet "customer pricing quote" $quoteUrl $headers
if (
  -not $quote.ok -or -not $quote.quote -or $quote.quote.skuId -ne $skuId `
  -or $quote.quote.cityCode -ne $cityCode -or $quote.quote.currency -ne "CNY" `
  -or $null -eq $quote.quote.breakdown -or $null -eq $quote.quote.breakdown.totalAmount
) {
  Fail "customer quote payload is invalid or references the wrong city/SKU/currency"
}

$orderUrl = Join-AppUrl $customerOrigin "/api/orders/$([Uri]::EscapeDataString($orderId))"
$order = Invoke-JsonGet "customer smoke order" $orderUrl $headers
if (
  -not $order.ok -or -not $order.order -or $order.order.orderId -ne $orderId `
  -or $order.order.cityCode -ne $cityCode
) {
  Fail "customer order payload is invalid or references the wrong order/city"
}

$ticketUrl = Join-AppUrl $customerOrigin "/api/support/realtime-ticket"
$ticket = Invoke-JsonPost "customer realtime ticket" $ticketUrl $headers @{}
if (-not $ticket.ok -or -not $ticket.ticket) { Fail "realtime ticket response is invalid" }
Assert-WebSocket $customerOrigin $headers $ticket.ticket

Write-Host "smoke-prod: passed - edge routing, security headers, read-only business journey, and WebSocket"
