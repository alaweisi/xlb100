[CmdletBinding()]
param(
  [switch]$SkipImageBuild,
  [switch]$KeepResources,
  [switch]$CleanupOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$clusterName = "xlb-tke-acceptance"
$context = "kind-$clusterName"
$namespace = "xlb-local"
$releaseName = "xlb-local"
$mysqlContainer = "xlb-tke-acceptance-mysql"
$redisContainer = "xlb-tke-acceptance-redis"
$ownershipLabel = "xlb.tke.acceptance=true"
$valuesFile = Join-Path $PSScriptRoot "values-acceptance.yaml"
$entry = Join-Path $repoRoot "deploy\tke\xlb-tke.ps1"
$chart = Join-Path $repoRoot "deploy\helm\xlb"
$artifacts = Join-Path $repoRoot ".artifacts\tke-acceptance"
$jwtKeysFile = Join-Path $artifacts "jwt-keys.json"
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot "tool-versions.json") -Raw | ConvertFrom-Json
$portForwards = [Collections.Generic.List[Diagnostics.Process]]::new()
$previousContext = ""
$completed = $false

[IO.Directory]::CreateDirectory($artifacts) | Out-Null

function Invoke-Native([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
}

function Get-OwnedContainer([string]$Name) {
  $id = (@(& docker ps -aq --filter "name=^/$Name$") -join "").Trim()
  if (-not $id) { return "" }
  $inspection = @(& docker inspect $id) -join [Environment]::NewLine | ConvertFrom-Json
  $owned = $inspection[0].Config.Labels.'xlb.tke.acceptance'
  if ($owned -ne "true") { throw "container $Name exists without the N6 ownership label" }
  return $id
}

function Remove-OwnedContainer([string]$Name) {
  $id = Get-OwnedContainer $Name
  if ($id) { Invoke-Native docker @("rm", "-f", $id) }
}

function Remove-AcceptanceResources {
  foreach ($process in $portForwards) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    $process.Dispose()
  }
  $portForwards.Clear()
  if ($script:kind) { & $script:kind delete cluster --name $clusterName | Out-Host }
  Remove-OwnedContainer $mysqlContainer
  Remove-OwnedContainer $redisContainer
}

function Wait-ContainerHealthy([string]$Name, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $status = (@(& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $Name) -join "").Trim()
    if ($status -eq "healthy" -or $status -eq "running") { return }
    if ($status -eq "unhealthy" -or $status -eq "exited") { throw "$Name entered state $status" }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "$Name did not become healthy within $TimeoutSeconds seconds"
}

