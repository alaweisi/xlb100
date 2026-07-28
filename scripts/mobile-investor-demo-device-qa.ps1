[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactRoot,

    [Parameter(Mandatory = $true)]
    [string]$UiHelperRoot,

    [ValidateSet('Physical', 'Emulator', 'All')]
    [string]$TargetType = 'Physical',

    [string[]]$Serial,

    [ValidateRange(0, 16)]
    [int]$MinimumPhysicalDevices = 2,

    [string]$EvidenceRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Write-Json([string]$Path, $Value) {
    Write-Utf8NoBom $Path (($Value | ConvertTo-Json -Depth 10) + "`n")
}

function Resolve-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    ) | Where-Object { $_ }
    foreach ($candidate in $candidates) {
        try {
            $full = [System.IO.Path]::GetFullPath($candidate)
        } catch {
            continue
        }
        if (Test-Path -LiteralPath (Join-Path $full 'platform-tools\adb.exe') -PathType Leaf) {
            return $full
        }
    }
    throw 'Android SDK with platform-tools\adb.exe was not found.'
}

$androidSdk = Resolve-AndroidSdk
$adb = Join-Path $androidSdk 'platform-tools\adb.exe'
$python = (Get-Command python -ErrorAction Stop).Source
$uiPick = Join-Path $UiHelperRoot 'scripts\ui_pick.py'
$uiSummarize = Join-Path $UiHelperRoot 'scripts\ui_tree_summarize.py'
foreach ($helper in @($uiPick, $uiSummarize)) {
    if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
        throw "Required UI-tree helper is missing: $helper"
    }
}

$ArtifactRoot = [System.IO.Path]::GetFullPath($ArtifactRoot)
$manifestPath = Join-Path $ArtifactRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Investor Demo manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
if (
    $manifest.published -ne $false -or
    $manifest.apiOrigin -ne 'https://123.207.198.136' -or
    $manifest.sourceCommit -notmatch '^[0-9a-f]{40}$'
) {
    throw 'Investor Demo manifest does not satisfy the unpublished pinned-443 boundary.'
}

if (-not $EvidenceRoot) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $EvidenceRoot = Join-Path $ArtifactRoot "qa\$stamp-$($TargetType.ToLowerInvariant())"
}
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if (Test-Path -LiteralPath $EvidenceRoot) {
    throw "Evidence target already exists: $EvidenceRoot"
}
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null

function Invoke-AdbText {
    param(
        [string]$DeviceSerial,
        [string[]]$Arguments,
        [switch]$AllowFailure
    )
    $allArguments = New-Object System.Collections.Generic.List[string]
    if ($DeviceSerial) {
        $allArguments.Add('-s')
        $allArguments.Add($DeviceSerial)
    }
    foreach ($argument in $Arguments) {
        $allArguments.Add($argument)
    }
    $priorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $adb @allArguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorPreference
    }
    $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "adb command failed for $DeviceSerial (exit $exitCode): $($allArguments -join ' ')"
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Text = $text.Trim() }
}

