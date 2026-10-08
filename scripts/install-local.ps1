[CmdletBinding()]
param(
    [string]$Executable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256([string]$filePath) {
    $stream = [System.IO.File]::OpenRead($filePath)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}

if (-not $Executable) {
    $Executable = Join-Path (Split-Path -Parent $PSScriptRoot) 'src-tauri\target\release\focus-matrix.exe'
}
$source = (Resolve-Path -LiteralPath $Executable -ErrorAction Stop).Path
# Preserve the complete source state before touching the installed program.
& node (Join-Path $PSScriptRoot 'save-version.mjs') 'Before desktop update'
if ($LASTEXITCODE -ne 0) { throw 'Source version backup failed. Update stopped.' }
$installedDirectory = Join-Path $env:LOCALAPPDATA 'Programs\FocusMatrix'
$installedExecutable = Join-Path $installedDirectory 'FocusMatrix.exe'
$legacyExecutable = Join-Path $env:LOCALAPPDATA 'Programs\Focus Matrix\Focus Matrix.exe'
$dataDirectory = Join-Path $env:APPDATA 'com.focusmatrix.desktop'
$dataFile = Join-Path $dataDirectory 'focus-matrix.json'
if ((Test-Path -LiteralPath $installedExecutable -PathType Leaf) -and
    -not (Test-Path -LiteralPath $dataFile -PathType Leaf)) {
    throw 'Existing installation has no data file. Update stopped to protect previous content.'
}

# WM_CLOSE lets the running React app flush its pending save before the backup.
$running = @(Get-CimInstance Win32_Process -Filter "name = 'FocusMatrix.exe' or name = 'Focus Matrix.exe'" |
    Where-Object { $_.ExecutablePath -eq $installedExecutable -or $_.ExecutablePath -eq $legacyExecutable })
if ($running.Count -gt 0) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class FocusMatrixUpdateWindow {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    private delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    public static void FlushBeforeUpdate(uint expectedProcessId) {
        WindowCallback close = delegate(IntPtr window, IntPtr parameter) {
            uint processId; GetWindowThreadProcessId(window, out processId);
            if (processId == expectedProcessId) {
                var title = new StringBuilder(256); GetWindowText(window, title, title.Capacity);
                if (title.ToString() == "Focus Matrix") PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
            }
            return true;
        };
        EnumWindows(delegate(IntPtr window, IntPtr parameter) {
            close(window, parameter); EnumChildWindows(window, close, parameter); return true;
        }, IntPtr.Zero);
    }
}
'@
    foreach ($process in $running) { [FocusMatrixUpdateWindow]::FlushBeforeUpdate([uint32]$process.ProcessId) }
    Start-Sleep -Milliseconds 1200
}

# A failed copy or hash check throws here and prevents the executable update.
$backupDirectory = & (Join-Path $PSScriptRoot 'backup-before-update.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $backupDirectory 'manifest.json'))) {
    throw 'Backup manifest is missing. Update stopped.'
}

foreach ($process in $running) {
    if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
}
foreach ($name in @('focus-matrix.json', '.window-state.json', '.cloud-config.bin')) {
    $saved = Join-Path $backupDirectory $name
    if (-not (Test-Path -LiteralPath $saved -PathType Leaf)) { continue }
    $live = Join-Path $dataDirectory $name
    if (-not (Test-Path -LiteralPath $live -PathType Leaf) -or
        (Get-Sha256 $saved) -ne (Get-Sha256 $live)) {
        throw "User data changed after backup. Update stopped: $name"
    }
}
New-Item -ItemType Directory -Path $installedDirectory -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $installedExecutable -Force -ErrorAction Stop
if ((Get-Sha256 $source) -ne (Get-Sha256 $installedExecutable)) {
    throw 'Installed executable checksum mismatch. Restore from backup.'
}
if (Test-Path -LiteralPath $legacyExecutable -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination $legacyExecutable -Force -ErrorAction Stop
}

$shortcutPath = Join-Path $env:USERPROFILE 'Desktop\Focus Matrix.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedExecutable
$shortcut.WorkingDirectory = $installedDirectory
$shortcut.IconLocation = "$installedExecutable,0"
$shortcut.Arguments = ''
$shortcut.Description = 'Focus Matrix desktop task notes'
$shortcut.Save()

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runValues = Get-ItemProperty -Path $runKey -Name 'Focus Matrix' -ErrorAction SilentlyContinue
$autostartEntry = if ($null -ne $runValues) { $runValues.'Focus Matrix' } else { $null }
if ($autostartEntry) {
    Set-ItemProperty -Path $runKey -Name 'Focus Matrix' -Value "$installedExecutable --autostart"
}

if ($running.Count -gt 0) {
    Start-Process -FilePath $installedExecutable -WindowStyle Normal | Out-Null
}
Write-Output "backup=$backupDirectory"
Write-Output "installed=$installedExecutable"
