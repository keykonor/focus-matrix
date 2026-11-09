param(
    [Parameter(Mandatory)] [string]$Installer,
    [switch]$RequireSignPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Release assets must be produced by GitHub Actions.' }
$root = Split-Path -Parent $PSScriptRoot
$package = [IO.File]::ReadAllText((Join-Path $root 'package.json')) | ConvertFrom-Json
$source = Get-Item -LiteralPath $Installer
$signature = Get-AuthenticodeSignature -LiteralPath $source.FullName
$signed = $signature.Status -eq 'Valid'
if (-not $signed -and $signature.Status -ne 'NotSigned') { throw 'Installer signature failed Windows verification.' }
if ($RequireSignPath) {
    if (-not $signed -or $signature.SignatureType -ne 'Authenticode' -or -not $signature.TimeStamperCertificate) {
        throw 'A valid timestamped Authenticode signature is required.'
    }
    $publisher = $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    if ($publisher -cne 'SignPath Foundation') { throw 'Unexpected installer signing publisher.' }
    if ($source.VersionInfo.ProductName -cne 'Focus Matrix' -or $source.VersionInfo.ProductVersion -cne $package.version) {
        throw 'Signed installer metadata does not match the source release.'
    }
}
$release = Join-Path $root 'outputs\release'
$null = New-Item -ItemType Directory -Path $release
$asset = Join-Path $release 'FocusMatrix-Windows-x64-setup.exe'
Copy-Item -LiteralPath $source.FullName -Destination $asset
$provenance = [ordered]@{
    version=$package.version; commit=$env:GITHUB_SHA; repository=$env:GITHUB_REPOSITORY;
    target='x86_64-pc-windows-msvc'; runner=$env:RUNNER_OS;
    buildUrl="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID";
    builtAt=[DateTime]::UtcNow.ToString('o'); signed=$signed;
    node=(& node --version); rustc=(& rustc --version);
    installerChecks='fresh install; reinstall; checksummed backups; uninstall; reinstall after uninstall; exact fixture preservation';
    sourceHistory='Original commits and versions/ tags are retained; no historical publication dates were invented.'
}
if ($signed) { $provenance.signerSubject = $signature.SignerCertificate.Subject }
[IO.File]::WriteAllText((Join-Path $release 'release-provenance.json'), ($provenance | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
$lines = @('FocusMatrix-Windows-x64-setup.exe', 'release-provenance.json') | ForEach-Object {
    (Get-FileHash -LiteralPath (Join-Path $release $_) -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_
}
[IO.File]::WriteAllText((Join-Path $release 'SHA256SUMS.txt'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
Write-Output "Release assets prepared for $($package.version)."