function Capture-Screenshot([string]$DeviceSerial, [string]$Path) {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $adb
    $startInfo.Arguments = "-s `"$DeviceSerial`" exec-out screencap -p"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew)
    try {
        $process.StandardOutput.BaseStream.CopyTo($stream)
    } finally {
        $stream.Dispose()
    }
    $errorText = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "Screenshot capture failed for $DeviceSerial."
    }
}

function Save-UiTree {
    param(
        [string]$DeviceSerial,
        [string]$StepRoot
    )
    $dump = Invoke-AdbText $DeviceSerial @('exec-out', 'uiautomator', 'dump', '/dev/tty')
    $xmlText = $dump.Text
    $start = $xmlText.IndexOf('<?xml', [System.StringComparison]::Ordinal)
    if ($start -lt 0) {
        $start = $xmlText.IndexOf('<hierarchy', [System.StringComparison]::Ordinal)
    }
    $endTag = '</hierarchy>'
    $end = $xmlText.LastIndexOf($endTag, [System.StringComparison]::Ordinal)
    if ($start -lt 0 -or $end -lt $start) {
        throw "uiautomator did not return a hierarchy for $DeviceSerial."
    }
    $cleanXml = $xmlText.Substring($start, $end + $endTag.Length - $start)
    $xmlPath = "$StepRoot.xml"
    $summaryPath = "$StepRoot-summary.txt"
    Write-Utf8NoBom $xmlPath $cleanXml
    & $python -X utf8 $uiSummarize $xmlPath $summaryPath
    if ($LASTEXITCODE -ne 0) {
        throw "UI-tree summarization failed for $DeviceSerial."
    }
    Capture-Screenshot $DeviceSerial "$StepRoot.png"
    return [pscustomobject]@{
        XmlPath = $xmlPath
        SummaryPath = $summaryPath
        Text = $cleanXml
    }
}

function Invoke-TreeDerivedTap {
    param(
        [string]$DeviceSerial,
        [string]$TargetText,
        [string]$StepRoot
    )
    $tree = Save-UiTree $DeviceSerial $StepRoot
    $pick = & $python -X utf8 $uiPick $tree.XmlPath $TargetText 2>&1
    $pickExit = $LASTEXITCODE
    if ($pickExit -ne 0 -and $tree.Text -match 'scrollable="true"') {
        [xml]$parsed = $tree.Text
        $scrollable = $parsed.SelectSingleNode("//*[@scrollable='true']")
        if ($null -ne $scrollable -and $scrollable.bounds -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
            $x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
            $top = [int]$Matches[2]
            $bottom = [int]$Matches[4]
            $fromY = [Math]::Max($top + 100, $bottom - 120)
            $toY = [Math]::Min($bottom - 100, $top + 120)
            Invoke-AdbText $DeviceSerial @('shell', 'input', 'swipe', "$x", "$fromY", "$x", "$toY", '350') | Out-Null
            Start-Sleep -Milliseconds 500
            $tree = Save-UiTree $DeviceSerial "$StepRoot-scrolled"
            $pick = & $python -X utf8 $uiPick $tree.XmlPath $TargetText 2>&1
            $pickExit = $LASTEXITCODE
        }
    }
    $coordinateText = (($pick | ForEach-Object { $_.ToString() }) -join ' ').Trim()
    if ($pickExit -ne 0 -or $coordinateText -notmatch '^(\d+)\s+(\d+)$') {
        throw "UI-tree target was not found: $TargetText"
    }
    $x = $Matches[1]
    $y = $Matches[2]
    Invoke-AdbText $DeviceSerial @('shell', 'input', 'tap', $x, $y) | Out-Null
    return [pscustomobject]@{ X = [int]$x; Y = [int]$y; Source = $tree.XmlPath }
}

function Assert-UiContains([string]$UiText, [string]$Expected, [string]$Context) {
    if (-not $UiText.Contains($Expected)) {
        throw "$Context is missing expected UI text."
    }
}

function Sanitize-Log([string]$Text) {
    $sanitized = $Text -replace '(?i)Bearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]'
    $sanitized = $sanitized -replace '\b1[3-9]\d{9}\b', '[REDACTED_PHONE]'
    $sanitized = $sanitized -replace '(?i)(otp|验证码|verification[_ -]?code)([=: ]+)\d{4,8}', '$1$2[REDACTED_CODE]'
    return $sanitized
}

$deviceOutput = (Invoke-AdbText '' @('devices', '-l')).Text
$devices = @()
foreach ($line in ($deviceOutput -split "`r?`n")) {
    if ($line -notmatch '^(\S+)\s+device(?:\s|$)') {
        continue
    }
    $deviceSerial = $Matches[1]
    $qemu = (Invoke-AdbText $deviceSerial @('shell', 'getprop', 'ro.kernel.qemu')).Text
    $sdk = (Invoke-AdbText $deviceSerial @('shell', 'getprop', 'ro.build.version.sdk')).Text
    $model = (Invoke-AdbText $deviceSerial @('shell', 'getprop', 'ro.product.model')).Text
    $kind = if ($deviceSerial.StartsWith('emulator-') -or $qemu -eq '1') { 'Emulator' } else { 'Physical' }
    $devices += [pscustomobject]@{
        serial = $deviceSerial
        kind = $kind
        sdk = $sdk
        model = $model
    }
}
Write-Json (Join-Path $EvidenceRoot 'devices.json') ([ordered]@{
    capturedAt = (Get-Date).ToString('o')
    adbDevices = $deviceOutput
    devices = $devices
})

$selected = @($devices | Where-Object {
    ($TargetType -eq 'All' -or $_.kind -eq $TargetType) -and
    ((-not $Serial) -or $Serial -contains $_.serial)
})
if ($TargetType -eq 'Physical' -and $selected.Count -lt $MinimumPhysicalDevices) {
    Write-Utf8NoBom (Join-Path $EvidenceRoot 'DEVICE_UAT_BLOCKED.txt') (
        "DEVICE_UAT_BLOCKED: required $MinimumPhysicalDevices physical devices; found $($selected.Count).`n"
    )
    throw "DEVICE_UAT_BLOCKED: required $MinimumPhysicalDevices physical devices; found $($selected.Count)."
}
if ($selected.Count -eq 0) {
    throw "No matching Android devices are connected."
}

