param(
    [string]$Repository = (Split-Path -Parent $PSScriptRoot),
    [string]$EventName = $env:GITHUB_EVENT_NAME,
    [string]$Ref = $env:GITHUB_REF,
    [string]$Publish = $env:RELEASE_PUBLISH,
    [string]$Tag = $env:RELEASE_TAG,
    [string]$Commit = $env:GITHUB_SHA
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tagPush = $EventName -eq 'push' -and $Ref.StartsWith('refs/tags/v')
$manualPublication = $EventName -eq 'workflow_dispatch' -and $Publish -eq 'true'
if (-not ($tagPush -or $manualPublication)) {
    Write-Output 'PASS: source verification only; no release ref required.'
    return
}

if ($tagPush) {
    $refTag = $Ref.Substring('refs/tags/'.Length)
    if ($Tag -and $Tag -cne $refTag) { throw 'Release tag and pushed ref differ.' }
    $Tag = $refTag
}
$version = ([IO.File]::ReadAllText((Join-Path $Repository 'package.json')) | ConvertFrom-Json).version
if ($Tag -cne "v$version") { throw 'Release tag and source version differ.' }
if ($Commit -cnotmatch '^[a-f0-9]{40}$') { throw 'A complete tested commit SHA is required for publication.' }

$headCommit = & git -C $Repository rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0 -or $headCommit -cne $Commit) { throw 'Checked-out source differs from the tested commit.' }
$existing = @(& git -C $Repository for-each-ref '--format=%(refname)' "refs/tags/$Tag")
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the existing release tag.' }
if ($existing -ccontains "refs/tags/$Tag") {
    $tagCommit = & git -C $Repository rev-parse --verify "refs/tags/$Tag^{commit}"
    if ($LASTEXITCODE -ne 0 -or $tagCommit -cne $Commit) { throw 'Existing source tag does not match the tested commit.' }
}
Write-Output 'PASS: release version and source commit validated; existing tags remain unchanged.'
