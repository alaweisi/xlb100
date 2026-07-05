# Phase 12 gate: no export/download/generate file patterns in ANY changed
# backend/frontend files. Phase 12 is preparation-only; file generation
# is execution, not governance.
$ErrorActionPreference = "Stop"
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

# Allowed file patterns (docs/reports, tests, gate scripts themselves)
$allowedPatterns = @(
  '^docs/',
  '^docs\/reports/',
  '^tests/',
  '\.test\.ts$',
  '\.test\.tsx$',
  '\.spec\.ts$',
  '^scripts/'
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase12-no-export-generation: FAILED - git diff failed"
  exit 1
}

$violations = @()

foreach ($file in $changedFiles) {
  # Only scan source files
  if ($file -notmatch '\.(ts|tsx|sql|js|jsx)$') { continue }

  # Skip allowed patterns
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
    # Skip comment lines
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
