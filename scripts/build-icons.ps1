Add-Type -AssemblyName System.Drawing
foreach ($size in @(192,512)) {
  $bitmap = New-Object System.Drawing.Bitmap($size,$size)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.ScaleTransform($size/512.0,$size/512.0)
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#254e40'))
  $paper = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f6f2e8'))
  $leaf = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#c6d5a8'))
  $line = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#254e40'),12)
  $fine = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#b3bda7'),10)
  $bookPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bookPath.AddBezier(121,161,174,146,220,157,256,185)
  $bookPath.AddBezier(256,185,292,157,338,146,391,161)
  $bookPath.AddLine(391,161,391,362)
  $bookPath.AddBezier(391,362,338,347,292,358,256,386)
  $bookPath.AddBezier(256,386,220,358,174,347,121,362)
  $bookPath.CloseFigure()
  $g.FillPath($paper,$bookPath)
  $g.DrawLine($line,256,185,256,386)
  $leafPath=New-Object System.Drawing.Drawing2D.GraphicsPath
  $leafPath.AddBezier(211,111,211,63,260,44,293,54)
  $leafPath.AddBezier(293,54,292,93,262,122,211,111)
  $g.FillPath($leaf,$leafPath)
  foreach($coords in @(@(163,215,214,215),@(163,255,214,255),@(299,215,348,215),@(299,255,348,255))) {$g.DrawLine($fine,$coords[0],$coords[1],$coords[2],$coords[3])}
  $bitmap.Save((Join-Path (Get-Location) "dist/icon-$size.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose();$bitmap.Dispose();$paper.Dispose();$leaf.Dispose();$line.Dispose();$fine.Dispose();$bookPath.Dispose();$leafPath.Dispose()
}
