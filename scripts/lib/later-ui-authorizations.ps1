$ErrorActionPreference = 'Stop'

if (-not (Get-Command Get-XlbPhaseTableEntry -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'current-state.ps1')
}

function Assert-ExactLaterUiAuthorizationPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (
    $Path -notmatch '^apps/(customer|worker)/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+\.(?:css|html|js|json|svg|ts|tsx|webmanifest)$' -or
    $Path.Contains('..') -or
    $Path.IndexOfAny([char[]]'*?[]{}') -ge 0 -or
    $Path.EndsWith('/') -or
    $Path.Contains('\')
  ) {
    throw "Later-UI authorization must be one exact Customer/Worker UI file path: $Path"
  }

  return $Path
}

function Get-LaterUiAuthorizationFiles {
  param(
    [Parameter(Mandatory = $true)][string]$RepositoryRoot,
    [Parameter(Mandatory = $true)][string]$CurrentStateText
  )

  $manifestPath = Join-Path $RepositoryRoot 'governance/phase11-later-ui-authorizations.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Later-UI authorization manifest is missing: $manifestPath"
  }

  try {
    $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
  } catch {
    throw "Later-UI authorization manifest is invalid JSON: $($_.Exception.Message)"
  }

  if ($manifest.schemaVersion -ne 1 -or $manifest.policy -ne 'phase11-later-ui-exact-file-authorization') {
    throw 'Later-UI authorization manifest schema or policy is unsupported'
  }

  $authorizations = @($manifest.authorizations)
  if ($authorizations.Count -eq 0) {
    throw 'Later-UI authorization manifest must contain at least one authorization'
  }

  $authorizationIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $authorizedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($authorization in $authorizations) {
    $authorizationId = [string]$authorization.authorizationId
    if ($authorizationId -notmatch '^[a-z0-9][a-z0-9-]{2,63}$' -or -not $authorizationIds.Add($authorizationId)) {
      throw "Later-UI authorization id is invalid or duplicated: $authorizationId"
    }
    if ($authorization.decision -ne 'human-approved' -or $authorization.scope -ne 'post-phase11-ui-only') {
      throw "Later-UI authorization must be human-approved and UI-only: $authorizationId"
    }

    $requiredPhaseStates = @($authorization.requiredPhaseStates)
    if ($requiredPhaseStates.Count -eq 0) {
      throw "Later-UI authorization has no phase-state requirements: $authorizationId"
    }
    foreach ($requirement in $requiredPhaseStates) {
      $entry = Get-XlbPhaseTableEntry -CurrentStateText $CurrentStateText -PhaseId ([string]$requirement.phaseId)
      if (
        -not $entry.Status.Equals([string]$requirement.status, [System.StringComparison]::Ordinal) -or
        -not $entry.Tag.Equals([string]$requirement.tag, [System.StringComparison]::Ordinal)
      ) {
        throw "Later-UI authorization phase evidence does not match CURRENT_STATE: $authorizationId / $($requirement.phaseId)"
      }
    }

    $files = @($authorization.files)
    if ($files.Count -eq 0 -or $files.Count -gt 16) {
      throw "Later-UI authorization must list 1-16 exact files: $authorizationId"
    }
    foreach ($file in $files) {
      $normalized = Assert-ExactLaterUiAuthorizationPath -Path ([string]$file)
      if (-not $authorizedFiles.Add($normalized)) {
        throw "Later-UI authorization file is duplicated: $normalized"
      }
    }
  }

  return @($authorizedFiles)
}
