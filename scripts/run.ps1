$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$NodeHome = Join-Path $env:LOCALAPPDATA "job-finder\node"
if (Test-Path (Join-Path $NodeHome "node.exe")) {
  $env:Path = "$NodeHome;" + $env:Path
}
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
$Port = 3000
if ($env:PORT) { $Port = $env:PORT }
$Url = "http://127.0.0.1:$Port"

function Get-Corepack {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $null }
  $cmd = Join-Path (Split-Path $node.Source) "corepack.cmd"
  if (Test-Path $cmd) { return $cmd }
  return $null
}

$corepack = Get-Corepack
if (-not $corepack) {
  Write-Host "Dependencies are missing. Double-click Install Job Finder.bat first."
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing project packages..."
  & $corepack yarn install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) {
  $up = $false
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $up = $true
  } catch {}
  if (-not $up) {
    Start-Process -FilePath $ollama.Source -ArgumentList "serve" -WindowStyle Hidden
  }
}

try {
  Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
  Write-Host "Opening $Url"
  Start-Process $Url
  exit 0
} catch {}

$watcher = @"
`$url = '$Url'
for (`$i = 0; `$i -lt 60; `$i++) {
  try {
    Invoke-WebRequest -Uri `$url -UseBasicParsing -TimeoutSec 20 | Out-Null
    Start-Process `$url
    exit 0
  } catch {
    Start-Sleep -Seconds 1
  }
}
"@
Start-Process -WindowStyle Hidden -FilePath "powershell" -ArgumentList @("-NoProfile", "-Command", $watcher) | Out-Null

Write-Host "Starting Job Finder at $Url"
Write-Host "Leave this window open. Closing it stops the app."
& $corepack yarn dev --port $Port
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
exit 0
