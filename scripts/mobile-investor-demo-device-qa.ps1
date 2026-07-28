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

    [string]$EvidenceRoot,

    [ValidateSet('DevelopmentProbe', 'FinalSeal')]
    [string]$Mode = 'FinalSeal',

    [switch]$RequireAuthenticatedFlow
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
$node = (Get-Command node -ErrorAction Stop).Source
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
    $manifest.sealed -ne $false -or
    $manifest.releaseDecision -ne 'INVESTOR_APK_HOLD' -or
    $manifest.apiOrigin -ne 'https://123.207.198.136' -or
    $manifest.sourceCommit -notmatch '^[0-9a-f]{40}$' -or
    $null -eq $manifest.sessionTtlSeconds -or
    [int]$manifest.sessionTtlSeconds -lt 1 -or
    [int]$manifest.sessionTtlSeconds -gt 1800
) {
    throw 'Investor Demo manifest is not an unpublished HOLD candidate with a short session TTL.'
}

# This complete trust preflight intentionally runs before the script can issue
# any adb uninstall/install command.
$artifactTrustScript = Join-Path $PSScriptRoot 'mobile-investor-demo-artifact-trust.mjs'
$trustOutput = & $node $artifactTrustScript --artifact-root $ArtifactRoot --android-sdk $androidSdk 2>&1
if ($LASTEXITCODE -ne 0) {
    throw 'Investor Demo artifact trust preflight failed before device mutation.'
}
$trustedArtifact = (($trustOutput | ForEach-Object { $_.ToString() }) -join "`n") |
    ConvertFrom-Json
$manifest.reports = $trustedArtifact.reports

if (-not $EvidenceRoot) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $EvidenceRoot = Join-Path $ArtifactRoot "qa\$stamp-$($TargetType.ToLowerInvariant())"
}
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)
if (
    $Mode -eq 'FinalSeal' -and
    -not (
        $EvidenceRoot.Equals($ArtifactRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        $EvidenceRoot.StartsWith(
            $ArtifactRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase
        )
    )
) {
    throw 'FinalSeal evidence must be written inside the verified ArtifactRoot.'
}
if (Test-Path -LiteralPath $EvidenceRoot) {
    throw "Evidence target already exists: $EvidenceRoot"
}
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$qaIndexPath = Join-Path $ArtifactRoot 'qa\qa-index.json'
if ($Mode -eq 'FinalSeal' -and (Test-Path -LiteralPath $qaIndexPath)) {
    throw "FinalSeal QA index already exists and will not be overwritten: $qaIndexPath"
}

$requireAuthenticated = $RequireAuthenticatedFlow.IsPresent -or $Mode -eq 'FinalSeal'
$network443 = [ordered]@{
    capturedAt = (Get-Date).ToString('o')
    apiOrigin = $manifest.apiOrigin
    host = '123.207.198.136'
    port = 443
    tcpConnected = $false
    status = 'HOLD'
}
$tcpClient = New-Object System.Net.Sockets.TcpClient
try {
    $connect = $tcpClient.ConnectAsync($network443.host, 443)
    if ($connect.Wait(5000) -and $tcpClient.Connected) {
        $network443.tcpConnected = $true
        $network443.status = 'PASS'
    }
} finally {
    $tcpClient.Dispose()
}
Write-Json (Join-Path $EvidenceRoot 'network-443.json') $network443
if ($network443.status -ne 'PASS' -and $Mode -eq 'FinalSeal') {
    Write-Utf8NoBom (Join-Path $EvidenceRoot 'HTTPS_443_HOLD.txt') (
        "INVESTOR_APK_HOLD: Tencent Staging HTTPS 443 is not reachable.`n"
    )
    throw 'INVESTOR_APK_HOLD: FinalSeal requires reachable Tencent Staging HTTPS 443.'
}

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

function Get-RawUiTreeText([string]$DeviceSerial) {
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
    return $xmlText.Substring($start, $end + $endTag.Length - $start)
}

function Get-NodeCenter($Node) {
    if ($null -eq $Node -or $Node.bounds -notmatch '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
        throw 'UI-tree node does not expose usable bounds.'
    }
    return [pscustomobject]@{
        X = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
        Y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
    }
}

function Invoke-SensitiveAdbInput([string]$DeviceSerial, [string]$Value) {
    $priorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $null = & $adb -s $DeviceSerial shell input text $Value 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorPreference
    }
    if ($exitCode -ne 0) {
        throw "Sensitive UI input failed for $DeviceSerial."
    }
}

