[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$tools=Join-Path $root '.android-tools'
$jdk=(Get-ChildItem (Join-Path $tools 'jdk') -Directory | Select-Object -First 1).FullName
$bt=Join-Path $tools 'build-tools/android-16'
$androidJar=Join-Path $tools 'platform/android-36/android.jar'
$env:JAVA_HOME=$jdk
$env:Path=(Join-Path $jdk 'bin')+';'+$env:Path
$build=Join-Path $root 'mobile-app/build'
$signing=Join-Path $root 'mobile-app/signing'
if((Test-Path -LiteralPath (Join-Path $root 'outputs/FocusMatrix-Android.apk')) -and -not(Test-Path -LiteralPath (Join-Path $signing 'focus-matrix.jks'))){throw 'Existing APK requires its original signing key. Build stopped to protect updates.'}
foreach($directory in @($build,$signing,(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Join-Path $build 'generated'),(Join-Path $build 'assets/mobile'))){New-Item -ItemType Directory -Force -Path $directory | Out-Null}
function RunChecked([string]$executable,[string[]]$arguments){ & $executable @arguments; if($LASTEXITCODE -ne 0){throw "Android build step failed: $executable"} }
RunChecked (Join-Path $root 'cloud-site/node_modules/.bin/vite.cmd') @('build','--config',(Join-Path $root 'cloud-site/mobile-web/vite.config.ts'))
$assetDirectory=[IO.Path]::GetFullPath((Join-Path $build 'assets'))
$expectedBuild=[IO.Path]::GetFullPath($build)+[IO.Path]::DirectorySeparatorChar
if(-not $assetDirectory.StartsWith($expectedBuild,[StringComparison]::OrdinalIgnoreCase)){throw 'Asset path must stay within mobile-app/build'}
if(Test-Path -LiteralPath $assetDirectory){Remove-Item -LiteralPath $assetDirectory -Recurse -Force}
New-Item -ItemType Directory -Force -Path (Join-Path $assetDirectory 'mobile') | Out-Null
Copy-Item -Path (Join-Path $root 'cloud-site/public/mobile/*') -Destination (Join-Path $build 'assets/mobile') -Recurse -Force
# Never remove an earlier signed APK or the stable signing key.
$output=Join-Path $root 'outputs/FocusMatrix-Android.apk'
$archive=$null
if(Test-Path -LiteralPath $output){$archive=Join-Path $root ('outputs/android-versions/'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'));New-Item -ItemType Directory -Force -Path $archive | Out-Null;Copy-Item -LiteralPath $output -Destination $archive}
$compiled='mobile-app/build/resources.zip'
RunChecked (Join-Path $bt 'aapt2.exe') @('compile','--dir','mobile-app/res','-o',$compiled)
$unsigned='mobile-app/build/unsigned.apk'
RunChecked (Join-Path $bt 'aapt2.exe') @('link','-o',$unsigned,'-I','.android-tools/platform/android-36/android.jar','--manifest','mobile-app/AndroidManifest.xml','-A','mobile-app/build/assets','--min-sdk-version','26','--target-sdk-version','36',$compiled,'--java','mobile-app/build/generated')
$sources=@(Get-ChildItem (Join-Path $root 'mobile-app/src') -Filter '*.java' -Recurse | ForEach-Object FullName)+@(Get-ChildItem (Join-Path $build 'generated') -Filter '*.java' -Recurse | ForEach-Object FullName)
RunChecked (Join-Path $jdk 'bin/javac.exe') (@('-encoding','UTF-8','-source','8','-target','8','-bootclasspath',$androidJar,'-d',(Join-Path $build 'classes'))+$sources)
$classes=Join-Path $build 'classes.jar'
RunChecked (Join-Path $jdk 'bin/jar.exe') @('cf',$classes,'-C',(Join-Path $build 'classes'),'.')
RunChecked (Join-Path $bt 'd8.bat') @('--release','--min-api','26','--lib',$androidJar,'--output',(Join-Path $build 'dex'),$classes)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zip=[IO.Compression.ZipFile]::Open($unsigned,[IO.Compression.ZipArchiveMode]::Update)
try{
 # Windows aapt2 emits backslashes in asset entry names. Android AssetManager
 # requires ZIP paths with forward slashes, including every directory segment.
 foreach($entry in @($zip.Entries | Where-Object {$_.FullName.Contains('\')})){
  $normalized=$entry.FullName.Replace('\','/')
  if($zip.GetEntry($normalized)){throw "Duplicate normalized APK entry: $normalized"}
  $replacement=$zip.CreateEntry($normalized,[IO.Compression.CompressionLevel]::Optimal)
  $inputStream=$entry.Open();$outputStream=$replacement.Open()
  try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
  $entry.Delete()
 }
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $build 'dex/classes.dex'),'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null
}finally{$zip.Dispose()}
# Exercise the exact homepage reader used by the Activity, against the APK.
$testClasses=Join-Path $build 'test-classes'
New-Item -ItemType Directory -Force -Path $testClasses | Out-Null
RunChecked (Join-Path $jdk 'bin/javac.exe') @('-encoding','UTF-8','-d',$testClasses,(Join-Path $root 'mobile-app/src/com/focusmatrix/mobile/BundledPage.java'),(Join-Path $root 'mobile-app/tests/ApkAssetsTest.java'))
if($archive){
 $oldApk=Join-Path $archive 'FocusMatrix-Android.apk'
 $oldZip=[IO.Compression.ZipFile]::OpenRead($oldApk)
 try{$oldMissing=$null -eq $oldZip.GetEntry('assets/mobile/index.html')}finally{$oldZip.Dispose()}
 if($oldMissing){RunChecked (Join-Path $jdk 'bin/java.exe') @('-cp',$testClasses,'ApkAssetsTest',$oldApk,'--expect-broken')}
}
RunChecked (Join-Path $jdk 'bin/java.exe') @('-cp',$testClasses,'ApkAssetsTest',$unsigned)
$aligned='mobile-app/build/aligned.apk'
RunChecked (Join-Path $bt 'zipalign.exe') @('-P','16','-f','4',$unsigned,$aligned)
$keystore=Join-Path $signing 'focus-matrix.jks'
$secret=Join-Path $signing 'password.dpapi'
Add-Type -AssemblyName System.Security
if(-not(Test-Path -LiteralPath $secret)){
 if(Test-Path -LiteralPath $keystore){throw 'Signing password missing: preserve the existing key and recover its password first.'}
 $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
 [IO.File]::WriteAllBytes($secret,[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([Convert]::ToBase64String($bytes)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
}
$env:FOCUSMATRIX_KEYSTORE_PASSWORD=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($secret),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
try{
 if(-not(Test-Path -LiteralPath $keystore)){RunChecked (Join-Path $jdk 'bin/keytool.exe') @('-genkeypair','-keystore',$keystore,'-alias','focus-matrix','-keyalg','RSA','-keysize','3072','-validity','10000','-storepass:env','FOCUSMATRIX_KEYSTORE_PASSWORD','-keypass:env','FOCUSMATRIX_KEYSTORE_PASSWORD','-dname','CN=Focus Matrix, O=Focus Matrix, C=CN')}
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
 RunChecked (Join-Path $bt 'apksigner.bat') @('sign','--ks',$keystore,'--ks-key-alias','focus-matrix','--ks-pass','env:FOCUSMATRIX_KEYSTORE_PASSWORD','--out',$output,$aligned)
}finally{Remove-Item Env:FOCUSMATRIX_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue}
RunChecked (Join-Path $bt 'zipalign.exe') @('-c','-P','16','4','outputs/FocusMatrix-Android.apk')
RunChecked (Join-Path $bt 'apksigner.bat') @('verify','--verbose','--print-certs',$output)
RunChecked (Join-Path $bt 'aapt2.exe') @('dump','badging','outputs/FocusMatrix-Android.apk')
New-Item -ItemType Directory -Force -Path (Join-Path $root 'cloud-site/public/downloads') | Out-Null
Copy-Item -LiteralPath $output -Destination (Join-Path $root 'cloud-site/public/downloads/FocusMatrix-Android.apk') -Force
Get-FileHash -LiteralPath $output -Algorithm SHA256
Write-Output ('Signed Android APK: '+$output)

