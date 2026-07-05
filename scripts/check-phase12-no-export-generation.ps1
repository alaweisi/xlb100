$ErrorActionPreference = "Stop"
# self-test
$fixtureDir = Join-Path $env:TEMP ("p12-exp-" + [Guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $f = Join-Path $fixtureDir "bad.ts"
  "const x = download_url + generateExport();" | Out-File -FilePath $f -Encoding UTF8
  $c = Get-Content $f -Raw
  if ($c -match 'download_url|generateExport') { Write-Host "check-phase12-no-export-generation: self-test passed" }
  else { Write-Host "SELF-TEST FAILED"; exit 1 }
} finally { Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue }

# Normal
$Root = Split-Path -Parent $PSScriptRoot
$patterns = @('\bdownload_url\b','\bgenerateExport\b','\bgenerate_export\b','\bexportFile\b','\bdownloadFile\b','\bcreateWriteStream\b','\bwriteFileSync\b','\bwriteFile\b')
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
$vs = @()
foreach ($file in $changedFiles) {
  if ($file -match 'scripts/|tests/|docs/') { continue }
  if ($file -notmatch '\.(ts|tsx)$') { continue }
  $fp = Join-Path $Root $file; if (-not (Test-Path $fp)) { continue }
  $lines = Get-Content $fp; $n = 0
  foreach ($line in $lines) { $n++; $t = $line.Trim(); if ($t -match '^\s*(//|/\*|\*|--)') { continue }; foreach ($p in $patterns) { if ($t -match $p) { $vs += "$file`:$n`: $t"; break } } }
}
if ($vs.Count -gt 0) { Write-Host "FAILED"; $vs | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-export-generation: passed"
