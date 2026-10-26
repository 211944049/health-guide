# Deploy the static site to the Alibaba Cloud Hong Kong server over SSH.
#
# WHY a release directory + symlink instead of overwriting in place:
#   `tar -xzf` into a live docroot means visitors can see a half-extracted site.
#   Extract into releases/<stamp>/, then flip the `current` symlink -- that swap is
#   atomic, and the previous release stays around for instant rollback.
#
# ASCII ONLY. PowerShell 5.1 reads .ps1 as ANSI unless it has a BOM; Chinese
# comments break string parsing (hit that twice in this project already).
#
# USAGE
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-hk.ps1 -Server 1.2.3.4
#   ... -Server 1.2.3.4 -User root -SshKey C:\path\to\id_ed25519
#
# You will be prompted for the root password unless -SshKey is given.

param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'root',
  [string]$Root = '/var/www/costlifehealth',
  [string]$DistDir = 'dist',
  [string]$SshKey = '',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# Deliberately NOT using $args -- it is an automatic variable in PowerShell.
$sshArgs  = @('-o', 'StrictHostKeyChecking=accept-new')
$scpArgs  = @('-o', 'StrictHostKeyChecking=accept-new')
if ($SshKey -ne '') {
  $sshArgs += @('-i', $SshKey)
  $scpArgs += @('-i', $SshKey)
}

$proj = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $proj $DistDir
if (-not (Test-Path $dist)) { throw "dist not found: $dist (run build first)" }

if (-not $SkipBuild) {
  Write-Host '[1/5] building...'
  Push-Location $proj
  & .\run.cmd build | Out-Null
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'build failed' }
  Pop-Location
  Write-Host '      build ok'
}

# _headers is a Cloudflare/Netlify config file; nginx ignores it. Excluding it so
# it does not get published as a downloadable file.
Write-Host '[2/5] packing...'
$tar = Join-Path $env:TEMP 'costlifehealth-site.tar.gz'
if (Test-Path $tar) { Remove-Item $tar -Force }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Push-Location $dist
try {
  & tar -czf $tar --exclude=_headers .
  if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
} finally { Pop-Location }
$sizeMb = [math]::Round((Get-Item $tar).Length / 1MB, 1)
Write-Host "      $sizeMb MB"

Write-Host '[3/5] uploading...'
& scp @scpArgs $tar "${User}@${Server}:/tmp/costlifehealth-site.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'scp failed' }

Write-Host '[4/5] activating release...'
$remote = @"
set -e
DEST="$Root/releases/$stamp"
mkdir -p "`$DEST"
tar -xzf /tmp/costlifehealth-site.tar.gz -C "`$DEST"
rm -f /tmp/costlifehealth-site.tar.gz

# No chown: nginx workers only need read access, and the distro user differs
# (www-data on Ubuntu/Debian, nginx on Alibaba Cloud Linux/CentOS). a+rX makes
# files world-readable and directories traversable, which works on all of them.
chmod -R a+rX "`$DEST"

ln -sfn "`$DEST" "$Root/current"

# Keep the last 5 releases, delete older ones.
ls -1dt $Root/releases/* | tail -n +6 | xargs -r rm -rf

nginx -t
systemctl reload nginx
echo "ACTIVE=`$(readlink -f $Root/current)"
"@
$remoteFile = Join-Path $env:TEMP 'deploy-hk-remote.sh'
# CRLF KILLS THIS. PowerShell here-strings carry Windows line endings, and bash
# then fails with "$'\r': command not found". Normalize to LF and write without
# a BOM (a BOM would also upset the first line).
$remoteLf = $remote -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($remoteFile, $remoteLf, (New-Object System.Text.UTF8Encoding($false)))
& scp @scpArgs $remoteFile "${User}@${Server}:/tmp/deploy-hk.sh"
if ($LASTEXITCODE -ne 0) { throw 'scp of remote script failed' }
& ssh @sshArgs "${User}@${Server}" 'bash /tmp/deploy-hk.sh'
if ($LASTEXITCODE -ne 0) { throw 'remote deploy failed' }
Remove-Item $remoteFile -Force -ErrorAction SilentlyContinue

Write-Host '[5/5] verifying...'
$null = & ssh @sshArgs "${User}@${Server}" "curl -sS -o /dev/null -w '%{http_code} %{time_total}s' http://127.0.0.1/ || true"
Write-Host '      (localhost check above; run verify after DNS is switched)'
Write-Host ''
Write-Host "done. release: $stamp"
Write-Host "rollback: ssh ${User}@${Server} `"ln -sfn `$(ls -1dt $Root/releases/* | sed -n 2p) $Root/current`""
