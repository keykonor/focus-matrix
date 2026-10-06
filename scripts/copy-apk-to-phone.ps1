[CmdletBinding()]
param([string]$PhoneName='荣耀Magic7')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try{
 . (Join-Path $PSScriptRoot 'android-deploy-functions.ps1')
 $apk=Join-Path $root 'outputs/FocusMatrix-Android.apk'
 if(-not(Test-Path -LiteralPath $apk)){throw '请先构建 APK。'}
 $badging=@(& (Join-Path $root '.android-tools/build-tools/android-16/aapt2.exe') dump badging 'outputs/FocusMatrix-Android.apk')
 if($LASTEXITCODE -ne 0){throw 'APK 校验失败。'}
 $identity=Get-FocusApkIdentity $badging
 $shell=New-Object -ComObject Shell.Application
 $phones=@($shell.Namespace(17).Items() | Where-Object { $_.Name -eq $PhoneName -and $_.IsFolder })
 if($phones.Count -ne 1){throw '未找到目标手机文件存储。请解锁手机，将 USB 用途切换为文件传输。'}
 $folders=@($phones[0].GetFolder.Items() | Where-Object IsFolder)
 $destinations=@(foreach($storage in $folders){$storage.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -in @('Download','Downloads','下载') }})
 if($destinations.Count -ne 1){throw '无法唯一确定手机 Download 文件夹，已停止传送。'}
 # Use a unique filename so earlier phone installation packages remain untouched.
 $name='FocusMatrix-'+$identity.VersionName+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6)+'.apk'
 $directory=Join-Path $root 'outputs/phone-transfers'
 New-Item -ItemType Directory -Path $directory -Force | Out-Null
 $source=Join-Path $directory $name
 Copy-Item -LiteralPath $apk -Destination $source -ErrorAction Stop
 if((Get-FileHash $source -Algorithm SHA256).Hash -ne (Get-FileHash $apk -Algorithm SHA256).Hash){throw '本机传送文件校验失败。'}
 $destination=$destinations[0].GetFolder
 $destination.CopyHere($source,20)
 $copied=$null
 for($attempt=0;$attempt -lt 45;$attempt++){
  $copied=$destination.ParseName($name)
  if($copied -and $copied.ExtendedProperty('System.Size') -eq (Get-Item -LiteralPath $source).Length){break}
  Start-Sleep -Seconds 1
 }
 if(-not $copied -or $copied.ExtendedProperty('System.Size') -ne (Get-Item -LiteralPath $source).Length){throw '未能确认 USB 传送完成，请检查手机存储空间或连接。'}
 Write-Output ('USB 传送完成：'+$PhoneName+' / Download / '+$name)
 Write-Output '这只是传送安装包。请在手机“文件管理 → Download”中点击此 APK，选择覆盖安装，不要先卸载。'
}finally{Pop-Location}
