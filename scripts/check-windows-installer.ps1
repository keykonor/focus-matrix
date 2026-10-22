param([Parameter(Mandatory=$true)][string]$Installer)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# This check must never populate or uninstall the maintainer's real installation.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Run this check only on a disposable GitHub-hosted Windows runner.' }
$data = Join-Path $env:APPDATA 'com.focusmatrix.desktop'
if (Test-Path -LiteralPath $data) { throw 'App data already exists; refusing to touch it.' }
$root = Join-Path $env:RUNNER_TEMP ('focus-matrix-nsis-' + [guid]::NewGuid().ToString('N'))
$install = Join-Path $root 'program'
$null = New-Item -ItemType Directory -Path $root
$env:FOCUS_MATRIX_INSTALL_LOG = Join-Path $root 'installer-hooks.log'
function Show-InstallerDiagnostics {
    Write-Output 'WebView2 registration:'
    foreach ($hive in @('HKLM:\SOFTWARE', 'HKLM:\SOFTWARE\WOW6432Node', 'HKCU:\SOFTWARE', 'HKCU:\SOFTWARE\WOW6432Node')) {
        $clients = Join-Path $hive 'Microsoft\EdgeUpdate\Clients'
        if (Test-Path -LiteralPath $clients) {
            Get-ChildItem -LiteralPath $clients | Get-ItemProperty | Select-Object PSChildName, name, pv | Format-Table
        }
    }
    if (Test-Path -LiteralPath $env:FOCUS_MATRIX_INSTALL_LOG) { Get-Content -LiteralPath $env:FOCUS_MATRIX_INSTALL_LOG }
    else { Write-Output 'No installer hook log was created.' }
    foreach ($log in @((Join-Path $env:TEMP 'msedge_installer.log'), (Join-Path $env:TEMP 'MicrosoftEdgeUpdate.log'), (Join-Path $env:ProgramData 'Microsoft\EdgeUpdate\Log\MicrosoftEdgeUpdate.log'))) {
        if (Test-Path -LiteralPath $log) { Write-Output "Runtime log: $log"; Get-Content -LiteralPath $log -Tail 30 }
    }
}

