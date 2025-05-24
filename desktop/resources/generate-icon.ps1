# Generate a simple placeholder icon for Verbweaver Desktop

Add-Type -AssemblyName System.Drawing

$width = 512
$height = 512

# Create a new bitmap
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

# Set background color (gradient effect)
$rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(79, 70, 229),  # Indigo
    [System.Drawing.Color]::FromArgb(124, 58, 237), # Purple
    45
)
$graphics.FillRectangle($brush, $rect)

# Draw a simple "V" using lines
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 20)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Draw V shape
$graphics.DrawLine($pen, 156, 156, 256, 356)
$graphics.DrawLine($pen, 356, 156, 256, 356)

# Add some nodes (circles)
$nodeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$graphics.FillEllipse($nodeBrush, 146, 146, 20, 20)
$graphics.FillEllipse($nodeBrush, 346, 146, 20, 20)
$graphics.FillEllipse($nodeBrush, 246, 346, 20, 20)

# Save the image
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bitmap.Save("$scriptDir\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Clean up
$graphics.Dispose()
$bitmap.Dispose()
$pen.Dispose()
$brush.Dispose()
$nodeBrush.Dispose()

Write-Host "Icon generated successfully at: $scriptDir\icon.png" -ForegroundColor Green
Write-Host "Note: This is a placeholder. Replace with your actual icon before distribution." -ForegroundColor Yellow 