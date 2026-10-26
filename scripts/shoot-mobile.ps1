# Mobile screenshots via a same-origin iframe.
#
# WHY an iframe instead of --window-size=390
#   Headless Edge enforces a viewport floor of roughly 500px: asking for a 390px
#   window still gives innerWidth ~504. The screenshot is then *cropped* to 390,
#   so the page looks horizontally broken when it is not.
#   That trap is already recorded in this project's HANDOFF; this script exists so
#   it cannot happen again.
#
#   An iframe makes the *layout viewport* exactly N px, so vw/media queries resolve
#   the way they do on a real phone. The wrapper is written into dist/ so the frame
#   is same-origin (no cross-origin screenshot restrictions).
#
# USAGE
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shoot-mobile.ps1 `
#       -Pages "index,entry/sunscreen-use" -Widths "390,360" -Height 3600

param(
  [string[]]$Pages = @('index'),
  [string[]]$Widths = @('390'),
  [int]$Height = 3600,
  [int]$Port = 8101
)

$ErrorActionPreference = 'Stop'

if ($Pages.Count -eq 1 -and $Pages[0] -like '*,*') { $Pages = $Pages[0] -split ',' }
if ($Widths.Count -eq 1 -and $Widths[0] -like '*,*') { $Widths = $Widths[0] -split ',' }
$Pages = @($Pages | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$Widths = @($Widths | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$proj = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $proj 'dist'
$outDir = Join-Path (Split-Path -Parent $proj) 'handoff\_shots'
if (-not (Test-Path $dist)) { throw "dist not found. run build first." }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$py = 'C:\Users\17878\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }

$job = Start-Job -ScriptBlock {
  param($dir, $python, $port)
  Set-Location $dir
  & $python -m http.server $port --bind 127.0.0.1
} -ArgumentList $dist, $py, $Port

$probe = Join-Path $dist '_probe-mobile.html'

try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    $code = curl.exe -sS -o NUL --noproxy '*' -w '%{http_code}' --max-time 3 "http://127.0.0.1:$Port/" 2>$null
    if ($code -eq '200') { $ready = $true; break }
    Start-Sleep -Milliseconds 300
  }
  if (-not $ready) { throw "static server did not start on port $Port" }

  foreach ($page in $Pages) {
    $pathPart = if ($page -eq 'index' -or $page -eq '/') { '' } else { $page }
    $slug = $page -replace '[/]', '_'
    if ($slug -eq '' -or $slug -eq 'index') { $slug = 'home' }

    foreach ($w in $Widths) {
      $html = @"
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#888}
iframe{display:block;width:${w}px;height:${Height}px;border:0}</style></head>
<body><iframe src="/$pathPart" scrolling="no"></iframe></body></html>
"@
      Set-Content -LiteralPath $probe -Value $html -Encoding UTF8

      $file = Join-Path $outDir ("m" + $slug + '-' + $w + '.png')
      if (Test-Path $file) { Remove-Item $file -Force }

      $edgeArgs = @(
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1',
        "--window-size=$w,$Height",
        "--screenshot=$file",
        "http://127.0.0.1:$Port/_probe-mobile.html"
      )
      $prev = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      & $edge @edgeArgs 2>$null
      $ErrorActionPreference = $prev

      for ($k = 0; $k -lt 30; $k++) {
        if (Test-Path $file) { break }
        Start-Sleep -Milliseconds 100
      }

      if (Test-Path $file) {
        $kb = [math]::Round((Get-Item $file).Length / 1KB, 0)
        Write-Host ("  [OK] m{0}-{1}.png  {2}KB" -f $slug, $w, $kb)
      } else {
        Write-Host ("  [X]  m{0}-{1}.png failed" -f $slug, $w)
      }
    }
  }
} finally {
  if (Test-Path $probe) { Remove-Item $probe -Force -ErrorAction SilentlyContinue }
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "out: $outDir"
