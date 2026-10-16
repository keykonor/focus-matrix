Set-StrictMode -Version Latest

if (-not ('FocusMatrixAtomicMove' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class FocusMatrixAtomicMove {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool MoveFileEx(string existing, string destination, uint flags);
    public static int Replace(string existing, string destination) {
        // Same-directory rename, replace-existing and write-through. Unlike
        // ReplaceFile this does not attempt to merge incompatible EFS metadata.
        return MoveFileEx(existing, destination, 0x1 | 0x8) ? 0 : Marshal.GetLastWin32Error();
    }
}
'@
}

function Read-UpdateJson([string]$Path) {
    try { return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json) }
    catch { throw ('JSON validation failed; original content retained: ' + [IO.Path]::GetFileName($Path)) }
}

function Write-DurableBytes([string]$Path, [byte[]]$Bytes, [bool]$Exclusive = $false) {
    $mode = if ($Exclusive) { [IO.FileMode]::CreateNew } else { [IO.FileMode]::Create }
    $stream = [IO.File]::Open($Path, $mode, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}

function Restore-PendingWrite([string]$Path) {
    $pending = $Path + '.pending-write'
    $ready = $pending + '.ready'
    if (-not [IO.File]::Exists($ready)) { return }
    if (-not [IO.File]::Exists($pending) -or
        [IO.File]::ReadAllText($ready, [Text.Encoding]::UTF8) -cne (Get-FileHash -LiteralPath $pending).Hash.ToLowerInvariant()) {
        throw 'Incomplete or damaged save journal. Original data retained; update stopped.'
    }
    Write-DurableBytes $Path ([IO.File]::ReadAllBytes($pending))
    if ((Get-FileHash -LiteralPath $Path).Hash -ne (Get-FileHash -LiteralPath $pending).Hash) { throw 'Save verification failed. Complete journal retained.' }
    [IO.File]::Delete($ready)
    [IO.File]::Delete($pending)
}

function Write-AtomicBytes([string]$Path, [byte[]]$Bytes) {
    Restore-PendingWrite $Path
    $temporary = $Path + '.tmp-' + [guid]::NewGuid().ToString('N')
    Write-DurableBytes $temporary $Bytes $true
    $code = [FocusMatrixAtomicMove]::Replace($temporary, $Path)
    if ($code -eq 0) { return }
    if ($code -notin @(17, 1175, 6002)) { throw (New-Object ComponentModel.Win32Exception($code)) }
    # EFS/redirected directories may refuse same-directory atomic renames.
    # A flushed payload and SHA-256 marker make a partial copy recoverable.
    $pending = $Path + '.pending-write'
    Write-DurableBytes $pending $Bytes
    Write-DurableBytes ($pending + '.ready') ([Text.Encoding]::ASCII.GetBytes((Get-FileHash -LiteralPath $pending).Hash.ToLowerInvariant())) $true
    Restore-PendingWrite $Path
    [IO.File]::Delete($temporary)
}

function Write-AtomicJson([string]$Path, $Value) {
    Write-AtomicBytes $Path ([Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 20 -Compress)))
}

function Read-VerifiedUpdateBackup([string]$BackupDirectory, [string]$DataDirectory) {
    $backupRoot = [IO.Path]::GetFullPath((Join-Path $DataDirectory 'backups')) + [IO.Path]::DirectorySeparatorChar
    $resolved = [IO.Path]::GetFullPath($BackupDirectory)
    if (-not $resolved.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup must be inside the application backup directory.' }
    $manifest = Read-UpdateJson (Join-Path $resolved 'manifest.json')
    foreach ($entry in $manifest.files) {
        $path = [IO.Path]::GetFullPath((Join-Path $resolved $entry.name))
        if (-not $path.StartsWith($resolved + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid backup entry path.' }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Backup checksum failed: ' + $entry.name) }
        if ($entry.name -like 'history\*' -or $entry.name -like 'history/*') {
            $live = Join-Path $DataDirectory $entry.name
            if ((Test-Path -LiteralPath $live -PathType Leaf) -and (Get-FileHash -LiteralPath $live -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'An immutable history file changed. Update stopped.' }
        }
    }
    if (-not @($manifest.files | Where-Object name -eq 'focus-matrix.json').Count) { throw 'The complete user store is missing from backup.' }
    $data = Read-UpdateJson (Join-Path $resolved 'focus-matrix.json')
    if ($null -eq $data.tasks) { throw 'Backup task data cannot be read.' }
    return $manifest
}

function Restore-UpdateSnapshot([string]$BackupDirectory, [string]$DataDirectory) {
    # Validate every backup entry before touching any active data.
    $manifest = Read-VerifiedUpdateBackup $BackupDirectory $DataDirectory
    $managed = @('focus-matrix.json', '.window-state.json', '.cloud-config.bin', '.cloud-config.previous.bin', '.focus-matrix.previous.json')
    foreach ($entry in $manifest.files | Where-Object { $managed -contains $_.name }) {
        $saved = Join-Path $BackupDirectory $entry.name
        $destination = Join-Path $DataDirectory $entry.name
        Restore-PendingWrite $destination
        if ([IO.File]::Exists($destination) -and (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $entry.sha256) { continue }
        Write-AtomicBytes $destination ([IO.File]::ReadAllBytes($saved))
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Restored snapshot checksum failed: ' + $entry.name) }
    }
    # Existing immutable history files are checked, never overwritten or deleted.
    foreach ($entry in $manifest.files | Where-Object { $_.name -like 'history\*' -or $_.name -like 'history/*' }) {
        $destination = Join-Path $DataDirectory $entry.name
        if (Test-Path -LiteralPath $destination) {
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'An immutable history file changed. Restore stopped.' }
        } else {
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            [IO.File]::Copy((Join-Path $BackupDirectory $entry.name), $destination, $false)
        }
    }
}