function Set-TreeDerivedInput {
    param(
        [string]$DeviceSerial,
        [string]$Value,
        [switch]$Sensitive
    )
    [xml]$parsed = Get-RawUiTreeText $DeviceSerial
    $editableNodes = @($parsed.SelectNodes("//*[@class='android.widget.EditText']"))
    if ($editableNodes.Count -eq 0) {
        throw 'UI tree does not contain an editable field.'
    }
    $center = Get-NodeCenter $editableNodes[$editableNodes.Count - 1]
    Invoke-AdbText $DeviceSerial @('shell', 'input', 'tap', "$($center.X)", "$($center.Y)") | Out-Null
    for ($index = 0; $index -lt 64; $index += 1) {
        Invoke-AdbText $DeviceSerial @('shell', 'input', 'keyevent', '67') | Out-Null
    }
    if ($Sensitive) {
        Invoke-SensitiveAdbInput $DeviceSerial $Value
    } else {
        Invoke-AdbText $DeviceSerial @('shell', 'input', 'text', $Value) | Out-Null
    }
}

function Invoke-SensitiveTreeTap {
    param(
        [string]$DeviceSerial,
        [string]$TargetText
    )
    [xml]$parsed = Get-RawUiTreeText $DeviceSerial
    $target = @($parsed.SelectNodes('//*') | Where-Object {
        $_.text -eq $TargetText -or $_.'content-desc' -eq $TargetText
    } | Select-Object -First 1)
    if ($target.Count -ne 1) {
        throw "Sensitive UI-tree target was not found."
    }
    $center = Get-NodeCenter $target[0]
    Invoke-AdbText $DeviceSerial @(
        'shell', 'input', 'tap', "$($center.X)", "$($center.Y)"
    ) | Out-Null
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

function Invoke-TreeDerivedTapNearText {
    param(
        [string]$DeviceSerial,
        [string]$AnchorText,
        [string]$TargetText,
        [string]$StepRoot
    )
    $tree = Save-UiTree $DeviceSerial $StepRoot
    [xml]$parsed = $tree.Text
    $nodes = @($parsed.SelectNodes('//*'))
    $anchor = @($nodes | Where-Object {
        $_.text -eq $AnchorText -or $_.'content-desc' -eq $AnchorText
    } | Select-Object -First 1)
    $targets = @($nodes | Where-Object {
        $_.text -eq $TargetText -or $_.'content-desc' -eq $TargetText
    })
    if ($anchor.Count -ne 1 -or $targets.Count -eq 0) {
        throw "UI-tree anchored target was not found: $TargetText"
    }
    $anchorCenter = Get-NodeCenter $anchor[0]
    $nearest = $targets | Sort-Object {
        $center = Get-NodeCenter $_
        [Math]::Abs($center.Y - $anchorCenter.Y)
    } | Select-Object -First 1
    $targetCenter = Get-NodeCenter $nearest
    Invoke-AdbText $DeviceSerial @(
        'shell', 'input', 'tap', "$($targetCenter.X)", "$($targetCenter.Y)"
    ) | Out-Null
}

function Start-VerifiedApp {
    param(
        [string]$DeviceSerial,
        [string]$AppId,
        [string]$Activity
    )
    Invoke-AdbText $DeviceSerial @('shell', 'am', 'start', '-W', '-n', $Activity) | Out-Null
    Start-Sleep -Milliseconds 750
}

function Invoke-RoleLogin {
    param(
        [string]$DeviceSerial,
        [string]$Role,
        [string]$AppId,
        [string]$Activity,
        [string]$LoginTitle,
        [string]$LoginButton,
        [string]$EvidencePath
    )
    Start-VerifiedApp $DeviceSerial $AppId $Activity
    Invoke-TreeDerivedTap $DeviceSerial '获取验证码' "$EvidencePath-request-code" | Out-Null
    Start-Sleep -Milliseconds 750
    $sensitiveTree = Get-RawUiTreeText $DeviceSerial
    $codeMatch = [regex]::Match($sensitiveTree, 'Staging 演示验证码：(\d{6})')
    if (-not $codeMatch.Success) {
        throw "$Role staging demo code was not returned in the UI."
    }
    $stagingDemoCode = $codeMatch.Groups[1].Value
    Set-TreeDerivedInput $DeviceSerial $stagingDemoCode -Sensitive
    Invoke-SensitiveTreeTap $DeviceSerial $LoginButton
    $stagingDemoCode = $null
    $sensitiveTree = $null
    Start-Sleep -Seconds 2
    $loggedIn = Save-UiTree $DeviceSerial "$EvidencePath-logged-in"
    if ($loggedIn.Text.Contains($LoginTitle)) {
        throw "$Role authenticated login did not leave the login page."
    }
    return 'PASS'
}

function Invoke-AuthenticatedBusinessChain {
    param(
        [string]$DeviceSerial,
        [hashtable]$Apps,
        [string]$DeviceRoot
    )
    foreach ($role in @('customer', 'admin', 'worker')) {
        $login = @{
            customer = @{ Title = '手机号登录'; Button = '登录用户端' }
            worker = @{ Title = '师傅端登录'; Button = '登录师傅端' }
            admin = @{ Title = '管理端演示登录'; Button = '安全登录' }
        }[$role]
        Invoke-RoleLogin -DeviceSerial $DeviceSerial -Role $role `
            -AppId $Apps[$role].AppId -Activity $Apps[$role].Activity `
            -LoginTitle $login.Title -LoginButton $login.Button `
            -EvidencePath (Join-Path $DeviceRoot "authenticated-$role") | Out-Null
    }

    Start-VerifiedApp $DeviceSerial $Apps.customer.AppId $Apps.customer.Activity
    Invoke-TreeDerivedTap $DeviceSerial '下单' (Join-Path $DeviceRoot 'chain-01-customer-order-nav') | Out-Null
    Start-Sleep -Seconds 2
    Invoke-TreeDerivedTap $DeviceSerial 'Submit order' (Join-Path $DeviceRoot 'chain-02-customer-submit') | Out-Null
    Start-Sleep -Seconds 2
    $created = Save-UiTree $DeviceSerial (Join-Path $DeviceRoot 'chain-03-customer-created')
    $orderMatch = [regex]::Match($created.Text, 'order created\s+([A-Za-z0-9._:-]{8,64})')
    if (-not $orderMatch.Success) {
        throw 'Customer chain did not expose the created order ID.'
    }
    $orderId = $orderMatch.Groups[1].Value

    Start-VerifiedApp $DeviceSerial $Apps.admin.AppId $Apps.admin.Activity
    Invoke-TreeDerivedTap $DeviceSerial '智能派单' (Join-Path $DeviceRoot 'chain-04-admin-dispatch-nav') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTap $DeviceSerial '为待处理订单匹配师傅' (Join-Path $DeviceRoot 'chain-05-admin-match') | Out-Null
    Start-Sleep -Seconds 2

    Start-VerifiedApp $DeviceSerial $Apps.worker.AppId $Apps.worker.Activity
    Invoke-TreeDerivedTap $DeviceSerial '刷新' (Join-Path $DeviceRoot 'chain-06-worker-refresh-pool') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTapNearText $DeviceSerial $orderId '接单' (Join-Path $DeviceRoot 'chain-07-worker-accept') | Out-Null
    Start-Sleep -Seconds 2
    Invoke-TreeDerivedTap $DeviceSerial '服务单' (Join-Path $DeviceRoot 'chain-08-worker-fulfillments') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTap $DeviceSerial '刷新' (Join-Path $DeviceRoot 'chain-09-worker-refresh-fulfillment') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTapNearText $DeviceSerial $orderId '查看详情' (Join-Path $DeviceRoot 'chain-10-worker-detail') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTap $DeviceSerial '开始服务' (Join-Path $DeviceRoot 'chain-11-worker-start') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTap $DeviceSerial '完成服务' (Join-Path $DeviceRoot 'chain-12-worker-complete') | Out-Null
    Start-Sleep -Seconds 2

    Start-VerifiedApp $DeviceSerial $Apps.customer.AppId $Apps.customer.Activity
    Invoke-TreeDerivedTap $DeviceSerial '订单' (Join-Path $DeviceRoot 'chain-13-customer-orders') | Out-Null
    Start-Sleep -Seconds 2
    Invoke-TreeDerivedTap $DeviceSerial 'Confirm service' (Join-Path $DeviceRoot 'chain-14-customer-confirm') | Out-Null
    Start-Sleep -Seconds 1
    Invoke-TreeDerivedTap $DeviceSerial 'Prepare payment' (Join-Path $DeviceRoot 'chain-15-customer-payment') | Out-Null
    Start-Sleep -Seconds 2
    Set-TreeDerivedInput $DeviceSerial 'investor-demo-service-ok'
    Invoke-TreeDerivedTap $DeviceSerial 'Submit review' (Join-Path $DeviceRoot 'chain-16-customer-review') | Out-Null
    Start-Sleep -Seconds 2

    Start-VerifiedApp $DeviceSerial $Apps.admin.AppId $Apps.admin.Activity
    Invoke-TreeDerivedTap $DeviceSerial '订单全链路' (Join-Path $DeviceRoot 'chain-17-admin-trace-nav') | Out-Null
    Start-Sleep -Seconds 1
    Set-TreeDerivedInput $DeviceSerial $orderId
    Invoke-TreeDerivedTap $DeviceSerial '查看订单' (Join-Path $DeviceRoot 'chain-18-admin-trace-submit') | Out-Null
    Start-Sleep -Seconds 2
    $finalTrace = Save-UiTree $DeviceSerial (Join-Path $DeviceRoot 'chain-19-admin-final-trace')
    Assert-UiContains $finalTrace.Text $orderId 'Admin final order trace'

    $logout = @{
        customer = @{ Nav = '我的'; Button = '退出登录并清除本机演示数据'; Login = '手机号登录' }
        worker = @{ Nav = '服务单'; Button = '退出并清除数据'; Login = '师傅端登录' }
        admin = @{ Nav = '智能派单'; Button = '退出并清除演示数据'; Login = '管理端演示登录' }
    }
    foreach ($role in @('customer', 'worker', 'admin')) {
        Start-VerifiedApp $DeviceSerial $Apps[$role].AppId $Apps[$role].Activity
        Invoke-TreeDerivedTap $DeviceSerial $logout[$role].Nav (Join-Path $DeviceRoot "logout-$role-nav") | Out-Null
        Invoke-TreeDerivedTap $DeviceSerial $logout[$role].Button (Join-Path $DeviceRoot "logout-$role-action") | Out-Null
        Start-Sleep -Milliseconds 750
        $loggedOut = Save-UiTree $DeviceSerial (Join-Path $DeviceRoot "logout-$role-complete")
        Assert-UiContains $loggedOut.Text $logout[$role].Login "$role logout"
    }

    return [pscustomobject]@{
        status = 'PASS'
        login = 'PASS'
        logout = 'PASS'
        shortTtlVerification = 'PASS'
        fixedBusinessChain = 'PASS'
        orderId = $orderId
    }
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
    $installedApps = @{}
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
        $installedApps[$app.role] = [pscustomobject]@{
            AppId = $app.appId
            Activity = $activity
        }
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
            $runtimeChecks.tlsFailures -gt 0 -or
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
                status = 'PASS'
                uiTreeAccessibilityTemporarilyEnabled = $accessibilityTemporarilyEnabled
                evidenceRoot = $appRoot
                evidenceFiles = @(
                    Get-ChildItem -LiteralPath $appRoot -File | ForEach-Object {
                        $_.FullName.Substring($ArtifactRoot.Length).TrimStart('\', '/').Replace('\', '/')
                    }
                )
            }
        }
        $authenticatedFlow = if ($requireAuthenticated) {
            Invoke-AuthenticatedBusinessChain $device.serial $installedApps $deviceRoot
        } else {
            [pscustomobject]@{
                status = 'HOLD_DEVELOPMENT_PROBE'
                login = 'HOLD'
                logout = 'HOLD'
                shortTtlVerification = 'PASS'
                fixedBusinessChain = 'HOLD'
                orderId = $null
            }
        }

        foreach ($role in @('customer', 'worker', 'admin')) {
            $app = $installedApps[$role]
            $appProcessIdAfterAuth = (Invoke-AdbText $device.serial @(
                'shell', 'pidof', '-s', $app.AppId
            ) -AllowFailure).Text
            $postLogcat = if ($appProcessIdAfterAuth) {
                (Invoke-AdbText $device.serial @(
                    'logcat', '-d', '--pid', $appProcessIdAfterAuth
                ) -AllowFailure).Text
            } else {
                ''
            }
            $postCrash = (Invoke-AdbText $device.serial @(
                'logcat', '-b', 'crash', '-d'
            ) -AllowFailure).Text
            $postRelevantCrash = (($postCrash -split "`r?`n") | Where-Object {
                $_ -match [regex]::Escape($app.AppId)
            }) -join "`n"
            $postSensitive = [ordered]@{
                bearer = ([regex]::Matches($postLogcat, '(?i)Bearer\s+[A-Za-z0-9._~+/=-]+')).Count
                fullPhone = ([regex]::Matches($postLogcat, '\b1[3-9]\d{9}\b')).Count
                otp = ([regex]::Matches(
                    $postLogcat,
                    '(?i)(?:otp|验证码|verification[_ -]?code)[=: ]+\d{4,8}'
                )).Count
            }
            $postChecks = [ordered]@{
                crashLines = if ($postRelevantCrash) { ($postRelevantCrash -split "`r?`n").Count } else { 0 }
                anrLines = ([regex]::Matches($postLogcat, "(?i)ANR in\s+$([regex]::Escape($app.AppId))|Input dispatching timed out")).Count
                cleartextViolations = ([regex]::Matches($postLogcat, '(?i)Cleartext traffic|CLEARTEXT communication')).Count
                tlsFailures = ([regex]::Matches($postLogcat, '(?i)SSLHandshakeException|CERTIFICATE_VERIFY_FAILED|Trust anchor')).Count
                sensitiveLogMatches = $postSensitive
            }
            $authLogPath = Join-Path $deviceRoot "authenticated-$role-logcat-sanitized.txt"
            Write-Utf8NoBom $authLogPath (Sanitize-Log $postLogcat)
            Write-Json (Join-Path $deviceRoot "authenticated-$role-runtime-checks.json") $postChecks
            if (
                $postChecks.crashLines -gt 0 -or
                $postChecks.anrLines -gt 0 -or
                $postChecks.cleartextViolations -gt 0 -or
                $postChecks.tlsFailures -gt 0 -or
                $postSensitive.bearer -gt 0 -or
                $postSensitive.fullPhone -gt 0 -or
                $postSensitive.otp -gt 0
            ) {
                throw "Authenticated runtime safety checks failed for $role on $($device.serial)."
            }
            $report = @($qaReports | Where-Object {
                $_.serial -eq $device.serial -and $_.role -eq $role
            } | Select-Object -Last 1)[0]
            $report | Add-Member -NotePropertyName authenticatedFlow -NotePropertyValue $authenticatedFlow -Force
            $report | Add-Member -NotePropertyName postAuthenticatedRuntimeChecks -NotePropertyValue $postChecks -Force
            $report.logoutAndAuthenticatedSessionCleanup = if (
                $authenticatedFlow.logout -eq 'PASS'
            ) { 'PASS' } else { 'HOLD' }
            $report.evidenceFiles += @(
                $authLogPath.Substring($ArtifactRoot.Length).TrimStart('\', '/').Replace('\', '/')
            )
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
    status = if ($Mode -eq 'FinalSeal') { 'PASS' } else { 'HOLD_DEVELOPMENT_PROBE' }
    mode = $Mode
    sourceCommit = $manifest.sourceCommit
    apiOrigin = $manifest.apiOrigin
    published = $manifest.published
    targetType = $TargetType
    selectedDevices = $selected
    reports = $qaReports
}
Write-Json (Join-Path $EvidenceRoot 'qa-report.json') $finalReport
$physicalPassed = @($selected | Where-Object { $_.kind -eq 'Physical' }).Count
$authenticatedPassed = @($selected | Where-Object {
    $serialToCheck = $_.serial
    @($qaReports | Where-Object {
        $_.serial -eq $serialToCheck -and
        $_.authenticatedFlow.status -eq 'PASS'
    }).Count -eq 3
}).Count
$qaIndex = [ordered]@{
    status = if (
        $Mode -eq 'FinalSeal' -and
        $physicalPassed -ge 2 -and
        $authenticatedPassed -ge 2
    ) { 'PASS' } else { 'HOLD' }
    mode = $Mode
    sourceCommit = $manifest.sourceCommit
    apiOrigin = $manifest.apiOrigin
    published = $false
    physicalDevices = [ordered]@{
        required = 2
        passed = $physicalPassed
        serials = @($selected | Where-Object { $_.kind -eq 'Physical' } | ForEach-Object { $_.serial })
    }
    authenticatedFlow = [ordered]@{
        status = if ($authenticatedPassed -ge 2) { 'PASS' } else { 'HOLD' }
        login = if ($authenticatedPassed -ge 2) { 'PASS' } else { 'HOLD' }
        logout = if ($authenticatedPassed -ge 2) { 'PASS' } else { 'HOLD' }
        shortTtlVerification = if ([int]$manifest.sessionTtlSeconds -le 1800) { 'PASS' } else { 'HOLD' }
        fixedBusinessChain = if ($authenticatedPassed -ge 2) { 'PASS' } else { 'HOLD' }
        passedRuns = $authenticatedPassed
    }
    reports = $qaReports
    evidenceRoot = $EvidenceRoot.Substring($ArtifactRoot.Length).TrimStart('\', '/').Replace('\', '/')
}
if ($Mode -eq 'FinalSeal') {
    if ($qaIndex.status -ne 'PASS') {
        throw 'INVESTOR_APK_HOLD: FinalSeal QA did not satisfy the two-device authenticated gate.'
    }
    Write-Json $qaIndexPath $qaIndex
} else {
    Write-Json (Join-Path $EvidenceRoot 'qa-index.json') $qaIndex
}
Write-Output "INVESTOR_DEMO_QA_EVIDENCE=$EvidenceRoot"
