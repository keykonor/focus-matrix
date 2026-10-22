Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'prepare-installer.ps1')

$testRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ('outputs\installer-test-' + [guid]::NewGuid().ToString('N'))
$dataRoot = Join-Path $testRoot 'data'
$null = New-Item -ItemType Directory -Path (Join-Path $dataRoot 'history') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $dataRoot 'backups\old') -Force
$bytes = [Text.Encoding]::UTF8.GetBytes('{"tasks":[],"dailyMemos":{"2026-10-23":{"morning":"保留备忘录"}},"completedTasks":[],"settings":{"future":true},"unknown":"保留未知字段"}')
[IO.File]::WriteAllBytes((Join-Path $dataRoot 'focus-matrix.json'), $bytes)
[IO.File]::WriteAllText((Join-Path $dataRoot '.window-state.json'), '{"main":{"width":720,"x":123}}')
[IO.File]::WriteAllText((Join-Path $dataRoot '.cloud-config.bin'), 'opaque-encrypted-fixture')
[IO.File]::WriteAllText((Join-Path $dataRoot '.cloud-config.previous.bin'), 'previous-encrypted-fixture')
[IO.File]::WriteAllText((Join-Path $dataRoot '.focus-matrix.previous.json'), '{"tasks":[],"previous":true}')
[IO.File]::WriteAllText((Join-Path $dataRoot 'history\version-fixture.json'), '{"tasks":[],"fixture":true}')
[IO.File]::WriteAllText((Join-Path $dataRoot 'focus-matrix.json.pending-write'), 'pending-fixture')
[IO.File]::WriteAllText((Join-Path $dataRoot 'backups\old\do-not-recurse.txt'), 'old-backup')
$oldExe = Join-Path $testRoot 'FocusMatrix.exe'
[IO.File]::WriteAllText($oldExe, 'old-executable-fixture')

$blocked = $false
try { Assert-FocusMatrixStopped @('explorer', 'FocusMatrix') } catch { $blocked = $true }
if (-not $blocked) { throw 'Running app was not blocked.' }
Assert-FocusMatrixStopped @('explorer', 'unrelated')

$originalHash = (Get-FileHash -LiteralPath (Join-Path $dataRoot 'focus-matrix.json')).Hash
$backup = Backup-FocusMatrixInstallerData -DataDirectory $dataRoot -ExecutablePaths @($oldExe)
$manifest = [IO.File]::ReadAllText((Join-Path $backup 'manifest.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
if (@($manifest.files).Count -ne 8) { throw 'Some user data or the previous executable was not backed up.' }
foreach ($entry in $manifest.files) {
    if ((Get-FileHash -LiteralPath (Join-Path $backup $entry.name)).Hash -ne $entry.sha256) { throw 'Backup checksum mismatch.' }
    if ($entry.name -like '*do-not-recurse*') { throw 'Old backups were recursively copied.' }
}
if ((Get-FileHash -LiteralPath (Join-Path $dataRoot 'focus-matrix.json')).Hash -ne $originalHash) { throw 'Installer preparation modified live data.' }
$second = Backup-FocusMatrixInstallerData -DataDirectory $dataRoot -ExecutablePaths @($oldExe)
if ($second -eq $backup -or -not (Test-Path -LiteralPath $backup)) { throw 'An existing backup was overwritten.' }
if ($null -ne (Backup-FocusMatrixInstallerData -DataDirectory (Join-Path $testRoot 'new-user') -ExecutablePaths @())) { throw 'Fresh install unexpectedly created a data backup.' }
Write-Output 'PASS: running app blocked; exact user data, history, pending journal, encrypted settings and old exe backed up; old backups excluded; repeated backups immutable; live data unchanged.'
