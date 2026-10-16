Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-data-functions.ps1')
$root = Join-Path (Split-Path -Parent $PSScriptRoot) ('outputs\update-test-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'data'
$backup = Join-Path $data 'backups\test-version'
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$original = [Text.Encoding]::UTF8.GetBytes('{"tasks":[],"dailyMemos":{"2026-10-16":{"morning":"keep"}},"settings":{"unknown":true},"completedTasks":[],"futureData":"keep"}')
$window = [Text.Encoding]::UTF8.GetBytes('{"main":{"x":123,"width":720}}')
[IO.File]::WriteAllBytes((Join-Path $backup 'focus-matrix.json'), $original)
[IO.File]::WriteAllBytes((Join-Path $backup '.window-state.json'), $window)
$entries = @('focus-matrix.json', '.window-state.json') | ForEach-Object {
    [pscustomobject]@{ name=$_; sha256=(Get-FileHash -LiteralPath (Join-Path $backup $_)).Hash }
}
Write-AtomicJson (Join-Path $backup 'manifest.json') @{ files=@($entries) }
Write-AtomicBytes (Join-Path $data 'focus-matrix.json') ([Text.Encoding]::UTF8.GetBytes('{"tasks":[],"changed":true}'))
Restore-UpdateSnapshot $backup $data
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $data 'focus-matrix.json'))) -ne [Convert]::ToBase64String($original)) { throw 'Full snapshot was not restored byte-for-byte.' }
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $data '.window-state.json'))) -ne [Convert]::ToBase64String($window)) { throw 'Window snapshot changed.' }
# Simulate a damaged backup; active state must remain unchanged.
[IO.File]::WriteAllText((Join-Path $backup 'focus-matrix.json'), '{}')
$blocked = $false
try { Restore-UpdateSnapshot $backup $data } catch { $blocked=$true }
if (-not $blocked) { throw 'A corrupt backup was accepted.' }
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $data 'focus-matrix.json'))) -ne [Convert]::ToBase64String($original)) { throw 'Corrupt backup changed active data.' }
$blocked = $false
try { Read-VerifiedUpdateBackup (Split-Path -Parent $backup) (Join-Path $root 'different-data') | Out-Null } catch { $blocked=$true }
if (-not $blocked) { throw 'A backup outside the data directory was accepted.' }
Write-Output 'PASS: exact complete restore, unknown fields and window preserved, damaged backup blocked, path containment enforced.'
