# Phase 12 gate: no export/download/generate file code in preparation/
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$preparationDir = Join-Path $Root "backend\src\preparation"
$forbiddenPatterns = @('\bexport\b.*\bfile\b','\bdownload\b','\bgenerate\b.*\bfile\b','\bwriteFile\b','\bcreateWriteStream\b','\bgenerateExport\b','\bgenerate_export\b','\bFileStream\b','\bFileWriter\b','\bBlob\b','\bcreateReadStream\b','\bopenSync\b','\bwriteFileSync\b','\bappendFile\b','\boutputFile\b')
$violations = @()
if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-no-export-generation: passed (preparation directory not yet created)"
  exit 0
}
$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
foreach ($file in $tsFiles) {
  $lines = Get-Content -Path $file.FullName; $lineNum = 0
  foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
    foreach ($pat in $forbiddenPatterns) { if ($trimmed -match $pat) { $violations += "$($file.Name):$lineNum`: $trimmed"; break } }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-no-export-generation: FAILED - export/download/generate file code found"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-export-generation: passed"
