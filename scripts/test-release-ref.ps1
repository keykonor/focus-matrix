param([string]$Validator = (Join-Path $PSScriptRoot 'validate-release-ref.ps1'))

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ('outputs/release-ref-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot -Force
$hostExecutable = (Get-Process -Id $PID).Path
$Validator = [IO.Path]::GetFullPath($Validator)
$workflowWrapper = Join-Path $testRoot 'invoke-workflow.ps1'
# Match Actions' pwsh exit handling: a successful script must not leave a
# failed native-command status behind (for example, an absent new tag).
[IO.File]::WriteAllText($workflowWrapper, @'
param([string]$Validator, [string]$Repository, [string]$EventName, [string]$Ref, [string]$Publish, [string]$Tag, [string]$Commit)
$ErrorActionPreference = 'Stop'
& $Validator -Repository $Repository -EventName $EventName -Ref $Ref -Publish $Publish -Tag $Tag -Commit $Commit
if (Test-Path variable:LASTEXITCODE) { exit $LASTEXITCODE }
'@)

function Invoke-FixtureGit {
    param([string[]]$Arguments)
    $result = & git -C $testRoot @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Git fixture setup failed.' }
    return $result
}

Invoke-FixtureGit @('init', '--quiet')
Invoke-FixtureGit @('-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '--allow-empty', '-m', 'first')
Invoke-FixtureGit @('tag', 'v0.2.0')
Invoke-FixtureGit @('-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '--allow-empty', '-m', 'second')
$commit = Invoke-FixtureGit @('rev-parse', 'HEAD')
# Include an annotated release tag to exercise peeling to its commit.
Invoke-FixtureGit @('-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'tag', '-a', 'v0.3.0', '-m', 'fixture')
Invoke-FixtureGit @('tag', 'v0.4.0')
[IO.File]::WriteAllText((Join-Path $testRoot 'package.json'), '{"version":"0.3.0"}')

$cases = @(
    @{ Name='PR accepts an older existing release tag'; Event='pull_request'; Ref='refs/pull/1/merge'; Publish='false'; Tag='v0.2.0'; Pass=$true },
    @{ Name='branch push accepts an older existing release tag'; Event='push'; Ref='refs/heads/feature'; Publish='false'; Tag='v0.2.0'; Pass=$true },
    @{ Name='non-publishing manual check accepts an older tag'; Event='workflow_dispatch'; Ref='refs/heads/main'; Publish='false'; Tag='v0.2.0'; Pass=$true },
    @{ Name='publishing rejects an existing tag at another commit'; Event='workflow_dispatch'; Ref='refs/heads/main'; Publish='true'; Tag='v0.2.0'; Version='0.2.0'; Pass=$false },
    @{ Name='tag push rejects an existing tag at another commit'; Event='push'; Ref='refs/tags/v0.2.0'; Publish='false'; Tag='v0.2.0'; Version='0.2.0'; Pass=$false },
    @{ Name='tag push accepts the matching annotated release tag'; Event='push'; Ref='refs/tags/v0.3.0'; Publish='false'; Tag='v0.3.0'; Pass=$true },
    @{ Name='manual publication accepts the matching release tag'; Event='workflow_dispatch'; Ref='refs/heads/main'; Publish='true'; Tag='v0.3.0'; Pass=$true },
    @{ Name='manual publication permits a new version tag'; Event='workflow_dispatch'; Ref='refs/heads/main'; Publish='true'; Tag='v0.5.0'; Version='0.5.0'; Pass=$true },
    @{ Name='publication rejects a matching commit with the wrong version'; Event='workflow_dispatch'; Ref='refs/heads/main'; Publish='true'; Tag='v0.4.0'; Pass=$false },
    @{ Name='tag push cannot validate a different supplied tag'; Event='push'; Ref='refs/tags/v0.4.0'; Publish='false'; Tag='v0.3.0'; Pass=$false }
)

foreach ($case in $cases) {
    $version = if ($case.ContainsKey('Version')) { $case.Version } else { '0.3.0' }
    [IO.File]::WriteAllText((Join-Path $testRoot 'package.json'), ('{"version":"' + $version + '"}'))
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & $hostExecutable -NoProfile -File $workflowWrapper -Validator $Validator -Repository $testRoot -EventName $case.Event -Ref $case.Ref -Publish $case.Publish -Tag $case.Tag -Commit $commit 2>&1 | Out-String
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if (($code -eq 0) -ne $case.Pass) { throw "$($case.Name): unexpected exit $code.`n$output" }
    Write-Output "PASS: $($case.Name)"
}
# Validation is read-only, including the new-tag case.
$tags = @(Invoke-FixtureGit @('tag', '--list'))
if ($tags.Count -ne 3 -or $tags -contains 'v0.5.0') { throw 'Release ref validation changed fixture tags.' }
Write-Output "PASS: $($cases.Count) release-ref cases; no tag creation or publication. Fixture: $testRoot"
