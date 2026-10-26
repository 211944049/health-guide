# Screenshot helper: start a temp static server, shoot pages with headless Edge, stop it.
#
# Why HTTP and not file://
#   The site requests /_astro/*.css via absolute paths. With file:// those 404,
#   and you get unstyled bare HTML -- that already happened once and nearly became
#   "evidence" that a change was fine.
#
# NOTE: this file is intentionally ASCII-only.
#   PowerShell 5.1 reads .ps1 as ANSI unless it has a BOM; Chinese comments
#   broke string terminators and the whole script failed to parse.
#   (Same lesson as run.cmd -- keep the file ASCII.)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shoot.ps1 `
#       -Pages "index","entry/sunscreen-use" -Widths "1280","390"
# Output: handoff/_shots/<page>-<width>.png

param(
  [string[]]$Pages = @('index'),
  [string[]]$Widths = @('1280'),
  [int]$Height = 2400,
  [int]$Port = 8100
)

$ErrorActionPreference = 'Stop'

# With `powershell -File`, a call like -Pages "a","b" arrives as ONE string "a,b".
# Normalize: if a single element contains commas, split it.
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

try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    $code = curl.exe -sS -o NUL --noproxy '*' -w '%{http_code}' --max-time 3 "http://127.0.0.1:$Port/" 2>$null
    if ($code -eq '200') { $ready = $true; break }
    Start-Sleep -Milliseconds 300
  }
  if (-not $ready) { throw "static server did not start on port $Port" }

  foreach ($page in $Pages) {
    foreach ($w in $Widths) {
      $slug = $page -replace '[/]', '_'
      if ($slug -eq '' -or $slug -eq 'index') { $slug = 'home' }
      $file = Join-Path $outDir ($slug + '-' + $w + '.png')
      if (Test-Path $file) { Remove-Item $file -Force }
      # The home page lives at "/", not "/index" -- that mismatch produced a 404
      # and a screenshot of the 404 page.
      $pathPart = if ($page -eq 'index' -or $page -eq '/') { '' } else { $page }
      $url = "http://127.0.0.1:$Port/$pathPart"
      $edgeArgs = @(
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1',
        "--window-size=$w,$Height",
        "--screenshot=$file",
        $url
      )
      # msedge writes "N bytes written to file ..." to stderr. With
      # ErrorActionPreference=Stop that becomes a terminating error, so the
      # call is run with stderr discarded and Continue semantics.
      $prev = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      & $edge @edgeArgs 2>$null
      $ErrorActionPreference = $prev

      # Edge can return before the PNG is flushed -> poll briefly.
      # (A bare Test-Path right after the call reported "failed" even though
      #  the file showed up a moment later, at full size.)
      for ($k = 0; $k -lt 30; $k++) {
        if (Test-Path $file) { break }
        Start-Sleep -Milliseconds 100
      }
      if (Test-Path $file) {
        $kb = [math]::Round((Get-Item $file).Length / 1KB, 0)
        Write-Host ("  [OK] {0}-{1}.png  {2}KB" -f $slug, $w, $kb)
      } else {
        Write-Host ("  [X]  {0}-{1}.png failed" -f $slug, $w)
      }
    }
  }
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "out: $outDir"