function Start-PortForward([string]$Service, [int]$LocalPort, [int]$RemotePort) {
  $stdout = Join-Path $artifacts "$Service.port-forward.out.log"
  $stderr = Join-Path $artifacts "$Service.port-forward.err.log"
  Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath "kubectl" -ArgumentList @(
    "--context", $context, "--namespace", $namespace, "port-forward",
    "service/$Service", "$LocalPort`:$RemotePort", "--address", "127.0.0.1"
  ) -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
  $portForwards.Add($process)
  $deadline = (Get-Date).AddSeconds(30)
  do {
    if ($process.HasExited) { throw "port-forward for $Service exited; see $stderr" }
    if ((Test-NetConnection -ComputerName 127.0.0.1 -Port $LocalPort -WarningAction SilentlyContinue).TcpTestSucceeded) { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "port-forward for $Service did not listen on $LocalPort"
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name is required" }
}

foreach ($command in @("docker", "kubectl", "node")) { Assert-Command $command }
Invoke-Native docker @("info", "--format", "{{.ServerVersion}}")
$script:kind = (& (Join-Path $PSScriptRoot "bootstrap-kind.ps1") | Select-Object -Last 1).Trim()
if (-not (Test-Path -LiteralPath $script:kind)) { throw "kind bootstrap returned an invalid path" }

if ($CleanupOnly) {
  Remove-AcceptanceResources
  Write-Host "tke-acceptance: cleanup completed"
  exit 0
}

try {
  Invoke-Native node @("--test", (Join-Path $PSScriptRoot "acceptance-contract.test.mjs"))
  Invoke-Native docker @(
    "run", "--rm", "--entrypoint", "/bin/promtool",
    "--mount", "type=bind,source=$repoRoot,target=/workspace,readonly",
    $manifest.prometheusImage,
    "check", "rules", "/workspace/infra/observability/tke/prometheus-rules.yaml"
  )
  Write-Host "tke-acceptance: authoritative promtool rule validation passed"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $previousContextOutput = @(& kubectl config current-context 2>$null)
  $previousContextExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($previousContextExitCode -eq 0) {
    $previousContext = ($previousContextOutput -join [Environment]::NewLine).Trim()
  }

  Remove-AcceptanceResources
  Invoke-Native docker @(
    "run", "-d", "--name", $mysqlContainer, "--label", $ownershipLabel,
    "-e", "MYSQL_ROOT_PASSWORD=xlb_acceptance_root_password",
    "-e", "MYSQL_DATABASE=xlb_tke_acceptance",
    "-e", "MYSQL_USER=xlb_acceptance",
    "-e", "MYSQL_PASSWORD=xlb_acceptance_password",
    "-p", "127.0.0.1:13306:3306",
    "--health-cmd", "mysqladmin ping -h 127.0.0.1 -uxlb_acceptance -pxlb_acceptance_password",
    "--health-interval", "5s", "--health-timeout", "3s", "--health-retries", "30",
    "mysql:8"
  )
  Invoke-Native docker @(
    "run", "-d", "--name", $redisContainer, "--label", $ownershipLabel,
    "-p", "127.0.0.1:16379:6379",
    "--health-cmd", "redis-cli -a xlb_acceptance_redis_password ping", "--health-interval", "5s",
    "--health-timeout", "3s", "--health-retries", "30", "redis:7",
    "redis-server", "--requirepass", "xlb_acceptance_redis_password"
  )
  Wait-ContainerHealthy $mysqlContainer
  Wait-ContainerHealthy $redisContainer

  if (-not $SkipImageBuild) {
    Invoke-Native docker @("build", "-f", "infra/docker/Dockerfile.backend", "-t", "xlb/backend:local", ".")
    foreach ($app in @("customer", "worker", "admin", "oa", "dashboard")) {
      Invoke-Native docker @(
        "build", "-f", "infra/docker/Dockerfile.frontend", "--build-arg", "APP_NAME=$app",
        "--build-arg", "APP_BASE=/", "-t", "xlb/${app}:local", "."
      )
    }
  }

  Invoke-Native $script:kind @("create", "cluster", "--name", $clusterName, "--image", $manifest.nodeImage, "--wait", "180s")
  foreach ($image in @("xlb/backend:local", "xlb/customer:local", "xlb/worker:local", "xlb/admin:local", "xlb/oa:local", "xlb/dashboard:local")) {
    Invoke-Native $script:kind @("load", "docker-image", $image, "--name", $clusterName)
  }

  Invoke-Native kubectl @("--context", $context, "create", "namespace", $namespace)
  [IO.File]::WriteAllText(
    $jwtKeysFile,
    '{"primary":"xlb-tke-acceptance-jwt-secret"}',
    [Text.UTF8Encoding]::new($false)
  )
  Invoke-Native kubectl @(
    "--context", $context, "--namespace", $namespace, "create", "secret", "generic", "xlb-local-runtime-secrets",
    "--from-literal=mysql_password=xlb_acceptance_password",
    "--from-literal=mysql_tls_ca=",
    "--from-literal=redis_password=xlb_acceptance_redis_password",
    "--from-literal=redis_tls_ca=",
    "--from-literal=jwt_secret=xlb-tke-acceptance-jwt-secret",
    "--from-file=jwt_keys_json=$jwtKeysFile",
    "--from-literal=auth_phone_hash_secret=xlb-tke-acceptance-phone-hash",
    "--from-literal=auth_otp_pepper=xlb-tke-acceptance-otp-pepper",
    "--from-literal=cos_secret_id=",
    "--from-literal=cos_secret_key="
  )
  Remove-Item -LiteralPath $jwtKeysFile -Force

  $env:XLB_TKE_LOCAL_CONTEXT = $context
  & $entry -Action Deploy -Environment local -ValuesFile $valuesFile -KubeContext $context -Apply -Confirmation DEPLOY-XLB-LOCAL
  if ($LASTEXITCODE -ne 0) { throw "unified Deploy failed" }

  $runId = "acceptance-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  & $entry -Action Migrate -Environment local -ValuesFile $valuesFile -KubeContext $context -RunId $runId -BackupConfirmed -Apply -Confirmation MIGRATE-XLB-LOCAL
  if ($LASTEXITCODE -ne 0) { throw "unified Migrate failed" }
  $migrationJob = "$releaseName-xlb-migration-$runId"
  Invoke-Native kubectl @("--context", $context, "--namespace", $namespace, "wait", "--for=condition=complete", "job/$migrationJob", "--timeout=300s")
  $jobCount = (& kubectl --context $context --namespace $namespace get jobs -l app.kubernetes.io/component=migration -o 'jsonpath={.items[*].metadata.name}').Trim().Split(' ', [StringSplitOptions]::RemoveEmptyEntries).Count
  if ($jobCount -ne 1) { throw "expected exactly one migration Job, found $jobCount" }
  $configRef = (& kubectl --context $context --namespace $namespace get job $migrationJob -o 'jsonpath={.spec.template.spec.containers[0].envFrom[0].configMapRef.name}').Trim()
  if ($configRef -ne "$releaseName-xlb-backend") { throw "migration Job references unexpected ConfigMap $configRef" }
  $migrationCount = (& docker exec $mysqlContainer mysql -N -uxlb_acceptance -pxlb_acceptance_password xlb_tke_acceptance -e "SELECT COUNT(*) FROM schema_migrations;").Trim()
  if ($LASTEXITCODE -ne 0 -or [int]$migrationCount -lt 1) { throw "temporary database contains no migration history" }

  & $entry -Action Smoke -Environment local -KubeContext $context -Apply -Confirmation SMOKE-XLB-LOCAL
  if ($LASTEXITCODE -ne 0) { throw "unified Smoke failed" }

  Start-PortForward "$releaseName-xlb-backend" 13000 3000
  Start-PortForward "$releaseName-xlb-customer" 14173 4173
  Start-PortForward "$releaseName-xlb-worker" 14174 4173
  Start-PortForward "$releaseName-xlb-admin" 14175 4173
  Invoke-Native node @((Join-Path $PSScriptRoot "verify-runtime.mjs"))

  $backendPod = (& kubectl --context $context --namespace $namespace get pod -l app.kubernetes.io/component=backend -o 'jsonpath={.items[0].metadata.name}').Trim()
  $backendUid = (& kubectl --context $context --namespace $namespace get pod $backendPod -o 'jsonpath={.metadata.uid}').Trim()
  Invoke-Native kubectl @("--context", $context, "--namespace", $namespace, "delete", "pod", $backendPod, "--wait=false")
  Invoke-Native kubectl @("--context", $context, "--namespace", $namespace, "rollout", "status", "deployment/$releaseName-xlb-backend", "--timeout=180s")
  $replacementUid = (& kubectl --context $context --namespace $namespace get pod -l app.kubernetes.io/component=backend -o 'jsonpath={.items[0].metadata.uid}').Trim()
  if (-not $replacementUid -or $replacementUid -eq $backendUid) { throw "backend Pod restart did not produce a replacement UID" }
  Write-Host "tke-acceptance: Pod restart recovery passed"

  $toolOutput = @(& (Join-Path $repoRoot "deploy\tke\bootstrap-tools.ps1"))
  $helm = ($toolOutput[-1] | ConvertFrom-Json).helm
  Invoke-Native $helm @(
    "upgrade", $releaseName, $chart, "--namespace", $namespace, "--kube-context", $context,
    "-f", $valuesFile, "--set", "migration.enabled=false", "--set-string", "config.auth.otpLockSeconds=901",
    "--atomic", "--wait"
  )
  $upgradedValue = (& kubectl --context $context --namespace $namespace get configmap "$releaseName-xlb-backend" -o 'jsonpath={.data.AUTH_OTP_LOCK_SECONDS}').Trim()
  if ($upgradedValue -ne "901") { throw "rolling upgrade marker was not applied" }
  Invoke-Native kubectl @("--context", $context, "--namespace", $namespace, "rollout", "status", "deployment/$releaseName-xlb-backend", "--timeout=180s")
  Write-Host "tke-acceptance: rolling Helm upgrade passed"

  & $entry -Action Rollback -Environment local -KubeContext $context -Revision 1 -Apply -Confirmation ROLLBACK-XLB-LOCAL
  if ($LASTEXITCODE -ne 0) { throw "unified Rollback failed" }
  $rolledBackValue = (& kubectl --context $context --namespace $namespace get configmap "$releaseName-xlb-backend" -o 'jsonpath={.data.AUTH_OTP_LOCK_SECONDS}').Trim()
  if ($rolledBackValue -ne "900") { throw "Helm rollback did not restore revision 1" }
  & $entry -Action Smoke -Environment local -KubeContext $context -Apply -Confirmation SMOKE-XLB-LOCAL
  if ($LASTEXITCODE -ne 0) { throw "post-rollback Smoke failed" }
  Write-Host "tke-acceptance: Helm rollback passed"

  $completed = $true
  Write-Host "tke-acceptance: SUCCESS - local Kubernetes delivery line passed"
} finally {
  Remove-Item -LiteralPath $jwtKeysFile -Force -ErrorAction SilentlyContinue
  Remove-Item Env:XLB_TKE_LOCAL_CONTEXT -ErrorAction SilentlyContinue
  foreach ($process in $portForwards) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    $process.Dispose()
  }
  $portForwards.Clear()
  if ($completed -and -not $KeepResources) { Remove-AcceptanceResources }
  if ($previousContext -and $previousContext -ne $context) {
    & kubectl config use-context $previousContext | Out-Null
  }
  if (-not $completed) {
    Write-Warning "N6 failed; disposable resources were preserved for inspection. Run with -CleanupOnly after diagnosis."
  }
}
