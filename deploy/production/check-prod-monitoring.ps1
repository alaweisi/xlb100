# Phase 14 production monitoring evidence helper.
# Safe by default: requires an explicit env file, refuses example env files, and
# prints read-only checks unless -RunDbChecks is provided.
param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,
  [switch]$DryRun,
  [switch]$RunDbChecks
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Fail([string]$Message) {
  Write-Host "check-prod-monitoring: FAILED - $Message"
  exit 1
}

function Resolve-RepoPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }
  return Join-Path $root $Path
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "required env file not found: $EnvFile"
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim()] = $parts[1].Trim()
    }
  }

  return $values
}

function Get-ConfigValue([string]$Name) {
  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if ($processValue) {
    return $processValue
  }
  return $envValues[$Name]
}

function Assert-NotPlaceholder([string]$Name, [string]$Value) {
  if (-not $Value) {
    Fail "missing required value: $Name"
  }
  if ($Value -match "REPLACE_WITH|placeholder|example\.invalid|change-me") {
    Fail "refusing placeholder value for $Name"
  }
}

function Invoke-MysqlReadOnly([string]$Name, [string]$Sql) {
  if ($Sql -notmatch "^\s*SELECT\s") {
    Fail "query is not read-only SELECT: $Name"
  }

  Write-Host "check-prod-monitoring: running read-only query - $Name"
  $previousMysqlPwd = [Environment]::GetEnvironmentVariable("MYSQL_PWD")
  try {
    [Environment]::SetEnvironmentVariable("MYSQL_PWD", $mysqlPassword, "Process")
    $mysqlArgs = @(
      "-h", $mysqlHost,
      "-P", $mysqlPort,
      "-u", $mysqlUser,
      "--batch",
      "--raw",
      $mysqlDatabase,
      "-e", $Sql
    )
    & mysql @mysqlArgs
    if ($LASTEXITCODE -ne 0) {
      Fail "mysql query failed: $Name"
    }
  } finally {
    [Environment]::SetEnvironmentVariable("MYSQL_PWD", $previousMysqlPwd, "Process")
  }
}

if (-not $EnvFile) {
  Fail "explicit -EnvFile is required"
}

$envPath = Resolve-RepoPath $EnvFile
$envLeaf = Split-Path -Leaf $envPath
if ($envLeaf -eq ".env.production.example" -or $EnvFile -like "*.example") {
  Fail "refusing example env file: $EnvFile"
}

$envValues = Read-EnvFile $envPath

$mysqlHost = Get-ConfigValue "MYSQL_HOST"
$mysqlPort = Get-ConfigValue "MYSQL_PORT"
$mysqlDatabase = Get-ConfigValue "MYSQL_DATABASE"
$mysqlUser = Get-ConfigValue "MYSQL_USER"
$mysqlPassword = Get-ConfigValue "MYSQL_PASSWORD"

Assert-NotPlaceholder "MYSQL_HOST" $mysqlHost
Assert-NotPlaceholder "MYSQL_PORT" $mysqlPort
Assert-NotPlaceholder "MYSQL_DATABASE" $mysqlDatabase
Assert-NotPlaceholder "MYSQL_USER" $mysqlUser
if ($RunDbChecks) {
  Assert-NotPlaceholder "MYSQL_PASSWORD" $mysqlPassword
}

