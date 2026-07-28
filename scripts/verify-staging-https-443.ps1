[CmdletBinding()]
param(
  [string]$TargetHost = "123.207.198.136",
  [int]$ConnectTimeoutSeconds = 8,
  [int]$MinimumCertificateLifetimeHours = 24,
  [string[]]$Paths = @(
    "/health",
    "/customer/",
    "/worker/",
    "/admin/",
    "/oa/",
    "/dashboard/"
  )
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function ConvertTo-Hex {
  param([byte[]]$Bytes)

  return [System.BitConverter]::ToString($Bytes).Replace("-", "")
}

function Write-Hold {
  param(
    [string]$Reason,
    [string]$Detail
  )

  [pscustomobject]@{
    status = "HOLD"
    target = "https://$TargetHost/"
    reason = $Reason
    detail = $Detail
    requiredInboundRule = "ALLOW IPv4 TCP 443 FROM 0.0.0.0/0 TO Tencent Cloud staging instance ins-7a8qh4gx"
  } | ConvertTo-Json -Depth 4
  exit 1
}

$tcpClient = [System.Net.Sockets.TcpClient]::new()
$sslStream = $null
$certificate = $null

try {
  try {
    $connectTask = $tcpClient.ConnectAsync($TargetHost, 443)
    if (-not $connectTask.Wait([TimeSpan]::FromSeconds($ConnectTimeoutSeconds))) {
      Write-Hold `
        -Reason "TCP_443_UNREACHABLE" `
        -Detail "No TCP connection reached the standard HTTPS port within $ConnectTimeoutSeconds seconds."
    }
  } catch {
    Write-Hold `
      -Reason "TCP_443_UNREACHABLE" `
      -Detail $_.Exception.Message
  }
  if (-not $tcpClient.Connected) {
    Write-Hold `
      -Reason "TCP_443_UNREACHABLE" `
      -Detail "The standard HTTPS TCP connection did not complete."
  }

  $sslStream = [System.Net.Security.SslStream]::new(
    $tcpClient.GetStream(),
    $false
  )
  try {
    $sslStream.AuthenticateAsClient($TargetHost)
  } catch {
    Write-Hold `
      -Reason "TLS_IDENTITY_OR_CHAIN_INVALID" `
      -Detail $_.Exception.Message
  }

  $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $sslStream.RemoteCertificate
  )
  $sanExtension = $certificate.Extensions |
    Where-Object { $_.Oid.Value -eq "2.5.29.17" } |
    Select-Object -First 1
  if (-not $sanExtension) {
    Write-Hold `
      -Reason "CERTIFICATE_SAN_MISSING" `
      -Detail "The leaf certificate has no Subject Alternative Name extension."
  }

  $sanText = $sanExtension.Format($false)
  $escapedTarget = [System.Text.RegularExpressions.Regex]::Escape($TargetHost)
  if ($sanText -notmatch "(?i)(IP Address|IP Address:|IPAddress)\\s*[=:]?\\s*$escapedTarget(?:\\s|,|$)") {
    Write-Hold `
      -Reason "CERTIFICATE_SAN_MISMATCH" `
      -Detail "The certificate SAN does not contain the target IP address."
  }

  $remaining = $certificate.NotAfter.ToUniversalTime() - [DateTime]::UtcNow
  if ($remaining.TotalHours -lt $MinimumCertificateLifetimeHours) {
    Write-Hold `
      -Reason "CERTIFICATE_EXPIRY_TOO_CLOSE" `
      -Detail "The certificate has only $([Math]::Round($remaining.TotalHours, 1)) hours remaining."
  }

  $chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $chainBuilt = $chain.Build($certificate)
  if (-not $chainBuilt) {
    $statuses = $chain.ChainStatus |
      ForEach-Object { "$($_.Status): $($_.StatusInformation.Trim())" }
    Write-Hold `
      -Reason "CERTIFICATE_CHAIN_INVALID" `
      -Detail ($statuses -join "; ")
  }

  $endpointResults = foreach ($path in $Paths) {
    $uri = "https://$TargetHost$path"
    try {
      $response = Invoke-WebRequest `
        -Uri $uri `
        -Method Head `
        -UseBasicParsing `
        -TimeoutSec $ConnectTimeoutSeconds
      if ($response.StatusCode -ne 200) {
        throw "unexpected HTTP status $($response.StatusCode)"
      }
      [pscustomobject]@{
        path = $path
        statusCode = $response.StatusCode
        passed = $true
      }
    } catch {
      Write-Hold `
        -Reason "PUBLIC_ENDPOINT_FAILED" `
        -Detail "$uri failed: $($_.Exception.Message)"
    }
  }

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $fingerprint = ConvertTo-Hex -Bytes $sha256.ComputeHash($certificate.RawData)
  } finally {
    $sha256.Dispose()
  }

  [pscustomobject]@{
    status = "PASS"
    target = "https://$TargetHost/"
    tcpPort = 443
    tlsProtocol = $sslStream.SslProtocol.ToString()
    certificate = [pscustomobject]@{
      sha256 = $fingerprint
      issuer = $certificate.Issuer
      san = $sanText
      notBeforeUtc = $certificate.NotBefore.ToUniversalTime().ToString("o")
      notAfterUtc = $certificate.NotAfter.ToUniversalTime().ToString("o")
      remainingHours = [Math]::Round($remaining.TotalHours, 1)
      chainElements = @(
        $chain.ChainElements |
          ForEach-Object { $_.Certificate.Subject }
      )
    }
    endpoints = @($endpointResults)
  } | ConvertTo-Json -Depth 6
} finally {
  if ($certificate) {
    $certificate.Dispose()
  }
  if ($sslStream) {
    $sslStream.Dispose()
  }
  $tcpClient.Dispose()
}
