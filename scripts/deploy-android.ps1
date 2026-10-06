[CmdletBinding()]
param(
 [ValidateSet('Auto','USB','Wireless')][string]$Connection='Auto',
 [string]$Device='',
 [string]$PairAddress='',
 [string]$ConnectAddress='',
 [ValidateRange(0,300)][int]$WaitSeconds=120,
 [switch]$SkipBuild,
 [switch]$NonInteractive
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$deploymentMutex=New-Object Threading.Mutex($false,'Local\FocusMatrix.AndroidDeploy')
$ownsDeploymentMutex=$false
try{
 try{$ownsDeploymentMutex=$deploymentMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$ownsDeploymentMutex=$true}
 if(-not $ownsDeploymentMutex){throw '另一个手机部署正在运行，请等待该窗口完成，避免同时构建或安装。'}
. (Join-Path $PSScriptRoot 'android-deploy-functions.ps1')
$adb=Join-Path $root '.android-tools/platform-tools/platform-tools/adb.exe'
if(-not(Test-Path -LiteralPath $adb)){
 Write-Host '正在安装 Google 官方 ADB 工具…'
 & (Join-Path $PSScriptRoot 'setup-android-tools.ps1') -Package platform-tools
 if(-not(Test-Path -LiteralPath $adb)){throw 'ADB 安装失败，已停止部署。'}
}
if(-not $SkipBuild){
 Write-Host '1/4 构建最新版 APK（保留旧安装包和原签名）…'
 & (Join-Path $PSScriptRoot 'build-android.ps1')
}else{Write-Host '1/4 使用已经构建的 APK…'}
$apk=Join-Path $root 'outputs/FocusMatrix-Android.apk'
if(-not(Test-Path -LiteralPath $apk)){throw '没有可安装的 APK，请先构建。'}
# Check the actual artifact, rather than trusting a filename or source manifest.
$badging=@(& (Join-Path $root '.android-tools/build-tools/android-16/aapt2.exe') dump badging 'outputs/FocusMatrix-Android.apk')
if($LASTEXITCODE -ne 0){throw 'APK 信息读取失败，已停止部署。'}
$identity=Get-FocusApkIdentity $badging
$jdk=(Get-ChildItem -LiteralPath (Join-Path $root '.android-tools/jdk') -Directory | Select-Object -First 1).FullName
$env:JAVA_HOME=$jdk;$env:Path=(Join-Path $jdk 'bin')+';'+$env:Path
& (Join-Path $root '.android-tools/build-tools/android-16/apksigner.bat') verify $apk
if($LASTEXITCODE -ne 0){throw 'APK 签名校验失败，已停止部署。'}
Write-Host ('2/4 连接手机 · APK '+$identity.VersionName+'…')
[void](Invoke-FocusAdb $adb @('start-server'))
if($Connection -eq 'Auto' -and -not $Device -and @(Get-FocusAdbDevices (Invoke-FocusAdb $adb @('devices','-l')) | Where-Object State -eq 'device').Count -eq 0){
 if($NonInteractive){$Connection='USB'}else{
  Write-Host '请选择：1 = USB 数据线（默认）；2 = Android 11+ 无线调试'
  $choice=Read-Host '连接方式'
  $Connection=if($choice -eq '2'){'Wireless'}else{'USB'}
 }
}
if($Connection -eq 'Wireless'){
 if($PairAddress){Test-FocusEndpoint $PairAddress;Invoke-FocusAdbPair $adb $PairAddress -NonInteractive:$NonInteractive}
 if(-not $ConnectAddress -and -not $Device){
  # Paired Android devices normally auto-connect over mDNS. No subnet scan.
  $connected=@(Get-FocusAdbDevices (Invoke-FocusAdb $adb @('devices','-l')) | Where-Object { $_.State -eq 'device' -and $_.Wireless })
  if($connected.Count -eq 0){
   if(-not $PairAddress -and -not $NonInteractive){
    Write-Host '手机与电脑接入同一 Wi-Fi；手机打开 开发者选项 → 无线调试 → 使用配对码配对设备。'
    $PairAddress=Read-Host '填写配对页面的 IP:配对端口（已配对可直接回车）'
    if($PairAddress){Test-FocusEndpoint $PairAddress;Invoke-FocusAdbPair $adb $PairAddress}
   }
   $services=@(Invoke-FocusAdb $adb @('mdns','services'))
   $addresses=@($services | ForEach-Object {if($_ -match '^\S+\s+_adb-tls-connect\._tcp\.?\s+(\S+)$'){$Matches[1]}})
   if($addresses.Count -eq 1){$ConnectAddress=$addresses[0]}
  }
  if($connected.Count -eq 0 -and -not $ConnectAddress -and -not $NonInteractive){
   Write-Host '返回无线调试主页面。连接端口通常不同于配对端口。'
   $ConnectAddress=Read-Host '填写主页面的 IP:连接端口'
  }
 }
 if($ConnectAddress){
  Test-FocusEndpoint $ConnectAddress
  $result=Invoke-FocusAdb $adb @('connect',$ConnectAddress)
  if(($result -join "`n") -notmatch '(connected to|already connected to)'){throw '无线连接未建立。请核对主页面端口、同一 Wi-Fi 与手机无线调试状态；首次连接需先输入配对端口及配对码。'}
  if(-not $Device){$Device=$ConnectAddress}
 }
}
if($Device -and $Device -notmatch '^[A-Za-z0-9][A-Za-z0-9._:\[\]-]*$'){throw '手机设备编号格式无效。'}
$deadline=(Get-Date).AddSeconds($WaitSeconds)
$target=$null;$announced=$false
do{
 $all=@(Get-FocusAdbDevices (Invoke-FocusAdb $adb @('devices','-l')))
 $candidates=@($all | Where-Object { $_.State -eq 'device' -and ( -not $Device -or $_.Serial -eq $Device ) -and ( $Connection -ne 'USB' -or (-not $_.Wireless -and -not $_.Emulator) ) -and ( $Connection -ne 'Wireless' -or $_.Wireless ) })
 if($candidates.Count -gt 1){
  if($NonInteractive){throw '检测到多台手机；请使用 -Device 指定目标，未向任何手机安装。'}
  for($i=0;$i -lt $candidates.Count;$i++){Write-Host ('{0}. {1}' -f ($i+1),$candidates[$i].Serial)}
  $selected=Read-Host '选择要安装的手机序号';$number=0
  if(-not [int]::TryParse($selected,[ref]$number) -or $number -lt 1 -or $number -gt $candidates.Count){throw '无效选择，已停止。'}
  $target=$candidates[$number-1]
 }elseif($candidates.Count -eq 1){$target=$candidates[0]}
 if($target){break}
 if(-not $announced){
  Write-Host '正在等待手机连接。USB：解锁手机并允许 USB 调试；无线：保持无线调试开启。'
  if(@($all | Where-Object State -eq 'unauthorized').Count){Write-Host '手机已接入，但尚未授权，请在手机上点“允许 USB 调试”。'}
  $announced=$true
 }
 if((Get-Date) -ge $deadline){break};Start-Sleep -Seconds 2
}while($true)
if(-not $target){throw '尚无已授权的目标手机。请连接可传输数据的 USB 线并允许调试，或重新核对无线连接端口；连接后再次双击部署入口即可。'}
$serial=$target.Serial
$sdk=(Invoke-FocusAdb $adb @('-s',$serial,'shell','getprop','ro.build.version.sdk') -join '').Trim()
if($sdk -notmatch '^\d+$' -or [int]$sdk -lt 26){throw '此 APK 需要 Android 8.0 或更新版本。'}
$before=Invoke-FocusAdb $adb @('-s',$serial,'shell','pm','path','com.focusmatrix.mobile') -AllowFailure
$alreadyInstalled=($before -join "`n") -match 'package:'
if($alreadyInstalled){
 $details=Invoke-FocusAdb $adb @('-s',$serial,'shell','dumpsys','package','com.focusmatrix.mobile')
 if(($details -join "`n") -match '\bversionCode=(\d+)' -and [long]$Matches[1] -gt $identity.VersionCode){throw '手机上已有更新的版本，已停止；不会降级、卸载或清空内容。'}
}
Write-Host '3/4 覆盖安装（保留手机应用数据）…'
$install=Invoke-FocusAdb $adb @('-s',$serial,'install','-r','--no-streaming','outputs/FocusMatrix-Android.apk')
if(($install -join "`n") -notmatch '(?m)^Success\s*$'){throw '安装未成功。请查看手机安装确认或安全设置；不会自动卸载原版。'}
$after=Invoke-FocusAdb $adb @('-s',$serial,'shell','dumpsys','package','com.focusmatrix.mobile')
if(($after -join "`n") -notmatch ('\bversionCode='+$identity.VersionCode+'\b')){throw '安装后版本核对失败，已停止启动。原有数据未清除。'}
Write-Host '4/4 自动启动 Focus Matrix…'
$launch=Invoke-FocusAdb $adb @('-s',$serial,'shell','am','start','-W','-n','com.focusmatrix.mobile/.MainActivity')
if(($launch -join "`n") -notmatch '(?m)^Status:\s*ok\s*$'){throw '已安装，但启动未确认成功，请在手机桌面打开 Focus Matrix。'}
Write-Host ('部署成功：Focus Matrix '+$identity.VersionName+' 已安装并启动。') -ForegroundColor Green
Write-Host '这只完成应用安装。首次同步仍需在 App 中输入电脑生成的 Focus Matrix 配对链接。'
$reports=Join-Path $root 'outputs/android-deployments'
New-Item -ItemType Directory -Path $reports -Force | Out-Null
$report=Join-Path $reports ((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6)+'.json')
[ordered]@{installedAt=(Get-Date).ToString('o');package='com.focusmatrix.mobile';versionName=$identity.VersionName;versionCode=$identity.VersionCode;apkSha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash;connection=if($target.Wireless){'Wireless'}else{'USB'};replacedExistingApp=$alreadyInstalled;launchVerified=$true} | ConvertTo-Json | Set-Content -LiteralPath $report -Encoding utf8
}finally{
 if($ownsDeploymentMutex){$deploymentMutex.ReleaseMutex()}
 $deploymentMutex.Dispose()
}
