$ErrorActionPreference='Stop'
if ($env:CI -ne 'true') { throw 'Run MSI validation on the isolated CI runner.' }
$version=(Get-Content -Raw package.json | ConvertFrom-Json).version
$msi=(Get-Item -LiteralPath "release/native-packages/Re-Edit-PDF-$version-windows-x64.msi").FullName
$folder=Join-Path $env:TEMP ('ReEditPDF-MSI-Test-'+[guid]::NewGuid().ToString('N'))
$log=Join-Path $env:TEMP ('ReEditPDF-MSI-Log-'+[guid]::NewGuid().ToString('N')+'.txt')
$install=Start-Process msiexec.exe -ArgumentList @('/i',('"'+$msi+'"'),'/qn','/norestart',('INSTALLDIR="'+$folder+'"'),'/L*v',('"'+$log+'"')) -WindowStyle Hidden -PassThru -Wait
if ($install.ExitCode -notin @(0,3010)) { Get-Content -LiteralPath $log -Tail 60; throw "MSI install failed: $($install.ExitCode)" }
$binary=Join-Path $folder 'Re-Edit-PDF.exe'
if (!(Test-Path -LiteralPath $binary)) { throw 'MSI did not install the application to the requested directory' }
foreach($runtime in @('vcruntime140.dll','msvcp140.dll')) { if (!(Test-Path -LiteralPath (Join-Path $folder $runtime))) { throw "MSI omitted $runtime" } }
$app=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
$deadline=(Get-Date).AddSeconds(35)
while (!$app.MainWindowHandle -and !$app.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200; $app.Refresh() }
if (!$app.MainWindowHandle) { throw 'MSI-installed application did not show its window' }
$app.CloseMainWindow() | Out-Null
if (!$app.WaitForExit(15000)) { throw 'MSI-installed application did not close normally' }
$uninstall=Start-Process msiexec.exe -ArgumentList @('/x',('"'+$msi+'"'),'/qn','/norestart') -WindowStyle Hidden -PassThru -Wait
if ($uninstall.ExitCode -notin @(0,3010)) { throw "MSI uninstall failed: $($uninstall.ExitCode)" }
if (Test-Path -LiteralPath $binary) { throw 'MSI uninstall left the installed executable behind' }
@{passed=$true;version=$version;checks=@('MSI installs','runtime DLLs present','installed app opens','installed app closes','MSI uninstalls')} | ConvertTo-Json | Set-Content -LiteralPath release/native-validation/tauri/windows-msi-result.json
