$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$NodeMin = [version]"20.9.0"
$NodeHome = Join-Path $env:LOCALAPPDATA "job-finder\node"
$YarnVersion = "4.18.1"
if ($env:OLLAMA_MODEL) { $OllamaModel = $env:OLLAMA_MODEL } else { $OllamaModel = "qwen2.5:1.5b" }

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-MachineArch {
  $arch = $env:PROCESSOR_ARCHITEW6432
  if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
  if ($arch -eq "ARM64") { return "arm64" }
  if ($arch -eq "AMD64") { return "x64" }
  throw "Job Finder needs 64-bit Windows."
}

function Test-NodeOk([string]$NodeExe) {
  if (-not (Test-Path $NodeExe)) { return $false }
  $raw = & $NodeExe -p "process.versions.node"
  if (-not $raw) { return $false }
  $raw = ($raw -split "-")[0].Trim()
  return ([version]$raw) -ge $NodeMin
}

function Get-NodeCommand {
  $local = Join-Path $NodeHome "node.exe"
  if (Test-NodeOk $local) { return $local }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (Test-Path $local) { return $local }
  return $null
}

function Install-Node {
  $current = Get-NodeCommand
  if ($current -and (Test-NodeOk $current)) {
    $dir = Split-Path $current
    $env:Path = "$dir;" + $env:Path
    Write-Step "Node.js $(& $current -p 'process.versions.node') is already installed."
    return
  }

  $arch = Get-MachineArch
  Write-Step "Downloading the Node.js LTS release ($arch)"
  $index = (Invoke-WebRequest -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing).Content
  $ver = $null
  foreach ($part in ($index -split '\{')) {
    if ($part -match '"lts":"' -and $part -match '"version":"(v[^"]+)"') {
      $ver = $Matches[1]
      break
    }
  }
  if (-not $ver) { throw "Could not find a Node.js LTS release." }

  $name = "node-$ver-win-$arch.zip"
  $tmp = Join-Path $env:TEMP ("job-finder-node-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $sumFile = Join-Path $tmp "SHASUMS256.txt"
    $zip = Join-Path $tmp $name
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt" -OutFile $sumFile -UseBasicParsing
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/$name" -OutFile $zip -UseBasicParsing
    $expected = $null
    foreach ($line in Get-Content $sumFile) {
      if ($line -like "*$name") {
        $expected = (($line -split '\s+')[0]).ToLower()
        break
      }
    }
    if (-not $expected) { throw "No checksum listed for $name" }
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
    if ($actual -ne $expected) { throw "Checksum mismatch for $name" }

    Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp "unpacked") -Force
    $inner = Join-Path $tmp "unpacked\node-$ver-win-$arch"
    if (Test-Path $NodeHome) { Remove-Item $NodeHome -Recurse -Force }
    $parent = Split-Path $NodeHome
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
    Move-Item $inner $NodeHome
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }

  $env:Path = "$NodeHome;" + $env:Path
  $installed = Join-Path $NodeHome "node.exe"
  if (-not (Test-NodeOk $installed)) { throw "Node.js installation failed." }
  Write-Step "Installed Node.js $(& $installed -p 'process.versions.node')."
}

function Get-Corepack {
  $node = Get-NodeCommand
  if (-not $node) { throw "Node.js is not installed." }
  $dir = Split-Path $node
  $cmd = Join-Path $dir "corepack.cmd"
  if (-not (Test-Path $cmd)) { throw "Corepack was not found next to Node.js." }
  return $cmd
}

function Install-YarnAndPackages {
  $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
  $corepack = Get-Corepack
  Write-Step "Preparing Yarn $YarnVersion"
  & $corepack yarn --version
  if ($LASTEXITCODE -ne 0) {
    $npm = Join-Path (Split-Path $corepack) "npm.cmd"
    & $npm install -g corepack@latest
    if ($LASTEXITCODE -ne 0) { throw "Could not install Corepack." }
    & $corepack yarn --version
    if ($LASTEXITCODE -ne 0) { throw "Yarn $YarnVersion could not be started." }
  }
  Write-Step "Installing project packages"
  & $corepack yarn install
  if ($LASTEXITCODE -ne 0) { throw "yarn install failed." }
}

function Test-OllamaUp {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Install-Ollama {
  Write-Step "Checking Ollama (ranks roles; the site still opens without it)"
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollama) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
      Write-Warning "Install Ollama from https://ollama.com if you want role ranking."
      return
    }
    & winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  }
  if (-not $ollama) {
    Write-Warning "Ollama is not available. Role ranking stays off until it is installed."
    return
  }
  if (-not (Test-OllamaUp)) {
    Start-Process -FilePath $ollama.Source -ArgumentList "serve" -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      if (Test-OllamaUp) { $ready = $true; break }
      Start-Sleep -Seconds 1
    }
    if (-not $ready) {
      Write-Warning "Ollama is installed but not running. Start it, then run: ollama pull $OllamaModel"
      return
    }
  }
  Write-Step "Downloading ranking model $OllamaModel (about 1 GB)"
  & $ollama.Source pull $OllamaModel
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not download $OllamaModel."
  }
}

try {
  Write-Step "Job Finder setup"
  Write-Host "Operating system: windows ($(Get-MachineArch))"
  Write-Host "This installs Node.js $NodeMin or newer, Yarn $YarnVersion, project packages, and Ollama for ranking."
  Write-Host "The SQLite database is created automatically at data/jobs.db."
  if (-not (Test-Path (Join-Path $Root "package.json"))) {
    throw "package.json was not found in $Root"
  }
  Install-Node
  Install-YarnAndPackages
  Install-Ollama
  Write-Step "Setup finished."
  Write-Host 'Next: double-click "Open Job Finder.bat". Leave that window open while you use the app.'
  exit 0
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
