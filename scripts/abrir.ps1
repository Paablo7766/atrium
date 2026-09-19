# Atrium Journal launcher — used by the .bat files
$ErrorActionPreference = 'Continue'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root
try { $Host.UI.RawUI.WindowTitle = 'Atrium Journal' } catch {}

$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"

function Get-ProjectProcesses {
  $marker = [regex]::Escape($Root.Path)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match $marker -and
    $_.Name -match '^(electron|node)\.exe$'
  }
}

function Focus-Atrium {
  $electrons = @(Get-ProjectProcesses | Where-Object { $_.Name -eq 'electron.exe' })
  foreach ($item in $electrons) {
    try {
      $proc = Get-Process -Id $item.ProcessId -ErrorAction Stop
      if ($proc.MainWindowHandle -eq [IntPtr]::Zero) { continue }
      if (-not ('AtriumWin' -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AtriumWin {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
      }
      [AtriumWin]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
      [AtriumWin]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
      $shell = New-Object -ComObject WScript.Shell
      $shell.AppActivate($item.ProcessId) | Out-Null
      return $true
    } catch {}
  }
  return $false
}

function Stop-Stale {
  Get-ProjectProcesses | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ''
Write-Host '  Atrium Journal'
Write-Host "  $Root"
Write-Host ''

if (Focus-Atrium) {
  Write-Host '  Ya estaba abierto. Trayendo la ventana al frente.'
  Start-Sleep -Seconds 2
  exit 0
}

Stop-Stale

$npm = 'C:\Program Files\nodejs\npm.cmd'
if (-not (Test-Path $npm)) { $npm = 'npm.cmd' }
if (-not (Get-Command $npm -ErrorAction SilentlyContinue)) {
  Write-Host '  No se encontro Node.js / npm.'
  Write-Host '  Instala Node.js LTS desde https://nodejs.org e inicia sesion de nuevo.'
  Read-Host '  Enter para cerrar'
  exit 1
}

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Host '  Instalando dependencias la primera vez...'
  & $npm install
  if ($LASTEXITCODE -ne 0) {
    Read-Host '  Fallo npm install. Enter para cerrar'
    exit 1
  }
}

Write-Host '  Abriendo la app. No cierres esta ventana mientras operas.'
Write-Host ''

& $npm run dev
$code = $LASTEXITCODE

Write-Host ''
Write-Host '  Atrium se ha cerrado.'
Read-Host '  Enter para cerrar'
exit $code
