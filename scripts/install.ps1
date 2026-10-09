# aiman installer for Windows (PowerShell).
#
#   irm https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.ps1 | iex
#
# Everything needed is bundled or installed here — no system Python/Node, no
# external terminal server.
#
# Options (environment variables):
#   AIMAN_APP_DIR   where to install the app      (default: $env:USERPROFILE\.aiman\app)
#   AIMAN_BIN_DIR   where to put the launcher     (default: $env:USERPROFILE\.aiman\bin)
#   AIMAN_REF       git ref to install            (default: main)
$ErrorActionPreference = "Stop"

$RepoSlug = "spacewalkingninja/aiman"
$Repo     = "https://github.com/$RepoSlug.git"
$AppDir   = if ($env:AIMAN_APP_DIR) { $env:AIMAN_APP_DIR } else { Join-Path $env:USERPROFILE ".aiman\app" }
$BinDir   = if ($env:AIMAN_BIN_DIR) { $env:AIMAN_BIN_DIR } else { Join-Path $env:USERPROFILE ".aiman\bin" }
$Ref      = if ($env:AIMAN_REF) { $env:AIMAN_REF } else { "main" }

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# ---- 1. Bun ---------------------------------------------------------------
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  Info "Installing Bun..."
  irm https://bun.sh/install.ps1 | iex
  $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
  $bun = Get-Command bun -ErrorAction SilentlyContinue
}
if (-not $bun) { throw "Bun installation failed. Install from https://bun.sh and re-run." }
$BunExe = $bun.Source
Info "Using Bun at $BunExe"

# ---- 2. opencode ----------------------------------------------------------
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
  Info "Installing opencode (npm: opencode-ai)..."
  try { & $BunExe install -g opencode-ai } catch {
    Write-Host "   Could not install opencode automatically. Install it from https://opencode.ai" -ForegroundColor Yellow
  }
}

# ---- 3. App source --------------------------------------------------------
function Build-IfNeeded {
  if (-not (Test-Path (Join-Path $AppDir "dist\index.html"))) {
    Info "Building the web UI..."
    Push-Location (Join-Path $AppDir "web")
    try { & $BunExe install; & $BunExe run build } finally { Pop-Location }
  }
}

$isCheckout = (Test-Path (Join-Path (Get-Location) "package.json")) -and
  ((Get-Content (Join-Path (Get-Location) "package.json") -Raw) -match '"name":\s*"aiman"')

if ($isCheckout) {
  $AppDir = (Get-Location).Path
  Info "Installing from current checkout: $AppDir"
  Build-IfNeeded
} else {
  $release = $null
  try {
    $release = Invoke-RestMethod "https://api.github.com/repos/$RepoSlug/releases/latest"
  } catch {}
  $asset = $null
  if ($release) { $asset = $release.assets | Where-Object { $_.name -like "aiman-*.zip" } | Select-Object -First 1 }

  if ($asset) {
    Info "Downloading latest release..."
    $tmp = Join-Path $env:TEMP ("aiman-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp "aiman.zip"
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
    New-Item -ItemType Directory -Force -Path (Split-Path $AppDir) | Out-Null
    Move-Item $tmp $AppDir
  } else {
    Info "Cloning $Repo ($Ref) into $AppDir..."
    if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
    New-Item -ItemType Directory -Force -Path (Split-Path $AppDir) | Out-Null
    git clone --depth 1 --branch $Ref $Repo $AppDir
  }
  Build-IfNeeded
}

# ---- 4. Launcher ----------------------------------------------------------
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$launcher = Join-Path $BinDir "aiman.cmd"
@"
@echo off
"$BunExe" "$AppDir\bin\aiman.mjs" %*
"@ | Set-Content -Encoding ASCII $launcher

Info "Installed. Launcher: $launcher"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$BinDir", "User")
  Write-Host "   Added $BinDir to your user PATH (open a new terminal to use 'aiman')."
}

Write-Host ""
Write-Host "Start it with:"
Write-Host "  aiman --open"