$expectedByRole = @{
    customer = @{ Login = '手机号登录'; AppName = '喜乐帮客户演示' }
    worker = @{ Login = '师傅端登录'; AppName = '喜乐帮师傅演示' }
    admin = @{ Login = '管理端演示登录'; AppName = '喜乐帮管理演示' }
}
$qaReports = @()

foreach ($device in $selected) {
    $deviceRoot = Join-Path $EvidenceRoot ($device.serial -replace '[^A-Za-z0-9._-]', '_')
    New-Item -ItemType Directory -Path $deviceRoot | Out-Null
    $originalAccessibilityEnabled = (
        Invoke-AdbText $device.serial @('shell', 'settings', 'get', 'secure', 'accessibility_enabled')
    ).Text
    $originalAccessibilityServices = (
        Invoke-AdbText $device.serial @(
            'shell', 'settings', 'get', 'secure', 'enabled_accessibility_services'
        )
    ).Text
    $accessibilityMenuService =
        'com.android.systemui.accessibility.accessibilitymenu/.AccessibilityMenuService'
    $accessibilityTemporarilyEnabled = $false
    try {
        $availableServices = (
            Invoke-AdbText $device.serial @(
                'shell', 'cmd', 'package', 'query-services', '--brief',
                '-a', 'android.accessibilityservice.AccessibilityService'
            ) -AllowFailure
        ).Text
        if (
            $availableServices.Contains($accessibilityMenuService) -and
            -not $originalAccessibilityServices.Contains($accessibilityMenuService)
        ) {
            $serviceList = if (
                $originalAccessibilityServices -and
                $originalAccessibilityServices -ne 'null'
            ) {
                "$originalAccessibilityServices`:$accessibilityMenuService"
            } else {
                $accessibilityMenuService
            }
            Invoke-AdbText $device.serial @(
                'shell', 'settings', 'put', 'secure',
                'enabled_accessibility_services', $serviceList
            ) | Out-Null
            Invoke-AdbText $device.serial @(
                'shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'
            ) | Out-Null
            $accessibilityTemporarilyEnabled = $true
            Start-Sleep -Seconds 1
        }

        Invoke-AdbText $device.serial @('shell', 'input', 'keyevent', '82') | Out-Null
        Invoke-AdbText $device.serial @('shell', 'wm', 'dismiss-keyguard') -AllowFailure | Out-Null
        Start-Sleep -Milliseconds 500
        $userState = (Invoke-AdbText $device.serial @('shell', 'dumpsys', 'user')).Text
        if ($userState -match 'RUNNING_LOCKED') {
            throw "Android user storage remains locked on $($device.serial)."
        }
        foreach ($app in $manifest.reports) {
        if (-not $expectedByRole.ContainsKey($app.role)) {
            throw "Unexpected Investor Demo role in manifest."
        }
        if (-not (Test-Path -LiteralPath $app.apkPath -PathType Leaf)) {
            throw "APK is missing: $($app.apkPath)"
        }
        $appRoot = Join-Path $deviceRoot $app.role
        New-Item -ItemType Directory -Path $appRoot | Out-Null
        Invoke-AdbText $device.serial @('uninstall', $app.appId) -AllowFailure | Out-Null
        Invoke-AdbText $device.serial @('install', $app.apkPath) | Out-Null
        Invoke-AdbText $device.serial @('logcat', '-c') | Out-Null

        $resolvedActivity = (Invoke-AdbText $device.serial @(
            'shell', 'cmd', 'package', 'resolve-activity', '--brief', $app.appId
        )).Text
        $activity = @($resolvedActivity -split "`r?`n" | Where-Object {
            $_ -match '^[A-Za-z0-9._]+/[A-Za-z0-9._$]+$'
        } | Select-Object -Last 1)
        if ($activity.Count -ne 1) {
            throw "Launch activity did not resolve for $($app.appId)."
        }
        $activity = $activity[0]
        Invoke-AdbText $device.serial @('shell', 'am', 'force-stop', $app.appId) | Out-Null
        Invoke-AdbText $device.serial @('shell', 'am', 'start', '-W', '-n', $activity) | Out-Null
        Start-Sleep -Seconds 2

        $initial = Save-UiTree $device.serial (Join-Path $appRoot '01-cold-start')
        Assert-UiContains $initial.Text $expectedByRole[$app.role].Login "$($app.role) login page"
        Assert-UiContains $initial.Text '仅供模拟演示' "$($app.role) demo declaration"
        $tapEvidence = Invoke-TreeDerivedTap $device.serial '应用信息' (Join-Path $appRoot '02-app-info-before-tap')
        Start-Sleep -Milliseconds 500
        $appInfo = Save-UiTree $device.serial (Join-Path $appRoot '03-app-info-expanded')
        Assert-UiContains $appInfo.Text $app.versionName "$($app.role) version"
        Assert-UiContains $appInfo.Text '腾讯云 Staging' "$($app.role) environment"
        Assert-UiContains $appInfo.Text $manifest.sourceCommit "$($app.role) source commit"

        Invoke-AdbText $device.serial @('shell', 'input', 'keyevent', '4') | Out-Null
        Start-Sleep -Milliseconds 500
        Invoke-AdbText $device.serial @('shell', 'am', 'start', '-W', '-n', $activity) | Out-Null
        $afterBack = Save-UiTree $device.serial (Join-Path $appRoot '04-after-back')
        Assert-UiContains $afterBack.Text $expectedByRole[$app.role].Login "$($app.role) after Back"

        Invoke-AdbText $device.serial @('shell', 'input', 'keyevent', '3') | Out-Null
        Start-Sleep -Milliseconds 500
        Invoke-AdbText $device.serial @('shell', 'am', 'start', '-W', '-n', $activity) | Out-Null
        $afterBackground = Save-UiTree $device.serial (Join-Path $appRoot '05-after-background')
        Assert-UiContains $afterBackground.Text $expectedByRole[$app.role].Login "$($app.role) after background"

        Invoke-AdbText $device.serial @('shell', 'am', 'force-stop', $app.appId) | Out-Null
        Invoke-AdbText $device.serial @('shell', 'am', 'start', '-W', '-n', $activity) | Out-Null
        Start-Sleep -Milliseconds 750
        $afterRestart = Save-UiTree $device.serial (Join-Path $appRoot '06-after-cold-restart')
        Assert-UiContains $afterRestart.Text $expectedByRole[$app.role].Login "$($app.role) after cold restart"

        $airplaneEnabled = $false
        try {
            $offlineResult = Invoke-AdbText $device.serial @(
                'shell', 'cmd', 'connectivity', 'airplane-mode', 'enable'
            ) -AllowFailure
            $airplaneEnabled = $offlineResult.ExitCode -eq 0
            Start-Sleep -Seconds 1
            $offline = Save-UiTree $device.serial (Join-Path $appRoot '07-offline')
            Assert-UiContains $offline.Text $expectedByRole[$app.role].Login "$($app.role) offline"
        } finally {
            if ($airplaneEnabled) {
                Invoke-AdbText $device.serial @(
                    'shell', 'cmd', 'connectivity', 'airplane-mode', 'disable'
                ) -AllowFailure | Out-Null
            }
        }
        Start-Sleep -Seconds 1
        Invoke-AdbText $device.serial @('shell', 'am', 'start', '-W', '-n', $activity) | Out-Null
        $reconnected = Save-UiTree $device.serial (Join-Path $appRoot '08-reconnected')
        Assert-UiContains $reconnected.Text $expectedByRole[$app.role].Login "$($app.role) after reconnect"

        $appProcessId = (
            Invoke-AdbText $device.serial @('shell', 'pidof', '-s', $app.appId) -AllowFailure
        ).Text
        $logcat = if ($appProcessId) {
            (
                Invoke-AdbText $device.serial @(
                    'logcat', '-d', '--pid', $appProcessId
                ) -AllowFailure
            ).Text
        } else {
            ''
        }
        $crashLog = (Invoke-AdbText $device.serial @('logcat', '-b', 'crash', '-d') -AllowFailure).Text
        $relevantCrash = (($crashLog -split "`r?`n") | Where-Object {
            $_ -match [regex]::Escape($app.appId)
        }) -join "`n"
        Write-Utf8NoBom (Join-Path $appRoot 'logcat-sanitized.txt') (Sanitize-Log $logcat)
        Write-Utf8NoBom (Join-Path $appRoot 'crash-buffer-sanitized.txt') (Sanitize-Log $relevantCrash)

        $sensitiveCounts = [ordered]@{
            bearer = ([regex]::Matches($logcat, '(?i)Bearer\s+[A-Za-z0-9._~+/=-]+')).Count
            fullPhone = ([regex]::Matches($logcat, '\b1[3-9]\d{9}\b')).Count
            otp = ([regex]::Matches(
                $logcat,
                '(?i)(?:otp|验证码|verification[_ -]?code)[=: ]+\d{4,8}'
            )).Count
        }
        $runtimeChecks = [ordered]@{
            crashLines = if ($relevantCrash) { ($relevantCrash -split "`r?`n").Count } else { 0 }
            anrLines = ([regex]::Matches($logcat, "(?i)ANR in\s+$([regex]::Escape($app.appId))|Input dispatching timed out")).Count
            cleartextViolations = ([regex]::Matches($logcat, '(?i)Cleartext traffic|CLEARTEXT communication')).Count
            tlsFailures = ([regex]::Matches($logcat, '(?i)SSLHandshakeException|CERTIFICATE_VERIFY_FAILED|Trust anchor')).Count
            sensitiveLogMatches = $sensitiveCounts
        }
        Write-Json (Join-Path $appRoot 'runtime-checks.json') $runtimeChecks
        if (
            $runtimeChecks.crashLines -gt 0 -or
            $runtimeChecks.anrLines -gt 0 -or
            $runtimeChecks.cleartextViolations -gt 0 -or
            $sensitiveCounts.bearer -gt 0 -or
            $sensitiveCounts.fullPhone -gt 0 -or
            $sensitiveCounts.otp -gt 0
        ) {
            throw "Runtime safety checks failed for $($app.role) on $($device.serial)."
        }

            $qaReports += [pscustomobject]@{
            serial = $device.serial
            kind = $device.kind
            sdk = $device.sdk
            role = $app.role
            appId = $app.appId
            cleanInstall = 'PASS'
            coldStart = 'PASS'
            loginPage = 'PASS'
            demoDeclaration = 'PASS'
            appInformation = 'PASS'
            back = 'PASS'
            backgroundAndRestart = 'PASS'
            offlineAndReconnect = if ($airplaneEnabled) { 'PASS' } else { 'HOLD_DEVICE_COMMAND_UNAVAILABLE' }
            logoutAndAuthenticatedSessionCleanup = 'HOLD_HTTPS_443_LOGIN_UNAVAILABLE'
            appInfoTap = $tapEvidence
            runtimeChecks = $runtimeChecks
                uiTreeAccessibilityTemporarilyEnabled = $accessibilityTemporarilyEnabled
                evidenceRoot = $appRoot
            }
        }
    } finally {
        if ($accessibilityTemporarilyEnabled) {
            if (
                $originalAccessibilityServices -and
                $originalAccessibilityServices -ne 'null'
            ) {
                Invoke-AdbText $device.serial @(
                    'shell', 'settings', 'put', 'secure',
                    'enabled_accessibility_services', $originalAccessibilityServices
                ) -AllowFailure | Out-Null
            } else {
                Invoke-AdbText $device.serial @(
                    'shell', 'settings', 'delete', 'secure',
                    'enabled_accessibility_services'
                ) -AllowFailure | Out-Null
            }
            if (
                $originalAccessibilityEnabled -and
                $originalAccessibilityEnabled -ne 'null'
            ) {
                Invoke-AdbText $device.serial @(
                    'shell', 'settings', 'put', 'secure',
                    'accessibility_enabled', $originalAccessibilityEnabled
                ) -AllowFailure | Out-Null
            } else {
                Invoke-AdbText $device.serial @(
                    'shell', 'settings', 'delete', 'secure', 'accessibility_enabled'
                ) -AllowFailure | Out-Null
            }
        }
    }
}

$finalReport = [ordered]@{
    completedAt = (Get-Date).ToString('o')
    sourceCommit = $manifest.sourceCommit
    apiOrigin = $manifest.apiOrigin
    published = $manifest.published
    targetType = $TargetType
    selectedDevices = $selected
    reports = $qaReports
}
Write-Json (Join-Path $EvidenceRoot 'qa-report.json') $finalReport
Write-Output "INVESTOR_DEMO_QA_EVIDENCE=$EvidenceRoot"
