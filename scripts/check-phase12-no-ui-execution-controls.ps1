# Phase 12 gate: no enabled execution/payout/refund/download buttons
# in ANY admin UI file. Phase 12 is preparation-only; no UI controls
# for execution actions.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$adminDir = Join-Path $Root "apps\admin"

if (-not (Test-Path $adminDir)) {
  Write-Host "check-phase12-no-ui-execution-controls: passed (admin directory not found)"
  exit 0
}

# Scan all admin UI source files (not hardcoded to one file)
$uiFiles = Get-ChildItem -Path $adminDir -Include "*.tsx","*.ts","*.jsx","*.js" -Recurse -ErrorAction SilentlyContinue

if (-not $uiFiles -or $uiFiles.Count -eq 0) {
  Write-Host "check-phase12-no-ui-execution-controls: passed (no admin UI files found)"
  exit 0
}

# Button patterns for execution actions (non-disabled)
$forbiddenButtonPatterns = @(
  # <button>Execute</button> or <Button>Execute</Button> without disabled
  '<[Bb]utton\b[^>]*(?!\bdisabled\b)[^>]*>\s*(Execute|Payout|Refund|Reverse|Commit|Download|Export|Withdraw|Pay|Approve)\s*</[Bb]utton>',
  # Self-closing or fragment variants
  '<[Bb]utton\b[^>]*(?!\bdisabled\b)[^>]*title\s*=\s*["''](Execute|Payout|Refund|Reverse|Commit|Download|Export|Withdraw|Pay|Approve)',
  # onClick handlers with execution verbs
  'onClick\s*=\s*\{[^}]*\b(execute|payout|refund|reverse|commit|download|export|withdraw|payNow|pay_now|approveForExecution)\b',
  # Ant Design Button with danger/success + execution
  '<Button\b[^>]*(?!\bdisabled\b)[^>]*\b(execute|payout|refund|reverse|download|commit)\b'
)

$violations = @()

foreach ($file in $uiFiles) {
  $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  $lineNum = 0
  $lines = $content -split "`n"
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|/\*|\*|\s*\*|--)') { continue }

    foreach ($pat in $forbiddenButtonPatterns) {
      if ($trimmed -match $pat) {
        $relativePath = $file.FullName.Substring($Root.Length + 1)
        $violations += "$($relativePath):$lineNum`: $trimmed"
        break
      }
    }
  }
}

# Also check changed admin files specifically for execution-related text content
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -eq 0) {
  foreach ($file in $changedFiles) {
    if ($file -notmatch '^apps/admin/.*\.(tsx|ts|jsx)$') { continue }
    $fullPath = Join-Path $Root $file
    if (-not (Test-Path $fullPath)) { continue }

    $content = Get-Content -Path $fullPath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }

    # Check for action buttons with execution-related labels that aren't disabled
    $lineNum = 0
    $lines = $content -split "`n"
    foreach ($line in $lines) {
      $lineNum++
      $trimmed = $line.Trim()
      if ($trimmed -match '^\s*(//|/\*|\*|\s*\*|--)') { continue }

      # Catch buttons with execution-related text
      if (($trimmed -match '<[Bb]utton\b' -or $trimmed -match '<Button\b') -and
          $trimmed -notmatch '\bdisabled\b' -and
          $trimmed -match '\b(execute|payout|refund|reverse|commit|download|export|approve|pay)\b') {
        $violations += "$($file):$lineNum`: $trimmed"
      }
    }
  }
}

$violations = $violations | Select-Object -Unique

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-ui-execution-controls: FAILED - enabled execution controls found in admin UI"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-no-ui-execution-controls: passed"
