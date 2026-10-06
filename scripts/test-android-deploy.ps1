Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'android-deploy-functions.ps1')
function Assert-True([bool]$Condition,[string]$Description){if(-not $Condition){throw $Description}}
function Assert-Fails([scriptblock]$Action,[string]$Expected){
 $failed=$false
 try{& $Action}catch{$failed=$true;Assert-True ($_.Exception.Message.Contains($Expected)) ('Unexpected failure: '+$_.Exception.Message)}
 Assert-True $failed 'Unsafe input was accepted'
}
$devices=@(Get-FocusAdbDevices @('List of devices attached','USB123 device product:phone','USB456 unauthorized','192.168.1.8:37123 device','adb-test._adb-tls-connect._tcp device','emulator-5554 device','* daemon started successfully'))
Assert-True ($devices.Count -eq 5) 'Device parser included diagnostic output'
Assert-True ($devices[0].State -eq 'device' -and -not $devices[0].Wireless) 'USB selection failed'
Assert-True ($devices[1].State -eq 'unauthorized') 'Authorization state was lost'
Assert-True ($devices[2].Wireless -and $devices[3].Wireless) 'Wireless device identity failed'
Assert-True $devices[4].Emulator 'Emulator was treated as a physical USB phone'
Test-FocusEndpoint '192.168.1.8:37123';Test-FocusEndpoint '[fe80::1]:37123'
foreach($endpoint in @('192.168.1.8','192.168.1.8:0','192.168.1.8:65536','192.168.1.8:1234 --evil','-bad:1234')){Assert-Fails {Test-FocusEndpoint $endpoint} 'IP:'}
$identity=Get-FocusApkIdentity @("package: name='com.focusmatrix.mobile' versionCode='3' versionName='1.0.2'")
Assert-True ($identity.VersionCode -eq 3 -and $identity.VersionName -eq '1.0.2') 'APK version check failed'
Assert-Fails {Get-FocusApkIdentity @("package: name='another.app' versionCode='3' versionName='1.0.2'")} 'APK'
$powershell=(Get-Command powershell.exe).Source
$normal=Invoke-FocusAdb $powershell @('-NoProfile','-Command',"[Console]::Error.WriteLine('daemon startup notice'); Write-Output 'ready'; exit 0")
Assert-True (($normal -join "`n").Contains('ready')) 'Normal native stderr broke Windows PowerShell deployment'
Assert-Fails {Invoke-FocusAdb $powershell @('-NoProfile','-Command',"Write-Output 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]'; exit 1")} '签名不一致'
Assert-Fails {Invoke-FocusAdb $powershell @('-NoProfile','-Command',"Write-Output 'Failure [INSTALL_FAILED_VERSION_DOWNGRADE]'; exit 1")} '较新版本'
Assert-Fails {Invoke-FocusAdbPair $powershell '192.168.1.8:1234' -NonInteractive} '-NonInteractive'
Write-Output 'PASS: USB/wireless selection, authorization, APK identity, invalid endpoints, signature mismatch and downgrade protection.'
