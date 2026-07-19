param(
  [string]$Image = "nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$template = Join-Path $root "infra/nginx/production.conf.template"
$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
$opensslConfig = if ($openssl) {
  Join-Path (Split-Path -Parent (Split-Path -Parent $openssl)) "ssl\openssl.cnf"
} else { $null }

function Fail([string]$Message) {
  Write-Host "check-unit-b-nginx: FAILED - $Message"
  exit 1
}

if (-not (Test-Path -LiteralPath $template -PathType Leaf)) { Fail "production Nginx template is missing" }
if (-not $openssl) { Fail "openssl is required to create an ephemeral syntax-check certificate" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "docker is required for nginx -t" }

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "xlb-unit-b-nginx-$([Guid]::NewGuid().ToString('N'))"
$secrets = Join-Path $temporaryRoot "secrets"
New-Item -ItemType Directory -Path $secrets -Force | Out-Null

try {
  $certificate = Join-Path $secrets "tls_fullchain"
  $privateKey = Join-Path $secrets "tls_private_key"
  $opensslArguments = @(
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
    "-keyout", $privateKey, "-out", $certificate, "-days", "1",
    "-subj", "/CN=unit-b.test",
    "-addext", "subjectAltName=DNS:unit-b.test,DNS:*.unit-b.test"
  )
  if (Test-Path -LiteralPath $opensslConfig -PathType Leaf) {
    $opensslArguments += @("-config", $opensslConfig)
  }
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $openssl @opensslArguments 2>$null
  $opensslExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  if ($opensslExitCode -ne 0) { Fail "could not create an ephemeral TLS certificate" }

  $arguments = @(
    "run", "--rm",
    "--read-only",
    "--user", "101:101",
    "--cap-drop", "ALL",
    "--cap-add", "NET_BIND_SERVICE",
    "--security-opt", "no-new-privileges",
    "--tmpfs", "/tmp:uid=101,gid=101,mode=1777,size=32m",
    "--tmpfs", "/var/cache/nginx:uid=101,gid=101,mode=0755,size=32m",
    "--tmpfs", "/var/run:uid=101,gid=101,mode=0755,size=8m",
    "--tmpfs", "/etc/nginx/conf.d:uid=101,gid=101,mode=0755,size=8m",
    "--add-host", "backend:127.0.0.1",
    "--add-host", "customer:127.0.0.1",
    "--add-host", "worker:127.0.0.1",
    "--add-host", "admin:127.0.0.1",
    "--env", "XLB_DOMAIN=unit-b.test",
    "--env", "NGINX_ENVSUBST_FILTER=^XLB_DOMAIN$",
    "--volume", "${template}:/etc/nginx/templates/default.conf.template:ro",
    "--volume", "${secrets}:/run/secrets:ro",
    $Image,
    "nginx", "-t"
  )

  Write-Host "check-unit-b-nginx: rendering template and running nginx -t as uid 101"
  & docker @arguments
  if ($LASTEXITCODE -ne 0) { Fail "containerized nginx -t failed" }
  Write-Host "check-unit-b-nginx: passed"
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
