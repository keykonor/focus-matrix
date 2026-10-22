param([string]$DataDirectory, [string]$InstallDirectory, [switch]$CheckOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-FocusMatrixStopped([string[]]$ProcessNames) {
    foreach ($name in $ProcessNames) {
        if ($name -in @('FocusMatrix', 'Focus Matrix', 'focus-matrix')) {
            throw 'Focus Matrix is running. Save your work and choose Exit from its tray menu, then retry. No process was terminated.'
        }
    }
}

function Get-InstallerFileSha256([string]$Path) {
    # NSIS may launch a Windows PowerShell host without the Utility hash command.
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}

function Backup-FocusMatrixInstallerData([string]$DataDirectory, [string[]]$ExecutablePaths) {
    $sources = @()
    if (Test-Path -LiteralPath $DataDirectory -PathType Container) {
        $resolvedData = (Get-Item -LiteralPath $DataDirectory).FullName.TrimEnd('\')
        foreach ($child in Get-ChildItem -LiteralPath $resolvedData -Force) {
            if ($child.Name -eq 'backups') { continue }
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked data paths require a manual backup. Installation stopped.' }
            $items = if ($child.PSIsContainer) { @(Get-ChildItem -LiteralPath $child.FullName -Recurse -Force) } else { @($child) }
            foreach ($item in $items) {
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked data paths require a manual backup. Installation stopped.' }
                if ($item.PSIsContainer) { continue }
                $sources += [pscustomobject]@{ source=$item.FullName; name=$item.FullName.Substring($resolvedData.Length + 1) }
            }
        }
    }
    $index = 0
    foreach ($exe in @($ExecutablePaths | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $exe -PathType Leaf) {
            $sources += [pscustomobject]@{ source=$exe; name=('programs\' + $index + '\' + [IO.Path]::GetFileName($exe)) }
            $index++
        }
    }
    if ($sources.Count -eq 0) { return $null }
    $backup = Join-Path $DataDirectory ('backups\nsis-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $backup
    $entries = @()
    foreach ($item in $sources) {
        $destination = Join-Path $backup $item.name
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
        Copy-Item -LiteralPath $item.source -Destination $destination -ErrorAction Stop
        $hash = Get-InstallerFileSha256 $item.source
        if ((Get-InstallerFileSha256 $destination) -ne $hash) { throw 'Backup verification failed. Installation stopped.' }
        $entries += [pscustomobject]@{ name=$item.name; source=$item.source; size=(Get-Item -LiteralPath $destination).Length; sha256=$hash }
    }
    $manifest = @{ createdAt=[DateTime]::Now.ToString('o'); kind='nsis-before-change'; files=@($entries) }
    $json = $manifest | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $backup 'manifest.json'), $json, (New-Object Text.UTF8Encoding($false)))
    return $backup
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if (-not $DataDirectory -or -not $InstallDirectory) { throw 'Installer paths are required.' }
        Assert-FocusMatrixStopped @((Get-Process -ErrorAction Stop).ProcessName)
        if ($CheckOnly) { exit 0 }
        $executables = @(
            (Join-Path $InstallDirectory 'focus-matrix.exe'),
            (Join-Path $InstallDirectory 'FocusMatrix.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\FocusMatrix\FocusMatrix.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Focus Matrix\Focus Matrix.exe')
        )
        $backup = Backup-FocusMatrixInstallerData -DataDirectory $DataDirectory -ExecutablePaths $executables
        if ($backup) { Write-Output 'Verified backup completed. Existing content was not modified.' }
        exit 0
    } catch {
        Write-Output $_.Exception.Message
        exit 1
    }
}
