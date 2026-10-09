# aiman installer for Windows (PowerShell).
#
#   irm https://raw.githubusercontent.com/spacewalkingninja/aiman/main/scripts/install.ps1 | iex
#
# Options (environment variables):
#   AIMAN_APP_DIR   where to install the app      (default: $env:USERPROFILE\.aiman\app)
#   AIMAN_BIN_DIR   where to put the launcher     (default: $env:USERPROFILE\.aiman\bin)
#   AIMAN_REF       git ref to install            (default: main)
$ErrorActionPreference = "Stop"

$Repo   = "https://github.com/spacewalkingninja/aiman.git"
$AppDir = if ($env:AIMAN_APP_DIR) { $env:AIMAN_APP_DIR } else { Join-Path $env:USERPROFILE ".aiman\app" }
$BinDir = if ($env:AIMAN_BIN_DIR) { $env:AIMAN_BIN_DIR } else { Join-Path $env:USERPROFILE ".aiman\bin" }
$Ref    = if ($env:AIMAN_REF) { $env:AIMAN_REF } else { "main" }

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

# ---- 2. Source code -------------------------------------------------------
if ((Test-Path (Join-Path (Get-Location) "package.json")) -and
    (Get-Content (Join-Path (Get-Location) "package.json") -Raw) -match '"name":\s*"aiman"') {
  $AppDir = (Get-Location).Path
  Info "Installing from current checkout: $AppDir"
} elseif (Test-Path (Join-Path $AppDir ".git")) {
  Info "Updating existing install in $AppDir..."
  git -C $AppDir fetch --depth 1 origin $Ref
  git -C $AppDir checkout -q FETCH_HEAD
} else {
  Info "Cloning $Repo ($Ref) into $AppDir..."
  New-Item -ItemType Directory -Force -Path (Split-Path $AppDir) | Out-Null
  git clone --depth 1 --branch $Ref $Repo $AppDir
}

# ---- 3. Build web UI ------------------------------------------------------
Info "Installing web dependencies and building the UI..."
Push-Location (Join-Path $AppDir "web")
try { & $BunExe install; & $BunExe run build } finally { Pop-Location }

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
