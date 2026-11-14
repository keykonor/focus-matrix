param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$OutputDirectory, [Parameter(Mandatory)][string]$WorkDirectory, [string]$LocalModels)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-ai-files.ps1')
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-ai-lock.json') -Raw | ConvertFrom-Json
$outputRoot = (New-Item -ItemType Directory -Force -Path $OutputDirectory).FullName
$work = (New-Item -ItemType Directory -Path (Join-Path $WorkDirectory ('offline-' + [guid]::NewGuid().ToString('N'))) -Force).FullName
$stage = (New-Item -ItemType Directory -Path (Join-Path $work 'bootstrap')).FullName
$registry = 'https://registry.ollama.ai/v2/library/qwen3.5'
function Get-Verified([string]$Url, [string]$Path, [string]$Sha, [string]$LocalSource) {
    if ($LocalSource -and (Test-Path -LiteralPath $LocalSource -PathType Leaf)) {
        Copy-Item -LiteralPath $LocalSource -Destination $Path
    } else {
        & curl.exe --fail --silent --show-error --location --retry 3 --output $Path $Url
        if ($LASTEXITCODE -ne 0) { throw 'Downloading a pinned offline dependency failed.' }
    }
    if ((Get-FileHash -LiteralPath $Path).Hash -ne $Sha) { throw "SHA-256 mismatch for $(Split-Path -Leaf $Path)." }
}
$manifest = Join-Path $stage 'model-manifest.json'
$localManifest = if ($LocalModels) { Join-Path $LocalModels ('manifests/registry.ollama.ai/library/qwen3.5/' + $lock.model) }
if ($localManifest -and (Test-Path -LiteralPath $localManifest) -and (Get-FileHash -LiteralPath $localManifest).Hash -ne $lock.manifestSha256) { $localManifest = $null }
Get-Verified "$registry/manifests/$($lock.model)" $manifest $lock.manifestSha256 $localManifest
$spec = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
foreach ($layer in @($spec.config) + @($spec.layers)) {
    $hash = $layer.digest -replace '^sha256:', ''
    if ($hash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid blob identity.' }
    if ($hash -eq $lock.manifestSha256) { continue }
    $name = 'sha256-' + $hash
    $local = if ($LocalModels) { Join-Path $LocalModels "blobs/$name" }
    $path = if ($hash -eq $lock.weights) { Join-Path $work $name }
        elseif ($hash -eq $lock.projector) { Join-Path $outputRoot 'FocusMatrix-Offline-Qwen-vision.bin' }
        else { Join-Path $stage $name }
    Get-Verified "$registry/blobs/$($layer.digest)" $path $hash $local
    if ($hash -eq $lock.weights) {
        $null = Split-VerifiedModelBlob $path (Join-Path $outputRoot 'FocusMatrix-Offline-Qwen.bin')
        Remove-Item -LiteralPath $path
    }
}
$required = @('FocusMatrix-Offline-Qwen.bin.01','FocusMatrix-Offline-Qwen.bin.02','FocusMatrix-Offline-Qwen-vision.bin')
foreach ($name in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $outputRoot $name) -PathType Leaf)) { throw "Missing offline asset $name." }
}
$runtime = Join-Path $outputRoot 'FocusMatrix-Offline-Ollama.zip'
if (-not (Test-Path -LiteralPath $runtime) -or (Get-FileHash -LiteralPath $runtime).Hash -ne $lock.runtimeSha256) {
    Get-Verified "https://github.com/ollama/ollama/releases/download/v$($lock.runtimeVersion)/ollama-windows-amd64.zip" $runtime $lock.runtimeSha256
}
& curl.exe --fail --silent --show-error --location --output (Join-Path $stage 'OLLAMA-LICENSE.txt') "https://raw.githubusercontent.com/ollama/ollama/v$($lock.runtimeVersion)/LICENSE"
if ($LASTEXITCODE -ne 0) { throw 'Missing Ollama license.' }
$modelLicense = $spec.layers | Where-Object { $_.mediaType -eq 'application/vnd.ollama.image.license' }
Copy-Item -LiteralPath (Join-Path $stage ($modelLicense.digest -replace ':','-')) -Destination (Join-Path $stage 'QWEN-LICENSE.txt')
Copy-Item -LiteralPath $Installer -Destination (Join-Path $stage 'FocusMatrix-Offline-setup.exe')
foreach ($name in 'install-offline.cmd','install-offline.ps1','local-ai-files.ps1','local-ai-lock.json') {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage
}
Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/offline-install.txt') -Destination (Join-Path $stage 'README.txt')
& tar.exe -a -c -f (Join-Path $outputRoot 'FocusMatrix-Windows-x64-offline.zip') -C $stage .
if ($LASTEXITCODE -ne 0) { throw 'Could not package offline installer.' }