$queries = @(
  @{
    Name = "duplicate refund.approved events";
    Expected = "zero rows";
    Sql = @"
SELECT city_code, aggregate_id AS refund_id, COUNT(*) AS event_count
  FROM event_outbox
 WHERE event_type = 'refund.approved'
 GROUP BY city_code, aggregate_id
HAVING COUNT(*) > 1;
"@
  },
  @{
    Name = "approved refund approval_event_id join gaps";
    Expected = "zero rows";
    Sql = @"
SELECT r.city_code, r.refund_id, r.status, r.approval_event_id,
       eo.event_id, eo.event_type, eo.aggregate_type, eo.aggregate_id, eo.status AS event_status
  FROM aftersale_refund_requests r
  LEFT JOIN event_outbox eo
    ON eo.city_code = r.city_code
   AND eo.event_id = r.approval_event_id
 WHERE r.status = 'approved'
   AND (
        r.approval_event_id IS NULL
        OR eo.event_id IS NULL
        OR eo.event_type <> 'refund.approved'
        OR eo.aggregate_type <> 'refund'
        OR eo.aggregate_id <> r.refund_id
   );
"@
  },
  @{
    Name = "duplicate ledger reversal rows";
    Expected = "zero rows";
    Sql = @"
SELECT city_code, source_type, source_id, account_type, direction, COUNT(*) AS entry_count
  FROM ledger_entries
 WHERE source_type = 'refund.approved'
 GROUP BY city_code, source_type, source_id, account_type, direction
HAVING COUNT(*) > 1;
"@
  },
  @{
    Name = "ledger reversal direction mismatches";
    Expected = "zero rows";
    Sql = @"
SELECT entry_id, city_code, source_id, account_type, direction, amount, currency, created_at
  FROM ledger_entries
 WHERE source_type = 'refund.approved'
   AND NOT (
        (account_type = 'customer' AND direction = 'credit')
        OR (account_type = 'platform' AND direction = 'debit')
        OR (account_type = 'worker' AND direction = 'debit')
   );
"@
  },
  @{
    Name = "refund.approved pending outbox age";
    Expected = "pending count and oldest age below approved threshold";
    Sql = @"
SELECT city_code,
       COUNT(*) AS pending_count,
       MIN(created_at) AS oldest_created_at,
       TIMESTAMPDIFF(MINUTE, MIN(created_at), UTC_TIMESTAMP()) AS oldest_pending_minutes
  FROM event_outbox
 WHERE event_type = 'refund.approved'
   AND status = 'pending'
 GROUP BY city_code;
"@
  },
  @{
    Name = "failed or unknown refund.approved handler status";
    Expected = "zero rows";
    Sql = @"
SELECT city_code, event_type, status, COUNT(*) AS event_count, MIN(created_at) AS oldest_created_at
  FROM event_outbox
 WHERE status = 'failed'
    OR (event_type = 'refund.approved' AND status NOT IN ('pending', 'published', 'failed'))
 GROUP BY city_code, event_type, status;
"@
  },
  @{
    Name = "missing reversal conflict_audit traces";
    Expected = "zero rows";
    Sql = @"
SELECT le.city_code, le.source_id, le.entry_id, le.account_type, le.direction
  FROM ledger_entries le
  LEFT JOIN event_outbox eo
    ON eo.city_code = le.city_code
   AND eo.event_type = 'conflict_audit'
   AND eo.aggregate_type = 'ledger_entry'
   AND eo.aggregate_id = le.entry_id
 WHERE le.source_type = 'refund.approved'
   AND eo.event_id IS NULL;
"@
  }
)

$logChecks = @(
  "Search production backend logs for LedgerReversalError during the release window.",
  "Search production backend logs for event_outbox status transitions to failed.",
  "Search release logs for check-ledger-replay and check-ledger-immutability output.",
  "Search production backend logs for conflict_audit write failures or stableHash mismatch messages.",
  "Attach alert notification test output for duplicate refund/reversal and event lag alerts."
)

Write-Host "check-prod-monitoring: env file accepted: $EnvFile"
Write-Host "check-prod-monitoring: target mysql host: $mysqlHost"
Write-Host "check-prod-monitoring: target mysql database: $mysqlDatabase"
Write-Host "check-prod-monitoring: no writes, migrations, deploys, or schema changes are performed"

if ($DryRun -or -not $RunDbChecks) {
  Write-Host "check-prod-monitoring: dry-run checklist"
  foreach ($query in $queries) {
    Write-Host ""
    Write-Host "## $($query.Name)"
    Write-Host "Expected: $($query.Expected)"
    Write-Host $query.Sql
  }
  Write-Host ""
  Write-Host "## Required log and alert evidence"
  foreach ($check in $logChecks) {
    Write-Host "- $check"
  }
  Write-Host ""
  Write-Host "check-prod-monitoring: use -RunDbChecks only from an authorized production shell or read replica"
  exit 0
}

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
  Fail "mysql client not found; install mysql client or run the printed queries through the approved production SQL console"
}

foreach ($query in $queries) {
  Invoke-MysqlReadOnly $query.Name $query.Sql
}

Write-Host "check-prod-monitoring: read-only checks completed; attach output as production evidence only after owner review"
