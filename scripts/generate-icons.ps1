# Generates the Wardi brand icon set (launcher, adaptive foregrounds, splash, web) using GDI+.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
# Outputs are written into android/app/src/main/res and src/app (web icon).

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$Res  = Join-Path $Root "android\app\src\main\res"
$App  = Join-Path $Root "src\app"

# ---- palette (brand: deep emerald + gold) ----
$EmeraldLight = [System.Drawing.Color]::FromArgb(255, 30, 107, 79)
$EmeraldMid   = [System.Drawing.Color]::FromArgb(255, 20, 83, 62)
$EmeraldDark  = [System.Drawing.Color]::FromArgb(255, 10, 39, 30)
$GoldLight    = [System.Drawing.Color]::FromArgb(255, 246, 230, 172)
$GoldMid      = [System.Drawing.Color]::FromArgb(255, 223, 190, 110)
$GoldDeep     = [System.Drawing.Color]::FromArgb(255, 201, 148, 62)
$GoldInk      = [System.Drawing.Color]::FromArgb(255, 143, 111, 44)
$Sparkle      = [System.Drawing.Color]::FromArgb(255, 253, 246, 222)

function New-RoundedPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Add-Glow([System.Drawing.Graphics]$g, [double]$S, [double]$cx, [double]$cy, [double]$rx, [double]$ry, [System.Drawing.Color]$center, [System.Drawing.Color]$edge) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse([single]($S * ($cx - $rx)), [single]($S * ($cy - $ry)), [single]($S * 2 * $rx), [single]($S * 2 * $ry))
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
    $pb.CenterPoint = New-Object System.Drawing.PointF([single]($S * $cx), [single]($S * $cy))
    $pb.CenterColor = $center
    $pb.SurroundColors = @($edge)
    $g.FillPath($pb, $path)
    $pb.Dispose(); $path.Dispose()
}

function Add-Sparkle([System.Drawing.Graphics]$g, [double]$S, [double]$x, [double]$y, [double]$r, [System.Drawing.Color]$c) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pts = New-Object 'System.Drawing.PointF[]' 8
    $pts[0] = New-Object System.Drawing.PointF([single]($S * $x), [single]($S * ($y - $r)))
    $pts[1] = New-Object System.Drawing.PointF([single]($S * ($x + 0.35 * $r)), [single]($S * ($y - 0.35 * $r)))
    $pts[2] = New-Object System.Drawing.PointF([single]($S * ($x + $r)), [single]($S * $y))
    $pts[3] = New-Object System.Drawing.PointF([single]($S * ($x + 0.35 * $r)), [single]($S * ($y + 0.35 * $r)))
    $pts[4] = New-Object System.Drawing.PointF([single]($S * $x), [single]($S * ($y + $r)))
    $pts[5] = New-Object System.Drawing.PointF([single]($S * ($x - 0.35 * $r)), [single]($S * ($y + 0.35 * $r)))
    $pts[6] = New-Object System.Drawing.PointF([single]($S * ($x - $r)), [single]($S * $y))
    $pts[7] = New-Object System.Drawing.PointF([single]($S * ($x - 0.35 * $r)), [single]($S * ($y - 0.35 * $r)))
    $p.AddPolygon($pts)
    $g.FillPath((New-Object System.Drawing.SolidBrush($c)), $p)
    $p.Dispose()
}

