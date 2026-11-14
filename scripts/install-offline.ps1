param([string]$Assets = (Split-Path -Parent $PSScriptRoot), [switch]$VerifyOnly, [string]$VerificationDirectory = $env:TEMP)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-ai-files.ps1')
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-ai-lock.json') -Raw | ConvertFrom-Json
$manifestSource = Join-Path $PSScriptRoot 'model-manifest.json'
if ((Get-FileHash -LiteralPath $manifestSource).Hash -ne $lock.manifestSha256) { throw 'Model manifest checksum mismatch.' }
$manifest = Get-Content -LiteralPath $manifestSource -Raw | ConvertFrom-Json
$runtime = Join-Path $Assets 'FocusMatrix-Offline-Ollama.zip'
if ((Get-FileHash -LiteralPath $runtime).Hash -ne $lock.runtimeSha256) { throw 'Ollama archive checksum mismatch.' }
$root = Join-Path $env:LOCALAPPDATA 'FocusMatrixLocalAI'
if ($VerifyOnly) { $root = Join-Path $VerificationDirectory ('focus-model-verify-' + [guid]::NewGuid().ToString('N')) }
$models = Join-Path $root 'models'
$blobs = (New-Item -Force -ItemType Directory -Path (Join-Path $models 'blobs')).FullName
foreach ($layer in @($manifest.config) + @($manifest.layers)) {
    $hash = $layer.digest -replace '^sha256:', ''
    if ($hash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid blob identity.' }
    if ($hash -eq $lock.manifestSha256) { continue }
    $name = 'sha256-' + $hash
    $destination = Join-Path $blobs $name
    if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination).Hash -eq $hash) { continue }
    $parts = if ($hash -eq $lock.weights) { @('01','02' | ForEach-Object { Join-Path $Assets ('FocusMatrix-Offline-Qwen.bin.' + $_) }) }
        elseif ($hash -eq $lock.projector) { @(Join-Path $Assets 'FocusMatrix-Offline-Qwen-vision.bin') }
        else { @(Join-Path $PSScriptRoot $name) }
    Join-VerifiedModelBlob $parts $destination $hash
}
$runtimeDirectory = Join-Path $root ('ollama-' + $lock.runtimeVersion)
if (-not (Test-Path -LiteralPath (Join-Path $runtimeDirectory 'ollama.exe'))) {
    $stage = (New-Item -ItemType Directory -Path (Join-Path $root ('installing-' + [guid]::NewGuid().ToString('N')))).FullName
    & tar.exe -x -f $runtime -C $stage
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $stage 'ollama.exe'))) { throw 'Could not extract the pinned Ollama runtime.' }
    [IO.Directory]::Move($stage, $runtimeDirectory)
}
$modelDirectory = (New-Item -Force -ItemType Directory -Path (Join-Path $models 'manifests/registry.ollama.ai/library/qwen3.5')).FullName
Copy-Item -LiteralPath $manifestSource -Destination (Join-Path $modelDirectory $lock.model) -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'OLLAMA-LICENSE.txt') -Destination $runtimeDirectory -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'QWEN-LICENSE.txt') -Destination $models -Force
if ($VerifyOnly) { return $root }
$setup = Start-Process -FilePath (Join-Path $PSScriptRoot 'FocusMatrix-Offline-setup.exe') -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw 'Focus Matrix installation was cancelled or failed. The verified local model is ready for a retry.' }
Write-Output 'Focus Matrix and its offline model are installed.'
