[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('jdk','platform','build-tools','platform-tools')][string]$Package)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) '.android-tools'))
$packages=@{
 'jdk'=@{Url='https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip';Hash='f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e';Algorithm='SHA256'}
 'platform'=@{Url='https://dl.google.com/android/repository/platform-36_r02.zip';Hash='2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576';Algorithm='SHA1'}
 'build-tools'=@{Url='https://dl.google.com/android/repository/build-tools_r36_windows.zip';Hash='f16ccffd34de8790dede813a6c7d8e2c11a27b50';Algorithm='SHA1'}
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
if($Package -eq 'platform-tools'){
 # Resolve Google's current stable Windows archive and its published checksum.
 $metadata=Join-Path $root 'repository2-1.xml'
 Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-1.xml' -OutFile $metadata -TimeoutSec 90 -UseBasicParsing
 [xml]$repository=Get-Content -LiteralPath $metadata -Raw
 $remote=$repository.SelectSingleNode("//*[local-name()='remotePackage' and @path='platform-tools' and *[local-name()='channelRef' and @ref='channel-0']]")
 if(-not $remote){throw 'Official stable platform-tools package was not found'}
 $windows=$remote.SelectSingleNode("*[local-name()='archives']/*[local-name()='archive' and *[local-name()='host-os' and text()='windows']]/*[local-name()='complete']")
 if(-not $windows){throw 'Official Windows platform-tools archive was not found'}
 $file=[string]$windows.url
 if($file -notmatch '^platform-tools_r[0-9.]+-win\.zip$'){throw 'Unexpected official platform-tools archive path'}
 $checksum=$windows.SelectSingleNode("*[local-name()='checksum']")
 if(($checksum.GetAttribute('type') -ne '' -and $checksum.GetAttribute('type') -ne 'sha1') -or $checksum.InnerText -notmatch '^[a-fA-F0-9]{40}$'){throw 'Invalid published platform-tools checksum'}
 $packages[$Package]=@{Url=('https://dl.google.com/android/repository/'+$file);Hash=$checksum.InnerText;Algorithm='SHA1'}
}
$item=$packages[$Package]
$archive=Join-Path $root ($Package+'.zip');$destination=Join-Path $root $Package
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $item.Url -OutFile $archive -TimeoutSec 900 }
if ((Get-FileHash -LiteralPath $archive -Algorithm $item.Algorithm).Hash -ne $item.Hash) { throw "Official archive checksum mismatch: $Package" }
if (-not (Test-Path -LiteralPath $destination)) { Expand-Archive -LiteralPath $archive -DestinationPath $destination }
Write-Output "$Package installed with official checksum verification."
