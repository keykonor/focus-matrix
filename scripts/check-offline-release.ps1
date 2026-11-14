param([Parameter(Mandatory)][string]$ReleaseDirectory, [string]$Scratch = $env:RUNNER_TEMP)
$ErrorActionPreference = 'Stop'
$assets = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$testDirectory = (New-Item -ItemType Directory -Path (Join-Path $Scratch ('verify-offline-' + [guid]::NewGuid().ToString('N'))) -Force).FullName
$boot = (New-Item -ItemType Directory -Path (Join-Path $testDirectory 'bootstrap')).FullName
& tar.exe -xf (Join-Path $assets 'FocusMatrix-Windows-x64-offline.zip') -C $boot
if ($LASTEXITCODE -ne 0) { throw 'Offline bootstrap ZIP is unreadable.' }
$root = & (Join-Path $boot 'install-offline.ps1') -Assets $assets -VerifyOnly -VerificationDirectory $testDirectory
$lock = Get-Content -LiteralPath (Join-Path $boot 'local-ai-lock.json') -Raw | ConvertFrom-Json
$exe = Join-Path $root "ollama-$($lock.runtimeVersion)/ollama.exe"
$env:OLLAMA_MODELS = Join-Path $root 'models'
$env:OLLAMA_NO_CLOUD = '1'
$socket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$socket.Start()
$port = $socket.LocalEndpoint.Port
$socket.Stop()
$env:OLLAMA_HOST = "127.0.0.1:$port"
$url = "http://127.0.0.1:$port"
$server = Start-Process -FilePath $exe -ArgumentList serve -WindowStyle Hidden -PassThru
try {
    $ready = $false
    for ($i=0; $i -lt 45; $i++) {
        try { $null = Invoke-RestMethod "$url/api/version" -TimeoutSec 2; $ready = $true; break }
        catch { if ($server.HasExited) { throw 'Bundled Ollama exited early.' }; Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'Bundled Ollama did not start.' }
    $result = Invoke-RestMethod "$url/api/chat" -Method Post -ContentType 'application/json' -TimeoutSec 420 -Body (@{
        model=('qwen3.5:' + $lock.model); stream=$false; think=$false; keep_alive=0;
        messages=@(@{role='user';content='Reply with OK.'}); options=@{num_predict=24;num_ctx=1024;num_gpu=0}
    } | ConvertTo-Json -Depth 6)
    if (-not $result.done -or -not $result.message.content) { throw 'Bundled model did not return a local result.' }
    Write-Output 'PASS: exact offline release assets restored locally and the bundled model ran without a pull or a configured Ollama installation.'
} finally {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id }
}
