$ErrorActionPreference = "Stop"

function Get-XlbPhaseTableEntry {
  param(
    [Parameter(Mandatory = $true)][string]$CurrentStateText,
    [Parameter(Mandatory = $true)][string]$PhaseId
  )

  $escapedPhaseId = [regex]::Escape($PhaseId)
  $pattern = "(?m)^\|\s*(?<id>$escapedPhaseId)\s*\|\s*(?<status>[^|]+?)\s*\|\s*(?<tag>[^|]+?)\s*\|\s*(?<summary>[^|]+?)\s*\|\s*$"
  $matches = [regex]::Matches($CurrentStateText, $pattern)
  if ($matches.Count -ne 1) {
    throw "CURRENT_STATE must contain exactly one $PhaseId table row; found $($matches.Count)"
  }

  return [pscustomobject]@{
    Id = $matches[0].Groups['id'].Value.Trim()
    Status = $matches[0].Groups['status'].Value.Trim()
    Tag = $matches[0].Groups['tag'].Value.Trim()
    Summary = $matches[0].Groups['summary'].Value.Trim()
  }
}

function Assert-XlbPhaseStatusIn {
  param(
    [Parameter(Mandatory = $true)]$Entry,
    [Parameter(Mandatory = $true)][string[]]$AllowedStatuses
  )

  foreach ($allowedStatus in $AllowedStatuses) {
    if ($Entry.Status.Equals($allowedStatus, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $Entry
    }
  }

  throw "$($Entry.Id) status is not allowed; actual status: $($Entry.Status); allowed: $($AllowedStatuses -join ', ')"
}

function Assert-XlbPhase14ProductionBlocked {
  param([Parameter(Mandatory = $true)][string]$CurrentStateText)

  $phase14 = Get-XlbPhaseTableEntry -CurrentStateText $CurrentStateText -PhaseId 'Phase 14'
  $legacyInProgress = $phase14.Status.Equals('IN PROGRESS', [System.StringComparison]::OrdinalIgnoreCase)
  $remediationLockedAndBlocked = $phase14.Status.Equals(
    'ENGINEERING REMEDIATION LOCKED / PRODUCTION BLOCKED',
    [System.StringComparison]::OrdinalIgnoreCase
  )

  if (-not ($legacyInProgress -or $remediationLockedAndBlocked)) {
    throw "Phase 14 must remain production-blocked; actual status: $($phase14.Status)"
  }

  $legacyNoGoEvidence = 'staging/production `NO-GO`'
  if ($legacyInProgress -and $CurrentStateText.IndexOf(
      $legacyNoGoEvidence,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -lt 0) {
    throw "Legacy Phase 14 IN PROGRESS state must retain exact $legacyNoGoEvidence evidence"
  }

  return $phase14
}
