Set-StrictMode -Version Latest
function Get-FocusAdbDevices([string[]]$Lines){
 foreach($line in $Lines){
  if($line -match '^(\S+)\s+(device|unauthorized|offline|recovery|sideload)\b'){
   $serial=$Matches[1];$state=$Matches[2]
   [pscustomobject]@{Serial=$serial;State=$state;Wireless=($serial.Contains(':') -or $serial -match '_adb-tls-connect\._tcp');Emulator=$serial.StartsWith('emulator-')}
  }
 }
}
function Get-FocusApkIdentity([string[]]$Lines){
 $package=@($Lines | Where-Object {$_ -match '^package:'})
 if($package.Count -ne 1 -or $package[0] -notmatch "^package: name='com\.focusmatrix\.mobile' versionCode='(\d+)' versionName='([^']+)'"){throw 'APK 包名或版本不匹配，已停止安装。'}
 return [pscustomobject]@{VersionCode=[long]$Matches[1];VersionName=$Matches[2]}
}
function Test-FocusEndpoint([string]$Value){
 if($Value -notmatch '^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9][a-zA-Z0-9.-]*):([0-9]{1,5})$' -or [int]$Matches[2] -lt 1 -or [int]$Matches[2] -gt 65535){throw '请填写 IP:端口，例如 192.168.1.8:37123；配对端口与连接端口不能混用。'}
}
function Invoke-FocusAdb([string]$Executable,[string[]]$Arguments,[switch]$AllowFailure){
 # Windows PowerShell 5.1 turns normal native stderr (e.g. daemon startup)
 # into an ErrorRecord. Check the exit code instead of treating stderr as failure.
 $previousPreference=$ErrorActionPreference
 try{$ErrorActionPreference='Continue';$lines=@(& $Executable @Arguments 2>&1 | ForEach-Object { [string]$_ })}
 finally{$ErrorActionPreference=$previousPreference}
 if($LASTEXITCODE -ne 0 -and -not $AllowFailure){
  $details=$lines -join "`n"
  if($details -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE'){throw '手机原版签名不一致，已停止覆盖安装；请保留原版和数据，不要卸载。'}
  if($details -match 'INSTALL_FAILED_VERSION_DOWNGRADE'){throw '手机已有较新版本，已停止降级；原版和内容保留。'}
  throw ('ADB 操作失败：'+$details)
 }
 return $lines
}
function Invoke-FocusAdbPair([string]$Executable,[string]$Address,[switch]$NonInteractive){
 Test-FocusEndpoint $Address
 if($NonInteractive){throw '首次无线配对需要在部署窗口输入配对码；请去掉 -NonInteractive 后运行。'}
 $secure=Read-Host '请输入手机显示的 6 位配对码（输入隐藏，不保存）' -AsSecureString
 $pointer=[IntPtr]::Zero;$process=$null
 try{
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if($plain -notmatch '^\d{6}$'){throw '配对码必须为 6 位数字。'}
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$Executable;$info.Arguments='pair '+$Address
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  [void]$process.Start()
  $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
  $process.StandardInput.WriteLine($plain);$process.StandardInput.Close();$plain=$null
  if(-not $process.WaitForExit(45000)){$process.Kill();throw '无线配对超时，请保持手机配对页面打开并重试。'}
  if($process.ExitCode -ne 0 -or $output.Result -notmatch 'Successfully paired'){throw '无线配对未成功。请重新打开手机“使用配对码配对设备”，核对配对端口与新配对码。'}
  Write-Host '无线调试配对成功。'
 }finally{
  $plain=$null
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  $secure.Dispose();if($process){$process.Dispose()}
 }
}
