function Test-CanonicalSuccessorMigrations {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Migrations,
    [Parameter(Mandatory = $true)]
    [string[]]$RequiredPrefix,
    [Parameter(Mandatory = $true)]
    [int]$MinimumTailNumber,
    [Parameter(Mandatory = $true)]
    [bool]$Authorized
  )

  if (-not $Authorized -or $Migrations.Count -lt $RequiredPrefix.Count) {
    return $false
  }

  $names = @($Migrations | ForEach-Object {
    if ($_ -is [string]) { $_ } else { $_.Name }
  } | Sort-Object)

  for ($index = 0; $index -lt $RequiredPrefix.Count; $index += 1) {
    if ($names[$index] -ne $RequiredPrefix[$index]) {
      return $false
    }
  }

  $previousNumber = [int]($RequiredPrefix[-1].Substring(0, 3))
  for ($index = $RequiredPrefix.Count; $index -lt $names.Count; $index += 1) {
    if ($names[$index] -notmatch '^(\d{3})_[a-z0-9_]+\.sql$') {
      return $false
    }
    $number = [int]$Matches[1]
    if ($number -lt $MinimumTailNumber -or $number -le $previousNumber) {
      return $false
    }
    $previousNumber = $number
  }

  return $true
}
