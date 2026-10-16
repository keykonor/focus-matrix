Set-StrictMode -Version Latest

function Read-UpdateJson([string]$Path) {
    try { return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json) }
    catch { throw ('JSON validation failed; original content retained: ' + [IO.Path]::GetFileName($Path)) }
}

function Write-AtomicBytes([string]$Path, [byte[]]$Bytes) {
    $temporary = $Path + '.tmp-' + [guid]::NewGuid().ToString('N')
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    if (Test-Path -LiteralPath $Path -PathType Leaf) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
    else { [IO.File]::Move($temporary, $Path) }
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
