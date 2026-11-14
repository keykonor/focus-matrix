$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-ai-files.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('focus-model-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $root
try {
    $original = Join-Path $root 'original'
    [IO.File]::WriteAllText($original, 'correct model bytes')
    $parts = Split-VerifiedModelBlob $original (Join-Path $root 'part') 5
    if ($parts.Count -ne 4) { throw 'The model did not split at the requested size.' }
    $destination = Join-Path $root 'installed'
    $hash = (Get-FileHash -LiteralPath $original).Hash
    Join-VerifiedModelBlob $parts $destination $hash
    if ((Get-FileHash -LiteralPath $destination).Hash -ne $hash) { throw 'Reconstructed blob differs.' }
    [IO.File]::WriteAllText($parts[1], 'wrong')
    $rejected = $false
    try { Join-VerifiedModelBlob $parts $destination $hash } catch { $rejected = $true }
    if (-not $rejected -or (Get-FileHash -LiteralPath $destination).Hash -ne $hash) { throw 'Corrupt input overwrote an existing blob.' }
    Write-Output 'PASS: model chunks round-trip and corrupt chunks cannot overwrite an existing blob.'
} finally {
    foreach ($file in Get-ChildItem -LiteralPath $root -File) { Remove-Item -LiteralPath $file.FullName }
    Remove-Item -LiteralPath $root
}
