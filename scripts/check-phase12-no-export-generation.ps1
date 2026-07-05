# Phase 12 gate: no export/download/generate file patterns in ANY changed
# backend/frontend files. Phase 12 is preparation-only; file generation
# is execution, not governance.
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects export patterns
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-export.ts"
  @'
const url = download_url;
const f = generateExport();
'@ | Out-File -FilePath $fixtureFile -Encoding UTF8

  $forbiddenPatterns = @(
    '\bexport\b.*\bfile\b',
    '\bdownload\b',
    '\bgenerate\b.*\bfile\b',
    '\bgenerateExport\b',
    '\bgenerate_export\b',
    '\bwriteFile\b',
    '\bwriteFileSync\b',
    '\bcreateWriteStream\b',
    '\bcreateReadStream\b',
    '\bFileStream\b',
    '\bFileWriter\b',
    '\bBlob\b',
    '\bopenSync\b',
    '\bappendFile\b',
    '\boutputFile\b',
    '\bsaveAs\b',
    '\bdownloadFile\b',
    '\bexportFile\b',
    '\bexportToFile\b',
    '\bexportData\b',
    '\bstreamToFile\b'
  )

  $fixtureViolations = @()
  $lines = Get-Content $fixtureFile
  $lineNum = 0
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }
    foreach ($pat in $forbiddenPatterns) {
      if ($trimmed -match $pat) {
        $fixtureViolations += "$($fixtureFile):$lineNum`: $trimmed"
        break
      }
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-no-export-generation: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-no-export-generation: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenPatterns = @(
  '\bexport\b.*\bfile\b',
  '\bdownload\b',
  '\bgenerate\b.*\bfile\b',
  '\bgenerateExport\b',
  '\bgenerate_export\b',
  '\bwriteFile\b',
  '\bwriteFileSync\b',
  '\bcreateWriteStream\b',
  '\bcreateReadStream\b',
  '\bFileStream\b',
  '\bFileWriter\b',
  '\bBlob\b',
  '\bopenSync\b',
  '\bappendFile\b',
  '\boutputFile\b',
  '\bsaveAs\b',
  '\bdownloadFile\b',
  '\bexportFile\b',
  '\bexportToFile\b',
  '\bexportData\b',
  '\bstreamToFile\b'
)

# Only allowed: gate scripts themselves
$allowedPatterns = @(
  '^scripts/'
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase12-no-export-generation: FAILED - git diff failed"
  exit 1
}

$violations = @()

foreach ($file in $changedFiles) {
  if ($file -notmatch '\.(ts|tsx|sql|js|jsx)$') { continue }

  $isAllowed = $false
  foreach ($ap in $allowedPatterns) {
    if ($file -match $ap) { $isAllowed = $true; break }
  }
  if ($isAllowed) { continue }

  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }

  $lines = Get-Content -Path $fullPath -ErrorAction SilentlyContinue
  if (-not $lines) { continue }

  $lineNum = 0
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }
    foreach ($pat in $forbiddenPatterns) {
      if ($trimmed -match $pat) {
        $violations += "$($file):$lineNum`: $trimmed"
        break
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-export-generation: FAILED - export/download/generate file patterns found"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-no-export-generation: passed"
