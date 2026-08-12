Add-Type -AssemblyName System.Drawing

$GREEN = [System.Drawing.ColorTranslator]::FromHtml("#123b30")
$GOLD = [System.Drawing.ColorTranslator]::FromHtml("#d9b366")
$BEIGE = [System.Drawing.ColorTranslator]::FromHtml("#f6f4ee")

function Draw-Mark {
  param([System.Drawing.Graphics]$g, [float]$size)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear($GREEN)
  $ringPen = New-Object System.Drawing.Pen($GOLD, [float]($size * 0.055))
  $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $r = $size * 0.30
  $rect = New-Object System.Drawing.RectangleF(
    [float](($size - $r * 2) / 2),
    [float](($size - $r * 2) / 2),
    [float]($r * 2),
    [float]($r * 2)
  )
  $g.DrawArc($ringPen, $rect, [float]35, [float]290)
  $font = New-Object System.Drawing.Font("Segoe UI", [float]($size * 0.46), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush($BEIGE)
  $textRect = New-Object System.Drawing.RectangleF(0, [float]($size * 0.02), [float]$size, [float]($size * 0.92))
  $g.DrawString("و", $font, $brush, $textRect, $fmt)
  $ringPen.Dispose(); $font.Dispose(); $fmt.Dispose(); $brush.Dispose()
}

function New-Icon {
  param([int]$size, [string]$path)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  Draw-Mark -g $g -size ([float]$size)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "icon $path"
}

function New-Splash {
  param([int]$w, [int]$h, [string]$path)
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $size = [math]::Min($w, $h)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($GREEN)
  $ringPen = New-Object System.Drawing.Pen($GOLD, [float]($size * 0.05))
  $r = $size * 0.26
  $cx = [float]($w / 2); $cy = [float]($h / 2)
  $rect = New-Object System.Drawing.RectangleF(
    [float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2))
  $g.DrawArc($ringPen, $rect, [float]35, [float]290)
  $font = New-Object System.Drawing.Font("Segoe UI", [float]($size * 0.4), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush($BEIGE)
  $textRect = New-Object System.Drawing.RectangleF(0, [float]($cy - $size * 0.45), [float]$w, [float]($size * 0.9))
  $g.DrawString("و", $font, $brush, $textRect, $fmt)
  $ringPen.Dispose(); $font.Dispose(); $fmt.Dispose(); $brush.Dispose(); $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "splash $path"
}

$res = Join-Path (Get-Location) "android\app\src\main\res"

$launcher = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
foreach ($d in $launcher.GetEnumerator()) {
  New-Icon $d.Value "$res\mipmap-$($d.Key)\ic_launcher.png"
  New-Icon $d.Value "$res\mipmap-$($d.Key)\ic_launcher_round.png"
}

$fore = @{ mdpi = 108; hdpi = 162; xhdpi = 216; xxhdpi = 324; xxxhdpi = 432 }
foreach ($d in $fore.GetEnumerator()) {
  New-Icon $d.Value "$res\mipmap-$($d.Key)\ic_launcher_foreground.png"
}

New-Splash 480 320 "$res\drawable\splash.png"
New-Splash 480 320 "$res\drawable-port-mdpi\splash.png"
New-Splash 720 480 "$res\drawable-port-hdpi\splash.png"
New-Splash 960 640 "$res\drawable-port-xhdpi\splash.png"
New-Splash 1440 960 "$res\drawable-port-xxhdpi\splash.png"
New-Splash 1920 1280 "$res\drawable-port-xxxhdpi\splash.png"
New-Splash 320 480 "$res\drawable-land-mdpi\splash.png"
New-Splash 480 720 "$res\drawable-land-hdpi\splash.png"
New-Splash 640 960 "$res\drawable-land-xhdpi\splash.png"
New-Splash 960 1440 "$res\drawable-land-xxhdpi\splash.png"
New-Splash 1280 1920 "$res\drawable-land-xxxhdpi\splash.png"