function Run-Setup {
    Write-Output 'Running silent setup...'
    $process = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$install") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Show-InstallerDiagnostics
        throw "Installer failed: $($process.ExitCode)"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $install 'focus-matrix.exe'))) { throw 'Installed app missing.' }
}
Run-Setup
if (Test-Path -LiteralPath (Join-Path $data 'focus-matrix.json')) { throw 'Silent first installation launched the app or created content.' }
$null = New-Item -ItemType Directory -Path (Join-Path $data 'history') -Force
$fixtures = @{
    'focus-matrix.json'='{"tasks":[{"id":"fixture","text":"keep","completed":false,"quadrant":"important-urgent","createdAt":"2026-10-23T00:00:00Z","updatedAt":"2026-10-23T00:00:00Z"}],"dailyMemos":{"2026-10-23":{"morning":"keep"}},"completedTasks":[],"settings":{"future":true},"unknown":"keep"}';
    '.window-state.json'='{"main":{"width":720,"x":123}}';
    '.cloud-config.bin'='opaque-encrypted-fixture';
    '.cloud-config.previous.bin'='previous-opaque-fixture';
    '.focus-matrix.previous.json'='{"tasks":[],"unknown":"previous"}';
    'history\version-fixture.json'='{"fixture":true,"tasks":[]}'
}
$hashes = @{}
foreach ($name in $fixtures.Keys) {
    [IO.File]::WriteAllText((Join-Path $data $name), $fixtures[$name], (New-Object Text.UTF8Encoding($false)))
    $hashes[$name] = (Get-FileHash -LiteralPath (Join-Path $data $name)).Hash
}
function Assert-Preserved {
    foreach ($name in $hashes.Keys) {
        if (-not (Test-Path -LiteralPath (Join-Path $data $name)) -or (Get-FileHash -LiteralPath (Join-Path $data $name)).Hash -ne $hashes[$name]) { throw "Installer changed fixture: $name" }
    }
}
$programHash = (Get-FileHash -LiteralPath (Join-Path $install 'focus-matrix.exe')).Hash
$dummySource = Join-Path $root 'Dummy.cs'
$dummyExe = Join-Path $root 'FocusMatrix.exe'
$compiler = Join-Path $root 'compile-fixture.ps1'
[IO.File]::WriteAllText($dummySource, 'public class Dummy { public static void Main() { System.Threading.Thread.Sleep(60000); } }')
[IO.File]::WriteAllText($compiler, 'param($SourcePath, $OutputPath) $ErrorActionPreference="Stop"; Add-Type -Path $SourcePath -OutputAssembly $OutputPath -OutputType ConsoleApplication')
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $compiler -SourcePath $dummySource -OutputPath $dummyExe
if ($LASTEXITCODE -ne 0) { throw 'Could not build the isolated running-process fixture.' }
$dummy = Start-Process -FilePath $dummyExe -WindowStyle Hidden -PassThru
try {
    $attempt = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$install") -WindowStyle Hidden -Wait -PassThru
    if ($attempt.ExitCode -eq 0) { throw 'Installer did not reject a running app.' }
    if ($dummy.HasExited) { throw 'Installer killed the running-process fixture.' }
    if ((Get-FileHash -LiteralPath (Join-Path $install 'focus-matrix.exe')).Hash -ne $programHash) { throw 'Rejected installation changed the old program.' }
    Assert-Preserved
} finally {
    if (-not $dummy.HasExited) { Stop-Process -Id $dummy.Id -ErrorAction Stop }
}
# Start a second fixture after the backup directory is created, i.e. after
# the first running-process check. The later native NSIS check must reject it.
$backupRoot = Join-Path $data 'backups'
$null = New-Item -ItemType Directory -Path $backupRoot -Force
$padding = Join-Path $data 'history\race-padding.bin'
[IO.File]::WriteAllBytes($padding, (New-Object byte[] (32MB)))
$ready = Join-Path $root 'race-ready'
$fixturePid = Join-Path $root 'race-pid'
$launcherScript = Join-Path $root 'launch-during-backup.ps1'
$launcherCode = @'
param($BackupRoot, $DummyExe, $Ready, $PidFile)
$ErrorActionPreference = 'Stop'
$before = @(Get-ChildItem -LiteralPath $BackupRoot -Directory | ForEach-Object Name)
[IO.File]::WriteAllText($Ready, 'ready')
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while ([DateTime]::UtcNow -lt $deadline) {
    $new = @(Get-ChildItem -LiteralPath $BackupRoot -Directory | Where-Object { $_.Name -notin $before })
    if ($new.Count -gt 0) {
        $process = Start-Process -FilePath $DummyExe -WindowStyle Hidden -PassThru
        [IO.File]::WriteAllText($PidFile, [string]$process.Id)
        exit 0
    }
    Start-Sleep -Milliseconds 2
}
exit 1
'@
[IO.File]::WriteAllText($launcherScript, $launcherCode)
$launcher = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$launcherScript`"", '-BackupRoot', "`"$backupRoot`"", '-DummyExe', "`"$dummyExe`"", '-Ready', "`"$ready`"", '-PidFile', "`"$fixturePid`"") -WindowStyle Hidden -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(15)
while (-not (Test-Path -LiteralPath $ready) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }
try {
    if (-not (Test-Path -LiteralPath $ready)) { throw 'Race fixture did not become ready.' }
    $attempt = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$install") -WindowStyle Hidden -Wait -PassThru
    if (-not (Test-Path -LiteralPath $fixturePid)) { throw 'Race fixture never observed the backup starting.' }
    $raceProcessId = [int][IO.File]::ReadAllText($fixturePid)
    if (-not (Get-Process -Id $raceProcessId -ErrorAction SilentlyContinue)) { throw 'Installer killed the process that started during backup.' }
    if ($attempt.ExitCode -eq 0) { throw 'Installer did not reject the process that started during backup.' }
    if ((Get-FileHash -LiteralPath (Join-Path $install 'focus-matrix.exe')).Hash -ne $programHash) { throw 'Racing installation replaced the old program.' }
    Assert-Preserved
} finally {
    if (Test-Path -LiteralPath $fixturePid) { Stop-Process -Id ([int][IO.File]::ReadAllText($fixturePid)) -ErrorAction SilentlyContinue }
    if (-not $launcher.HasExited) { Stop-Process -Id $launcher.Id -ErrorAction SilentlyContinue }
}
Run-Setup
Assert-Preserved
$backups = @(Get-ChildItem -LiteralPath (Join-Path $data 'backups') -Directory -Filter 'nsis-*')
if ($backups.Count -lt 1) { throw 'Reinstall did not create a backup.' }
foreach ($backup in $backups) {
    $manifest = [IO.File]::ReadAllText((Join-Path $backup.FullName 'manifest.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        if ((Get-FileHash -LiteralPath (Join-Path $backup.FullName $entry.name)).Hash -ne $entry.sha256) { throw 'Installed backup is corrupt.' }
    }
}
$uninstaller = Join-Path $install 'uninstall.exe'
$process = Start-Process -FilePath $uninstaller -ArgumentList @('/S', "_?=$install") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Uninstaller failed: $($process.ExitCode)" }
if (Test-Path -LiteralPath (Join-Path $install 'focus-matrix.exe')) { throw 'Uninstall did not remove the app.' }
Assert-Preserved
Run-Setup
Assert-Preserved
Write-Output 'PASS: silent fresh install, running-app rejection without killing or replacing files, reinstall, verified backups, uninstall and reinstall-after-uninstall preserve all fixture bytes. The application was not launched and no real user data was used.'
