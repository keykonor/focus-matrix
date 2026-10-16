[CmdletBinding()]
param(
    [string]$Executable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-data-functions.ps1')

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

# WM_CLOSE carries a nonce-backed update request. No fixed delay or forced
# shutdown is allowed: the app saves without rollover, acknowledges and exits.
$updateNonce = [guid]::NewGuid().ToString('N')
$running = @(Get-CimInstance Win32_Process -Filter "name = 'FocusMatrix.exe' or name = 'Focus Matrix.exe'" |
    Where-Object { $_.ExecutablePath -eq $installedExecutable -or $_.ExecutablePath -eq $legacyExecutable })
if ($running.Count -gt 0) {
    Write-AtomicJson (Join-Path $dataDirectory '.update-request.json') @{ nonce=$updateNonce; protocol=2 }
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
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while (@($running | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 200
    }
    $ackPath = Join-Path $dataDirectory '.update-ready.json'
    $ack = if (Test-Path -LiteralPath $ackPath) { Read-UpdateJson $ackPath } else { $null }
    if (@($running | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }).Count -gt 0 -or $null -eq $ack -or $ack.nonce -ne $updateNonce -or $ack.protocol -ne 2 -or -not (@($running.ProcessId) -contains $ack.pid)) {
        Write-AtomicJson (Join-Path $dataDirectory '.update-request.json') @{ nonce=$updateNonce; cancelled=$true }
        throw 'No confirmed save-and-exit acknowledgement. Update stopped without killing the app. For an older version, save and exit from the tray, then retry.'
    }
}

# A failed copy or hash check throws here and prevents the executable update.
$backupDirectory = & (Join-Path $PSScriptRoot 'backup-before-update.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $backupDirectory 'manifest.json'))) {
    throw 'Backup manifest is missing. Update stopped.'
}

foreach ($name in @('focus-matrix.json', '.window-state.json', '.cloud-config.bin', '.cloud-config.previous.bin')) {
    $saved = Join-Path $backupDirectory $name
    if (-not (Test-Path -LiteralPath $saved -PathType Leaf)) { continue }
    $live = Join-Path $dataDirectory $name
    if (-not (Test-Path -LiteralPath $live -PathType Leaf) -or
        (Get-Sha256 $saved) -ne (Get-Sha256 $live)) {
        throw "User data changed after backup. Update stopped: $name"
    }
}
$null = Read-VerifiedUpdateBackup $backupDirectory $dataDirectory
$newProcess = $null
try {
    New-Item -ItemType Directory -Path $installedDirectory -Force | Out-Null
    Write-AtomicBytes $installedExecutable ([IO.File]::ReadAllBytes($source))
    if ((Get-Sha256 $source) -ne (Get-Sha256 $installedExecutable)) { throw 'Installed executable checksum mismatch.' }
    # Restore the entire exact current snapshot; never merge an older task list
    # over it, or initialize defaults after an update.
    Restore-UpdateSnapshot $backupDirectory $dataDirectory
    Write-AtomicJson (Join-Path $dataDirectory '.update-session.json') @{
        nonce=$updateNonce; phase='restoring'; backupName=(Split-Path -Leaf $backupDirectory); guardDate=(Get-Date -Format 'yyyy-MM-dd')
    }
    if (Test-Path -LiteralPath $legacyExecutable -PathType Leaf) { Write-AtomicBytes $legacyExecutable ([IO.File]::ReadAllBytes($source)) }
    $newProcess = Start-Process -FilePath $installedExecutable -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    $verified = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $receiptPath = Join-Path $dataDirectory '.update-restored.json'
        if (Test-Path -LiteralPath $receiptPath) {
            $receipt = Read-UpdateJson $receiptPath
            $session = Read-UpdateJson (Join-Path $dataDirectory '.update-session.json')
            if ($receipt.nonce -eq $updateNonce -and $receipt.verified -and $receipt.pid -eq $newProcess.Id -and $session.phase -eq 'verified' -and $session.nonce -eq $updateNonce) { $verified=$true; break }
        }
        if ($newProcess.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $verified) { throw 'New app did not verify the complete saved snapshot. Rolling back.' }
} catch {
    $failure = $_
    # Only stop our unverified startup process, whose editing UI is still locked.
    if ($null -ne $newProcess -and -not $newProcess.HasExited) { Stop-Process -Id $newProcess.Id -Force -ErrorAction Stop }
    $failedDirectory = Join-Path $backupDirectory ('failed-startup-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $failedDirectory | Out-Null
    if (Test-Path -LiteralPath $dataFile) { Copy-Item -LiteralPath $dataFile -Destination (Join-Path $failedDirectory 'focus-matrix.json') }
    Restore-UpdateSnapshot $backupDirectory $dataDirectory
    $oldExe = Join-Path $backupDirectory 'FocusMatrix.exe'
    if (Test-Path -LiteralPath $oldExe) { Write-AtomicBytes $installedExecutable ([IO.File]::ReadAllBytes($oldExe)) }
    $oldLegacyExe = Join-Path $backupDirectory 'Focus Matrix.exe'
    if (Test-Path -LiteralPath $oldLegacyExe) { Write-AtomicBytes $legacyExecutable ([IO.File]::ReadAllBytes($oldLegacyExe)) }
    Write-AtomicJson (Join-Path $dataDirectory '.update-session.json') @{
        nonce=$updateNonce; phase='rolled-back'; backupName=(Split-Path -Leaf $backupDirectory); guardDate=(Get-Date -Format 'yyyy-MM-dd')
    }
    if (Test-Path -LiteralPath $oldExe) { Start-Process -FilePath $installedExecutable -WindowStyle Hidden | Out-Null }
    throw $failure
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

Write-Output 'snapshot=verified-before-editing; current-version-restored; rollback-enabled'
Write-Output "backup=$backupDirectory"
Write-Output "installed=$installedExecutable"
