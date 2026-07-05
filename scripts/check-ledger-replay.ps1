$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $Root "backend"
$Marker = "XLB_LEDGER_REPLAY_RESULT "
$RunnerPath = Join-Path $env:TEMP "xlb-ledger-replay-$([Guid]::NewGuid().ToString('N')).mts"

$runner = @'
import { pathToFileURL } from "node:url";

const backendRoot = process.env.XLB_REPLAY_BACKEND_ROOT;
if (!backendRoot) {
  throw new Error("XLB_REPLAY_BACKEND_ROOT is required");
}

const [{ SEEDED_CITY_CODES }, { closeMysqlPool }, { ledgerReplayValidator }] =
  await Promise.all([
    import("@xlb/config"),
    import(pathToFileURL(`${backendRoot}/src/dal/mysqlPool.ts`).href),
    import(pathToFileURL(`${backendRoot}/src/ledger/replay/replayValidator.ts`).href),
  ]);

const results = [];

try {
  for (const cityCode of SEEDED_CITY_CODES) {
    const result = await ledgerReplayValidator.validate({
      traceId: `ci-ledger-replay-${cityCode}`,
      appType: "admin",
      role: "auditor",
      cityCode,
      userId: "ci-preflight",
      requestStartedAt: new Date().toISOString(),
    });

    results.push({
      cityCode,
      match: result.match,
      diff: result.diff,
    });
  }

  console.log(
    "XLB_LEDGER_REPLAY_RESULT " +
      JSON.stringify({
        ok: results.every((result) => result.match !== false),
        results,
      }),
  );
} catch (error) {
  console.error(
    "XLB_LEDGER_REPLAY_ERROR " +
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
      }),
  );
  process.exitCode = 1;
} finally {
  await closeMysqlPool();
}
'@

Write-Host "check-ledger-replay: running full ledger replay comparison"

[System.IO.File]::WriteAllText($RunnerPath, $runner, [System.Text.UTF8Encoding]::new($false))

Push-Location $BackendRoot
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $env:XLB_REPLAY_BACKEND_ROOT = ($BackendRoot -replace "\\", "/")
  $output = & pnpm exec tsx --tsconfig=tsconfig.json $RunnerPath 2>&1
  $nodeExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
} finally {
  if ($previousErrorActionPreference) {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  Remove-Item -LiteralPath $RunnerPath -Force -ErrorAction SilentlyContinue
  Pop-Location
}

if ($nodeExitCode -ne 0) {
  $output | ForEach-Object { Write-Host $_ }
  Write-Host "check-ledger-replay: FAILED - replay validator execution failed"
  exit 1
}

$output |
  Where-Object { -not "$_".StartsWith($Marker) } |
  ForEach-Object { Write-Host $_ }

$resultLine = @($output | Where-Object { "$_".StartsWith($Marker) } | Select-Object -Last 1)
if ($resultLine.Count -eq 0) {
  Write-Host "check-ledger-replay: FAILED - replay validator did not emit a result"
  exit 1
}

$payload = ($resultLine[0].Substring($Marker.Length) | ConvertFrom-Json)
$failed = @($payload.results | Where-Object { $_.match -eq $false })

if ($failed.Count -gt 0) {
  Write-Host "check-ledger-replay: FAILED - ledger replay mismatch detected"
  foreach ($city in $failed) {
    $diff = @($city.diff)
    Write-Host "  city_code: $($city.cityCode), diff_count: $($diff.Count)"
    $diff |
      Select-Object -First 20 |
      ConvertTo-Json -Depth 10 |
      ForEach-Object { Write-Host "  $_" }
    if ($diff.Count -gt 20) {
      Write-Host "  ... $($diff.Count - 20) more diff item(s) omitted"
    }
  }
  exit 1
}

Write-Host "check-ledger-replay: passed"
