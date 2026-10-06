Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$target=[IO.Path]::GetFullPath((Join-Path $root 'outputs/apk-ui-assets'))
$outputRoot=[IO.Path]::GetFullPath((Join-Path $root 'outputs'))+[IO.Path]::DirectorySeparatorChar
if(-not $target.StartsWith($outputRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'APK extraction must stay inside outputs'}
if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}
New-Item -ItemType Directory -Force -Path $target | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $root 'outputs/FocusMatrix-Android.apk'))
try{foreach($entry in $zip.Entries){
 if(-not $entry.FullName.StartsWith('assets/mobile/')){continue}
 $destination=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName.Substring(7)))
 if(-not $destination.StartsWith($target+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe APK asset path'}
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
 [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination)
}}finally{$zip.Dispose()}
Push-Location -LiteralPath $root
try{node scripts/check-apk-ui.mjs;if($LASTEXITCODE -ne 0){throw 'APK browser startup test failed'}}finally{Pop-Location}
