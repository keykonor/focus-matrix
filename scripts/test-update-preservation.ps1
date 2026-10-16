Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-data-functions.ps1')
$root = Join-Path (Split-Path -Parent $PSScriptRoot) ('outputs\update-test-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'data'
$backup = Join-Path $data 'backups\test-version'
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$unicodeText = [string][char]0x4e2d + [char]0x6587 + [char]0x5b57
$original = [Text.Encoding]::UTF8.GetBytes('{"tasks":[],"dailyMemos":{"2026-10-16":{"morning":"keep"}},"settings":{"unknown":true},"completedTasks":[],"futureData":"' + $unicodeText + '"}')
$window = [Text.Encoding]::UTF8.GetBytes('{"main":{"x":123,"width":720}}')
[IO.File]::WriteAllBytes((Join-Path $backup 'focus-matrix.json'), $original)
[IO.File]::WriteAllBytes((Join-Path $backup '.window-state.json'), $window)
$entries = @('focus-matrix.json', '.window-state.json') | ForEach-Object {
    [pscustomobject]@{ name=$_; sha256=(Get-FileHash -LiteralPath (Join-Path $backup $_)).Hash }
}
Write-AtomicJson (Join-Path $backup 'manifest.json') @{ files=@($entries) }
Write-AtomicBytes (Join-Path $data 'focus-matrix.json') ([Text.Encoding]::UTF8.GetBytes('{"tasks":[],"changed":true}'))
Restore-UpdateSnapshot $backup $data
if ((Read-UpdateJson (Join-Path $data 'focus-matrix.json')).futureData -ne $unicodeText) { throw 'UTF-8 text did not round-trip.' }
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
$journalTarget = Join-Path $data 'journal-test.json'
Write-DurableBytes $journalTarget ([Text.Encoding]::UTF8.GetBytes('interrupted'))
Write-DurableBytes ($journalTarget + '.pending-write') $original
Restore-PendingWrite $journalTarget
if ([IO.File]::ReadAllText($journalTarget) -ne 'interrupted') { throw 'Unsealed journal was applied.' }
Write-DurableBytes ($journalTarget + '.pending-write.ready') ([Text.Encoding]::ASCII.GetBytes('bad checksum'))
$blocked=$false
try { Restore-PendingWrite $journalTarget } catch { $blocked=$true }
if (-not $blocked -or [IO.File]::ReadAllText($journalTarget) -ne 'interrupted') { throw 'Damaged journal changed data.' }
Write-DurableBytes ($journalTarget + '.pending-write.ready') ([Text.Encoding]::ASCII.GetBytes((Get-FileHash -LiteralPath ($journalTarget + '.pending-write')).Hash.ToLowerInvariant()))
Restore-PendingWrite $journalTarget
if ((Get-FileHash -LiteralPath $journalTarget).Hash -ne (Get-FileHash -LiteralPath (Join-Path $data 'focus-matrix.json')).Hash) { throw 'Interrupted copy was not recovered.' }
Write-Output 'PASS: sealed journal recovers interrupted copies; damaged/unsealed journals never overwrite data.'
