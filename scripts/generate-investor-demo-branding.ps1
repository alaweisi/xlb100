[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$customerLabel = -join ([char[]](0x5BA2, 0x6237))
$workerLabel = -join ([char[]](0x5E08, 0x5085))
$adminLabel = -join ([char[]](0x7BA1, 0x7406))
$customerGlyph = [string][char]0x5BA2
$workerGlyph = [string][char]0x5E08
$adminGlyph = [string][char]0x7BA1
$xlbBrand = -join ([char[]](0x559C, 0x4E50, 0x5E2E))
$appSuffix = -join ([char[]](0x7AEF, 0x0020, 0x00B7, 0x0020, 0x6F14, 0x793A))
$demoNotice = -join ([char[]](0x4EC5, 0x4F9B, 0x6A21, 0x62DF, 0x6F14, 0x793A))
$middleDot = [string][char]0x00B7
$roles = @(
    @{
        Key = "customer"
        Label = $customerLabel
        Glyph = $customerGlyph
        Background = "#C96F32"
        Surface = "#FFF4E6"
        Accent = "#8F3F1F"
    },
    @{
        Key = "worker"
        Label = $workerLabel
        Glyph = $workerGlyph
        Background = "#176D96"
        Surface = "#E9F7FF"
        Accent = "#0C4564"
    },
    @{
        Key = "admin"
        Label = $adminLabel
        Glyph = $adminGlyph
        Background = "#6847A5"
        Surface = "#F4EEFF"
        Accent = "#3E2772"
    }
)

function New-Directory([string]$Path) {
    [System.IO.Directory]::CreateDirectory($Path) | Out-Null
}

function New-Font([float]$Size, [System.Drawing.FontStyle]$Style) {
    foreach ($family in @("Microsoft YaHei UI", "Microsoft YaHei", "Arial")) {
        try {
            return [System.Drawing.Font]::new(
                $family,
                [Math]::Max(6, $Size),
                $Style,
                [System.Drawing.GraphicsUnit]::Pixel
            )
        } catch {
            continue
        }
    }
    throw "No usable font is installed for Investor Demo branding"
}

function New-CenteredFormat() {
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    return $format
}

function Save-Launcher(
    [string]$SourcePath,
    [string]$TargetPath,
    [hashtable]$Role,
    [ValidateSet("legacy", "round", "foreground")]
    [string]$Kind
) {
    $source = [System.Drawing.Image]::FromFile($SourcePath)
    try {
        $bitmap = [System.Drawing.Bitmap]::new(
            $source.Width,
            $source.Height,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
    } finally {
        $source.Dispose()
    }
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $width = $bitmap.Width
        $height = $bitmap.Height
        $background = [System.Drawing.ColorTranslator]::FromHtml($Role.Background)
        $accent = [System.Drawing.ColorTranslator]::FromHtml($Role.Accent)
        $white = [System.Drawing.Color]::White

        if ($Kind -eq "round") {
            $graphics.FillEllipse(
                [System.Drawing.SolidBrush]::new($background),
                0,
                0,
                $width - 1,
                $height - 1
            )
        } elseif ($Kind -eq "legacy") {
            $graphics.FillRectangle(
                [System.Drawing.SolidBrush]::new($background),
                0,
                0,
                $width,
                $height
            )
        }

        $scale = [Math]::Min($width, $height)
        $badgeSize = if ($Kind -eq "foreground") { $scale * 0.5 } else { $scale * 0.64 }
        $badgeX = ($width - $badgeSize) / 2
        $badgeY = ($height - $badgeSize) / 2 - ($scale * 0.04)
        $badgeColor = if ($Kind -eq "foreground") { $white } else { [System.Drawing.Color]::FromArgb(236, 255, 255, 255) }
        $graphics.FillEllipse(
            [System.Drawing.SolidBrush]::new($badgeColor),
            $badgeX,
            $badgeY,
            $badgeSize,
            $badgeSize
        )

        $glyphColor = if ($Kind -eq "foreground") { $background } else { $accent }
        $glyphFont = New-Font ($scale * 0.34) ([System.Drawing.FontStyle]::Bold)
        $format = New-CenteredFormat
        try {
            $graphics.DrawString(
                $Role.Glyph,
                $glyphFont,
                [System.Drawing.SolidBrush]::new($glyphColor),
                [System.Drawing.RectangleF]::new($badgeX, $badgeY - ($scale * 0.02), $badgeSize, $badgeSize),
                $format
            )
        } finally {
            $glyphFont.Dispose()
            $format.Dispose()
        }

        $demoHeight = [Math]::Max(8, $scale * 0.2)
        $demoWidth = [Math]::Max(14, $scale * 0.44)
        $demoX = ($width - $demoWidth) / 2
        $demoY = [Math]::Min($height - $demoHeight - 1, $badgeY + $badgeSize - ($demoHeight * 0.28))
        $graphics.FillEllipse(
            [System.Drawing.SolidBrush]::new($accent),
            $demoX,
            $demoY,
            $demoWidth,
            $demoHeight
        )
        $demoFont = New-Font ($scale * 0.095) ([System.Drawing.FontStyle]::Bold)
        $demoFormat = New-CenteredFormat
        try {
            $graphics.DrawString(
                "DEMO",
                $demoFont,
                [System.Drawing.Brushes]::White,
                [System.Drawing.RectangleF]::new($demoX, $demoY, $demoWidth, $demoHeight),
                $demoFormat
            )
        } finally {
            $demoFont.Dispose()
            $demoFormat.Dispose()
        }

        New-Directory (Split-Path -Parent $TargetPath)
        $bitmap.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Save-Splash([string]$SourcePath, [string]$TargetPath, [hashtable]$Role) {
    $source = [System.Drawing.Image]::FromFile($SourcePath)
    try {
        $bitmap = [System.Drawing.Bitmap]::new(
            $source.Width,
            $source.Height,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
    } finally {
        $source.Dispose()
    }
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $width = $bitmap.Width
        $height = $bitmap.Height
        $shortEdge = [Math]::Min($width, $height)
        $background = [System.Drawing.ColorTranslator]::FromHtml($Role.Background)
        $surface = [System.Drawing.ColorTranslator]::FromHtml($Role.Surface)
        $accent = [System.Drawing.ColorTranslator]::FromHtml($Role.Accent)
        $graphics.Clear($surface)
        $graphics.FillEllipse(
            [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28, $background)),
            -$shortEdge * 0.25,
            -$shortEdge * 0.25,
            $shortEdge * 0.9,
            $shortEdge * 0.9
        )
        $graphics.FillEllipse(
            [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(20, $accent)),
            $width - ($shortEdge * 0.65),
            $height - ($shortEdge * 0.55),
            $shortEdge * 0.85,
            $shortEdge * 0.85
        )

        $markSize = $shortEdge * 0.23
        $markX = ($width - $markSize) / 2
        $markY = ($height - $markSize) / 2 - ($shortEdge * 0.28)
        $graphics.FillEllipse(
            [System.Drawing.SolidBrush]::new($background),
            $markX,
            $markY,
            $markSize,
            $markSize
        )
        $glyphFont = New-Font ($markSize * 0.5) ([System.Drawing.FontStyle]::Bold)
        $glyphFormat = New-CenteredFormat
        try {
            $graphics.DrawString(
                $Role.Glyph,
                $glyphFont,
                [System.Drawing.Brushes]::White,
                [System.Drawing.RectangleF]::new($markX, $markY, $markSize, $markSize),
                $glyphFormat
            )
        } finally {
            $glyphFont.Dispose()
            $glyphFormat.Dispose()
        }

        $titleFont = New-Font ($shortEdge * 0.09) ([System.Drawing.FontStyle]::Bold)
        $roleFont = New-Font ($shortEdge * 0.062) ([System.Drawing.FontStyle]::Bold)
        $noticeFont = New-Font ($shortEdge * 0.034) ([System.Drawing.FontStyle]::Regular)
        $format = New-CenteredFormat
        try {
            $centerY = $height / 2
            $graphics.DrawString(
                $xlbBrand,
                $titleFont,
                [System.Drawing.SolidBrush]::new($accent),
                [System.Drawing.RectangleF]::new(0, $centerY - ($shortEdge * 0.04), $width, $shortEdge * 0.11),
                $format
            )
            $graphics.DrawString(
                "$($Role.Label)$appSuffix",
                $roleFont,
                [System.Drawing.SolidBrush]::new($background),
                [System.Drawing.RectangleF]::new(0, $centerY + ($shortEdge * 0.07), $width, $shortEdge * 0.08),
                $format
            )
            $graphics.DrawString(
                "DEMO $middleDot $demoNotice",
                $noticeFont,
                [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, $accent)),
                [System.Drawing.RectangleF]::new(0, $centerY + ($shortEdge * 0.18), $width, $shortEdge * 0.06),
                $format
            )
        } finally {
            $titleFont.Dispose()
            $roleFont.Dispose()
            $noticeFont.Dispose()
            $format.Dispose()
        }

        New-Directory (Split-Path -Parent $TargetPath)
        $bitmap.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

foreach ($role in $roles) {
    $mainRes = Join-Path $workspaceRoot "apps/$($role.Key)-mobile/android/app/src/main/res"
    $demoRes = Join-Path $workspaceRoot "apps/$($role.Key)-mobile/android/app/src/investorDemo/res"

    foreach ($density in @("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")) {
        foreach ($asset in @(
            @{ Name = "ic_launcher.png"; Kind = "legacy" },
            @{ Name = "ic_launcher_round.png"; Kind = "round" },
            @{ Name = "ic_launcher_foreground.png"; Kind = "foreground" }
        )) {
            $source = Join-Path $mainRes "mipmap-$density/$($asset.Name)"
            $target = Join-Path $demoRes "mipmap-$density/$($asset.Name)"
            Save-Launcher $source $target $role $asset.Kind
        }
    }

    foreach ($relative in @(
        "drawable/splash.png",
        "drawable-port-mdpi/splash.png",
        "drawable-port-hdpi/splash.png",
        "drawable-port-xhdpi/splash.png",
        "drawable-port-xxhdpi/splash.png",
        "drawable-port-xxxhdpi/splash.png",
        "drawable-land-mdpi/splash.png",
        "drawable-land-hdpi/splash.png",
        "drawable-land-xhdpi/splash.png",
        "drawable-land-xxhdpi/splash.png",
        "drawable-land-xxxhdpi/splash.png"
    )) {
        Save-Splash (Join-Path $mainRes $relative) (Join-Path $demoRes $relative) $role
    }

    $adaptiveRoot = Join-Path $demoRes "mipmap-anydpi-v26"
    New-Directory $adaptiveRoot
    $adaptiveXml = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'@
    [System.IO.File]::WriteAllText(
        (Join-Path $adaptiveRoot "ic_launcher.xml"),
        $adaptiveXml,
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $adaptiveRoot "ic_launcher_round.xml"),
        $adaptiveXml,
        [System.Text.UTF8Encoding]::new($false)
    )

    $valuesRoot = Join-Path $demoRes "values"
    New-Directory $valuesRoot
    $colorXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$($role.Background)</color>
</resources>
"@
    [System.IO.File]::WriteAllText(
        (Join-Path $valuesRoot "ic_launcher_background.xml"),
        $colorXml,
        [System.Text.UTF8Encoding]::new($false)
    )
}

Write-Output "Investor Demo branding generated for customer, worker, and admin."