function Draw-Book([System.Drawing.Graphics]$g, [double]$S) {
    $cx = 0.50; $cy = 0.545; $hw = 0.235; $topY = 0.425; $outerY = 0.448; $botY = 0.705

    # soft shadow under the book
    Add-Glow $g $S 0.50 ($botY + 0.02) 0.20 0.05 ([System.Drawing.Color]::FromArgb(90, 0, 0, 0)) ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

    function New-PagePath([double]$sign) {
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $sx = $cx + $sign * $hw
        $p.AddBezier(
            [single]($S * $cx),  [single]($S * $topY),
            [single]($S * ($cx + $sign * 0.33 * $hw)), [single]($S * ($topY + 0.055)),
            [single]($S * ($cx + $sign * 0.67 * $hw)), [single]($S * ($outerY + 0.02)),
            [single]($S * $sx),  [single]($S * $outerY))
        $p.AddLine([single]($S * $sx), [single]($S * $outerY), [single]($S * $sx), [single]($S * $botY))
        $p.AddLine([single]($S * $sx), [single]($S * $botY), [single]($S * $cx), [single]($S * $botY))
        $p.CloseFigure()
        return $p
    }

    $rectR = New-Object System.Drawing.RectangleF([single]($S * 0.26), [single]($S * 0.42), [single]($S * 0.48), [single]($S * 0.29))
    $gradR = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectR, $GoldLight, $GoldMid, 80)
    $gradL = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectR, [System.Drawing.Color]::FromArgb(255, 215, 177, 95), [System.Drawing.Color]::FromArgb(255, 192, 148, 68), 80)

    $pr = New-PagePath 1
    $pl = New-PagePath -1
    $g.FillPath($gradR, $pr)
    $g.FillPath($gradL, $pl)

    # page text rows (both pages, mirrored)
    $linePen = New-Object System.Drawing.Pen(([System.Drawing.Color]::FromArgb(150, 169, 129, 51)), [single]($S * 0.009))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    foreach ($y in @(0.54, 0.60, 0.66)) {
        foreach ($sign in @(-1, 1)) {
            $x0 = $cx + $sign * 0.24 * $hw
            $x1 = $cx + $sign * 0.86 * $hw
            $g.DrawLine($linePen,
                [single]($S * $x0), [single]($S * $y),
                [single]($S * $x1), [single]($S * $y))
        }
    }

    # spine seam
    $spine = New-Object System.Drawing.Pen($GoldInk, [single]($S * 0.014))
    $spine.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $spine.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($spine, [single]($S * $cx), [single]($S * $topY), [single]($S * $cx), [single]($S * $botY))

    $pr.Dispose(); $pl.Dispose(); $gradR.Dispose(); $gradL.Dispose(); $linePen.Dispose(); $spine.Dispose()
}

function Draw-Sparkles([System.Drawing.Graphics]$g, [double]$S) {
    Add-Sparkle $g $S 0.75 0.29 0.052 $Sparkle
    Add-Sparkle $g $S 0.84 0.42 0.028 $Sparkle
    Add-Sparkle $g $S 0.615 0.215 0.024 $Sparkle
}

function Render-Art([double]$S, [string]$mode) {
    $bmp = New-Object System.Drawing.Bitmap([int]$S, [int]$S)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($mode -eq "full") {
        $clip = New-RoundedPath 0 0 $S $S ($S * 0.22)
        $g.SetClip($clip)

        $bgRect = New-Object System.Drawing.RectangleF(0, 0, [single]$S, [single]$S)
        $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $EmeraldLight, $EmeraldDark, 135)
        $g.FillRectangle($bg, 0, 0, [single]$S, [single]$S)

        Add-Glow $g $S 0.50 0.46 0.46 0.46 ([System.Drawing.Color]::FromArgb(150, 235, 201, 122)) ([System.Drawing.Color]::FromArgb(0, 235, 201, 122))
        Add-Glow $g $S 0.50 0.46 0.30 0.30 ([System.Drawing.Color]::FromArgb(90, 255, 240, 200)) ([System.Drawing.Color]::FromArgb(0, 255, 240, 200))

        # glass sheen (top-left)
        $sheenRect = New-Object System.Drawing.RectangleF(0, 0, [single]($S * 0.9), [single]($S * 0.9))
        $sheen = New-Object System.Drawing.Drawing2D.LinearGradientBrush($sheenRect, [System.Drawing.Color]::FromArgb(70, 255, 255, 255), [System.Drawing.Color]::FromArgb(0, 255, 255, 255), 135)
        $g.FillRectangle($sheen, 0, 0, [single]$S, [single]$S)
        $sheen.Dispose(); $bg.Dispose()

        Draw-Book $g $S
        Draw-Sparkles $g $S

        # subtle gold contour ring
        $ring = New-Object System.Drawing.Pen(([System.Drawing.Color]::FromArgb(75, 233, 200, 120)), [single]($S * 0.008))
        $g.DrawEllipse($ring, [single]($S * 0.04), [single]($S * 0.04), [single]($S * 0.92), [single]($S * 0.92))

        $g.ResetClip()
        $clip.Dispose(); $ring.Dispose()
    } elseif ($mode -eq "foreground") {
        # adaptive foreground: artwork only, transparent background, safe-zone scaled
        $g.TranslateTransform([single]($S * 0.16), [single]($S * 0.16))
        $g.ScaleTransform(0.68, 0.68)
        Add-Glow $g $S 0.50 0.46 0.52 0.52 ([System.Drawing.Color]::FromArgb(130, 235, 201, 122)) ([System.Drawing.Color]::FromArgb(0, 235, 201, 122))
        Draw-Book $g $S
        Draw-Sparkles $g $S
    }
    $g.Dispose()
    return $bmp
}

