$ErrorActionPreference = 'Stop'
$version = (Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).version
$installer = Get-Item -LiteralPath "release/Re-Edit PDF-Setup-$version.exe"
$installPath = Join-Path $env:TEMP ('ReEditPDF-Installer-Test-' + [guid]::NewGuid().ToString('N'))
$process = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installPath") -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)" }
$binary = Get-Item -LiteralPath (Join-Path $installPath 'Re-Edit-PDF.exe')
if ($binary.VersionInfo.ProductVersion -notlike "$version*") { throw 'Installed version is incorrect' }
$documentIcon = Join-Path $installPath 'resources/document.ico'
if (!(Test-Path -LiteralPath $documentIcon)) { throw 'PDF document icon was not installed' }
$registeredIcon = (Get-Item -LiteralPath 'Registry::HKEY_CURRENT_USER\Software\Classes\ReEdit.PDF\DefaultIcon').GetValue('')
if ($registeredIcon -ne ('"' + $documentIcon.Replace('/', '\') + '",0')) { throw "Unexpected document icon registration: $registeredIcon" }
$association = Get-Item -LiteralPath 'Registry::HKEY_CURRENT_USER\Software\ReEditPDF\Capabilities\FileAssociations'
if ($association.GetValue('.pdf') -ne 'ReEdit.PDF') { throw 'Default-app capabilities missing' }
$installedFiles = @('resources/app.asar', 'resources/document.ico')
foreach ($file in $installedFiles) { if (!(Test-Path -LiteralPath (Join-Path $installPath $file))) { throw "Missing installed file: $file" } }
foreach ($font in @('fontkit', 'lato', 'libre-baskerville', 'noto-sans', 'noto-serif', 'open-sans', 'roboto', 'source-code-pro', 'ubuntu')) {
  if (!(Test-Path -LiteralPath (Join-Path $installPath "resources/font-licenses/$font-LICENSE.txt"))) { throw "Missing license notice: $font" }
}
$uninstallers = @(Get-ChildItem -LiteralPath $installPath -Filter '*Uninstall*.exe' -File)
if ($uninstallers.Count -ne 1) { throw 'Expected one installed uninstaller' }
$uninstaller = $uninstallers[0].FullName
$process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Uninstaller exited $($process.ExitCode)" }
$deadline = (Get-Date).AddSeconds(45)
while ((Test-Path -LiteralPath $binary.FullName) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
if (Test-Path -LiteralPath $binary.FullName) { throw 'Uninstaller did not remove the app' }
if (Test-Path -LiteralPath 'Registry::HKEY_CURRENT_USER\Software\Classes\ReEdit.PDF') { throw 'PDF registration left after uninstall' }
@{ passed = $true; checks = @('silent installer exits successfully', "installed version $version", 'separate PDF document icon', 'Windows default-app capabilities', 'installed resources', 'silent uninstall removes app and registry') } | ConvertTo-Json | Set-Content -LiteralPath 'release/windows-installer-result.json'
