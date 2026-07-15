Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-SafeDatabaseIdentifier {
  param([Parameter(Mandatory)][string]$Value, [string]$Label = 'database')
  if ($Value -notmatch '^[A-Za-z][A-Za-z0-9_]{0,63}$') {
    throw "$Label must be a safe MySQL identifier"
  }
}

function Assert-SafeContainerName {
  param([Parameter(Mandatory)][string]$Value)
  if ($Value -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$') {
    throw 'container name is invalid'
  }
}

function Assert-DockerContainerRunning {
  param([Parameter(Mandatory)][string]$Container)
  Assert-SafeContainerName $Container
  $running = (& docker inspect --format '{{.State.Running}}' $Container 2>$null)
  if ($LASTEXITCODE -ne 0 -or "$running".Trim() -ne 'true') {
    throw "Docker container is not running: $Container"
  }
}

function Invoke-DockerText {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$MysqlPassword
  )
  $previousPassword = $env:MYSQL_PWD
  try {
    $env:MYSQL_PWD = $MysqlPassword
    $output = @(& docker @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "docker command failed: $($output -join [Environment]::NewLine)"
    }
    return ($output -join "`n").Trim()
  } finally {
    $env:MYSQL_PWD = $previousPassword
  }
}

function Invoke-DockerRedirect {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$MysqlPassword,
    [string]$StandardInputPath = '',
    [string]$StandardOutputPath = ''
  )
  $stderrPath = [IO.Path]::GetTempFileName()
  $previousPassword = $env:MYSQL_PWD
  try {
    $env:MYSQL_PWD = $MysqlPassword
    $start = @{
      FilePath = 'docker'
      ArgumentList = $Arguments
      NoNewWindow = $true
      PassThru = $true
      Wait = $true
      RedirectStandardError = $stderrPath
    }
    if ($StandardInputPath) { $start.RedirectStandardInput = $StandardInputPath }
    if ($StandardOutputPath) { $start.RedirectStandardOutput = $StandardOutputPath }
    $process = Start-Process @start
    if ($process.ExitCode -ne 0) {
      $stderr = Get-Content -Raw -ErrorAction SilentlyContinue -LiteralPath $stderrPath
      throw "docker command failed with exit code $($process.ExitCode): $stderr"
    }
  } finally {
    $env:MYSQL_PWD = $previousPassword
    Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $stderrPath
  }
}

function Invoke-MysqlScalar {
  param(
    [Parameter(Mandatory)][string]$Container,
    [Parameter(Mandatory)][string]$Database,
    [Parameter(Mandatory)][string]$User,
    [Parameter(Mandatory)][string]$Password,
    [Parameter(Mandatory)][string]$Sql
  )
  Assert-SafeDatabaseIdentifier $Database
  return Invoke-DockerText -MysqlPassword $Password -Arguments @(
    'exec', '-e', 'MYSQL_PWD', $Container,
    'mysql', '--batch', '--skip-column-names', "-u$User", $Database, '-e', $Sql
  )
}