# ---- Android launcher (legacy full icons) ----
$legacy = @(
    @{ name = "mipmap-mdpi";    size = 48 },
    @{ name = "mipmap-hdpi";    size = 72 },
    @{ name = "mipmap-xhdpi";   size = 96 },
    @{ name = "mipmap-xxhdpi";  size = 144 },
    @{ name = "mipmap-xxxhdpi"; size = 192 }
)
foreach ($entry in $legacy) {
    $dir = Join-Path $Res $entry.name
    foreach ($file in @("ic_launcher.png", "ic_launcher_round.png")) {
        $bmp = Render-Art $entry.size "full"
        $out = Join-Path $dir $file
        $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "wrote $out"
    }
}

# ---- Android adaptive foregrounds (108dp * density) ----
$fg = @(
    @{ name = "mipmap-mdpi";    size = 108 },
    @{ name = "mipmap-hdpi";    size = 162 },
    @{ name = "mipmap-xhdpi";   size = 216 },
    @{ name = "mipmap-xxhdpi";  size = 324 },
    @{ name = "mipmap-xxxhdpi"; size = 432 }
)
foreach ($entry in $fg) {
    $dir = Join-Path $Res $entry.name
    $bmp = Render-Art $entry.size "foreground"
    $out = Join-Path $dir "ic_launcher_foreground.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $out"
}

# ---- splash (branded, per existing densities) ----
$splash = @(
    @{ name = "drawable";            w = 480;  h = 320 },
    @{ name = "drawable-land-mdpi";  w = 320;  h = 480 },
    @{ name = "drawable-land-hdpi";  w = 480;  h = 720 },
    @{ name = "drawable-land-xhdpi"; w = 640;  h = 960 },
    @{ name = "drawable-land-xxhdpi"; w = 960;  h = 1440 },
    @{ name = "drawable-land-xxxhdpi"; w = 1280; h = 1920 },
    @{ name = "drawable-port-mdpi";  w = 480;  h = 320 },
    @{ name = "drawable-port-hdpi";  w = 720;  h = 480 },
    @{ name = "drawable-port-xhdpi"; w = 960;  h = 640 },
    @{ name = "drawable-port-xxhdpi"; w = 1440; h = 960 },
    @{ name = "drawable-port-xxxhdpi"; w = 1920; h = 1280 }
)
foreach ($entry in $splash) {
    $W = $entry.w; $H = $entry.h
    $min = [Math]::Min($W, $H)
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $bgRect = New-Object System.Drawing.RectangleF(0, 0, $W, $H)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $EmeraldMid, $EmeraldDark, 135)
    $g.FillRectangle($bg, 0, 0, $W, $H)
    $bg.Dispose()
    Add-Glow $g $min 0.5 0.46 0.6 0.6 ([System.Drawing.Color]::FromArgb(130, 235, 201, 122)) ([System.Drawing.Color]::FromArgb(0, 235, 201, 122))

    # centered wordmark "وردي"
    $fontSize = $min * 0.10
    $font = New-Object System.Drawing.Font("Segoe UI", [single]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textColor = New-Object System.Drawing.SolidBrush($GoldLight)
    $textRect = New-Object System.Drawing.RectangleF(0, [single]($H * 0.72), $W, [single]($min * 0.16))
    $g.DrawString("وردي", $font, $textColor, $textRect, $sf)
    $font.Dispose(); $textColor.Dispose(); $sf.Dispose()

    # small book glyph above the wordmark
    $g.TranslateTransform([single]($W / 2 - $min * 0.11), [single]($H * 0.72 - $min * 0.30))
    $g.ScaleTransform(0.22 * $min, 0.22 * $min)
    $g.ScaleTransform($min / 1000, $min / 1000)
    # simple open-book glyph: two rounded "pages"
    $pageH = $min * 0.13
    $pageW = $min * 0.11
    $goldB = New-Object System.Drawing.SolidBrush($GoldMid)
    $r1 = New-Object System.Drawing.RectangleF([single]($min * 0.5 - $pageW - 0.01 * $min), [single]($min * 0.5 - $pageH / 2), [single]$pageW, [single]$pageH)
    $r2 = New-Object System.Drawing.RectangleF([single]($min * 0.5 + 0.01 * $min), [single]($min * 0.5 - $pageH / 2), [single]$pageW, [single]$pageH)
    $g.FillEllipse($goldB, $r1)
    $g.FillEllipse($goldB, $r2)
    $goldB.Dispose()

    $g.Dispose()
    $out = Join-Path (Join-Path $Res $entry.name) "splash.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $out"
}

# ---- web icons ----
$web = @(
    @{ dir = $App; file = "icon.png";          size = 512 },
    @{ dir = (Join-Path $Root "public"); file = "wardi-icon-1024.png"; size = 1024 }
)
foreach ($entry in $web) {
    $bmp = Render-Art $entry.size "full"
    $out = Join-Path $entry.dir $entry.file
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $out"
}

Write-Host "DONE"
