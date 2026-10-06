[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Sha256([string]$filePath) {
    $stream = [System.IO.File]::OpenRead($filePath)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
}

$dataDirectory = Join-Path $env:APPDATA 'com.focusmatrix.desktop'
$backupRoot = Join-Path $dataDirectory 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$backupDirectory = Join-Path $backupRoot "$stamp-$([guid]::NewGuid().ToString('N').Substring(0, 6))"

$sources = @(
    [pscustomobject]@{ Path = (Join-Path $dataDirectory 'focus-matrix.json'); Name = 'focus-matrix.json' },
    [pscustomobject]@{ Path = (Join-Path $dataDirectory '.window-state.json'); Name = '.window-state.json' },
    [pscustomobject]@{ Path = (Join-Path $dataDirectory '.cloud-config.bin'); Name = '.cloud-config.bin' },
    [pscustomobject]@{ Path = (Join-Path $dataDirectory '.cloud-config.previous.bin'); Name = '.cloud-config.previous.bin' },
    [pscustomobject]@{ Path = (Join-Path $env:LOCALAPPDATA 'Programs\FocusMatrix\FocusMatrix.exe'); Name = 'FocusMatrix.exe' },
    [pscustomobject]@{ Path = (Join-Path $env:LOCALAPPDATA 'Programs\Focus Matrix\Focus Matrix.exe'); Name = 'Focus Matrix.exe' }
)

$historyDirectory = Join-Path $dataDirectory 'history'
if (Test-Path -LiteralPath $historyDirectory -PathType Container) {
    foreach ($historyFile in Get-ChildItem -LiteralPath $historyDirectory -Recurse -File -ErrorAction Stop) {
        $relativeName = $historyFile.FullName.Substring($historyDirectory.Length + 1)
        $sources += [pscustomobject]@{ Path = $historyFile.FullName; Name = (Join-Path 'history' $relativeName) }
    }
}

New-Item -ItemType Directory -Path $backupRoot -Force -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
$savedFiles = @()
foreach ($item in $sources) {
    if (-not (Test-Path -LiteralPath $item.Path -PathType Leaf)) { continue }
    $destination = Join-Path $backupDirectory $item.Name
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force -ErrorAction Stop | Out-Null
    Copy-Item -LiteralPath $item.Path -Destination $destination -ErrorAction Stop
    $sourceHash = Get-Sha256 $item.Path
    $backupHash = Get-Sha256 $destination
    if ($sourceHash -ne $backupHash) { throw "Backup checksum mismatch: $($item.Name)" }
    $savedFiles += [pscustomobject]@{
        name = $item.Name
        source = $item.Path
        size = (Get-Item -LiteralPath $destination).Length
        sha256 = $backupHash
    }
}
if ($savedFiles.Count -eq 0) { throw 'No Focus Matrix files were found to back up. Update stopped.' }

$manifest = [pscustomobject]@{
    createdAt = (Get-Date).ToString('o')
    files = $savedFiles
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupDirectory 'manifest.json') -Encoding UTF8 -ErrorAction Stop
Write-Output $backupDirectory
